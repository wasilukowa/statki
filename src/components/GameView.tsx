import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import Board from './Board'
import type { CellState } from './Board'
import { SHIPS } from './ShipPanel'

type Shot = {
  id: string
  shooter_id: string
  row: number
  col: number
  hit: boolean
  created_at: string
}

type PlacedShip = {
  shipId: string
  cells: { row: number; col: number }[]
}

type Props = {
  gameId: string
  myBoardCells: CellState[][]
  myPlacedShips: PlacedShip[]
  onNewGame: () => void
}

// Sprawdza czy statek jest w całości zatopiony
function isSunk(ship: PlacedShip, hits: Array<{ row: number; col: number }>): boolean {
  return ship.cells.every(c => hits.some(h => h.row === c.row && h.col === c.col))
}

// Unikalna sygnatura statku (do śledzenia powiadomień)
function shipKey(ship: PlacedShip): string {
  return ship.cells.map(c => `${c.row}:${c.col}`).sort().join('|')
}

function buildMyBoard(base: CellState[][], opponentShots: Shot[], myShips: PlacedShip[]): CellState[][] {
  const grid = base.map(r => [...r]) as CellState[][]
  const hits = opponentShots.filter(s => s.hit)
  for (const s of opponentShots) grid[s.row][s.col] = s.hit ? 'hit' : 'miss'
  // Nadpisz zatopione statki
  for (const ship of myShips) {
    if (isSunk(ship, hits)) {
      for (const c of ship.cells) grid[c.row][c.col] = 'sunk'
    }
  }
  return grid
}

function buildOpponentBoard(myShots: Shot[], opponentShips: PlacedShip[]): CellState[][] {
  const grid: CellState[][] = Array.from({ length: 10 }, () => Array(10).fill('empty'))
  const hits = myShots.filter(s => s.hit)
  for (const s of myShots) grid[s.row][s.col] = s.hit ? 'hit' : 'miss'
  // Nadpisz zatopione statki
  for (const ship of opponentShips) {
    if (isSunk(ship, hits)) {
      for (const c of ship.cells) grid[c.row][c.col] = 'sunk'
    }
  }
  return grid
}

export default function GameView({ gameId, myBoardCells, myPlacedShips, onNewGame }: Props) {
  const myId = sessionStorage.getItem('player-id')!

  const [currentTurn, setCurrentTurn] = useState<string | null>(null)
  const [opponentId, setOpponentId] = useState<string | null>(null)
  const [shots, setShots] = useState<Shot[]>([])
  const [opponentShips, setOpponentShips] = useState<PlacedShip[]>([])
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<string | null>(null)
  const [winnerId, setWinnerId] = useState<string | null>(null)

  // Zbiór kluczy już zgłoszonych zatopionych statków — żeby nie pokazywać dwa razy
  const notifiedSunkRef = useRef(new Set<string>())
  // Flaga: pomijamy powiadomienia przy pierwszym ładowaniu strzałów z bazy
  const initialLoadDoneRef = useRef(false)

  // Pobierz dane startowe
  useEffect(() => {
    async function load() {
      const [{ data: game }, { data: shotsData }] = await Promise.all([
        supabase.from('games').select('current_turn, player1_id, player2_id, status, winner_id').eq('id', gameId).single(),
        supabase.from('shots').select('*').eq('game_id', gameId).order('created_at'),
      ])

      if (game) {
        setCurrentTurn(game.current_turn)
        if (game.status === 'finished') setWinnerId(game.winner_id)
        const oppId = game.player1_id === myId ? game.player2_id : game.player1_id
        setOpponentId(oppId)

        if (oppId) {
          const { data: board } = await supabase
            .from('boards').select('ships')
            .eq('game_id', gameId).eq('player_id', oppId).single()
          if (board?.ships) setOpponentShips(board.ships)
        }
      }

      if (shotsData) {
        setShots(shotsData)
        // Oznacz wszystkie już zatopione statki jako "już zgłoszone" — bez powiadomień
        const hits = shotsData.filter(s => s.hit)
        for (const ship of myPlacedShips) {
          if (isSunk(ship, hits)) notifiedSunkRef.current.add(shipKey(ship))
        }
        // opponentShips jest ładowane asynchronicznie, więc ich obsłuży inny effect
      }

      setLoading(false)
      initialLoadDoneRef.current = true
    }

    load()
  }, [gameId, myId, myPlacedShips])

  // Subskrypcje Realtime — nowe strzały i zmiany tury
  useEffect(() => {
    const shotsChannel = supabase
      .channel(`shots:${gameId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shots', filter: `game_id=eq.${gameId}` },
        payload => {
          const shot = payload.new as Shot
          setShots(prev => prev.some(s => s.id === shot.id) ? prev : [...prev, shot])
        }
      )
      .subscribe()

    const gameChannel = supabase
      .channel(`game-view:${gameId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        payload => {
          setCurrentTurn(payload.new.current_turn)
          if (payload.new.status === 'finished') setWinnerId(payload.new.winner_id)
          if (payload.new.status === 'playing') {
            setOpponentId(currentOppId => {
              if (currentOppId && opponentShips.length === 0) {
                supabase.from('boards').select('ships')
                  .eq('game_id', gameId).eq('player_id', currentOppId).single()
                  .then(({ data }) => { if (data?.ships) setOpponentShips(data.ships) })
              }
              return currentOppId
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(shotsChannel)
      supabase.removeChannel(gameChannel)
    }
  }, [gameId])

  // Wykrywanie nowo zatopionych statków po każdej zmianie strzałów
  useEffect(() => {
    if (!initialLoadDoneRef.current) return

    const myHits   = shots.filter(s => s.shooter_id === myId       && s.hit)
    const oppHits  = shots.filter(s => s.shooter_id !== myId       && s.hit)

    function checkSunk(ships: PlacedShip[], hits: typeof myHits, label: (name: string) => string) {
      for (const ship of ships) {
        const key = shipKey(ship)
        if (notifiedSunkRef.current.has(key)) continue
        if (isSunk(ship, hits)) {
          notifiedSunkRef.current.add(key)
          const name = SHIPS.find(s => s.id === ship.shipId)?.name ?? 'Statek'
          setNotification(label(name))
          setTimeout(() => setNotification(null), 3000)
        }
      }
    }

    checkSunk(opponentShips, myHits,  name => `Zatopiony: ${name}!`)
    checkSunk(myPlacedShips, oppHits, name => `Twój ${name} zatopiony!`)
  }, [shots, opponentShips, myPlacedShips, myId])

  async function handleShoot(row: number, col: number) {
    if (currentTurn !== myId || !opponentId) return
    if (shots.some(s => s.shooter_id === myId && s.row === row && s.col === col)) return

    const allShipCells = opponentShips.flatMap(s => s.cells)
    const hit = allShipCells.some(c => c.row === row && c.col === col)

    await supabase.from('shots').insert({ game_id: gameId, shooter_id: myId, row, col, hit })

    if (hit) {
      // Sprawdź czy wszystkie statki przeciwnika są zatopione
      const allHits = [...shots.filter(s => s.shooter_id === myId && s.hit), { row, col }]
      const allSunk = opponentShips.every(ship => isSunk(ship, allHits))
      if (allSunk) {
        await supabase.from('games')
          .update({ status: 'finished', winner_id: myId, current_turn: null })
          .eq('id', gameId)
      }
      // Tura zostaje przy strzelającym (trafienie)
    } else {
      // Pudło — tura przechodzi na przeciwnika
      await supabase.from('games').update({ current_turn: opponentId }).eq('id', gameId)
    }
  }

  if (loading) {
    return (
      <div className="h-full bg-gray-900 flex items-center justify-center">
        <p className="text-gray-400">Ładowanie gry…</p>
      </div>
    )
  }

  const myShots       = shots.filter(s => s.shooter_id === myId)
  const opponentShots = shots.filter(s => s.shooter_id !== myId)
  const isMyTurn      = currentTurn === myId
  const gameStarted   = currentTurn !== null
  const iWon          = winnerId === myId

  // Ekran końca gry
  if (winnerId) {
    const allShots = shots
    const myHits  = myShots.filter(s => s.hit).length
    const myTotal = myShots.length

    // Czas gry: od pierwszego do ostatniego strzału
    let durationStr = '—'
    if (allShots.length >= 2) {
      const times = allShots.map(s => new Date(s.created_at).getTime())
      const ms = Math.max(...times) - Math.min(...times)
      const secs = Math.floor(ms / 1000)
      const mm = String(Math.floor(secs / 60)).padStart(2, '0')
      const ss = String(secs % 60).padStart(2, '0')
      durationStr = `${mm}:${ss}`
    }

    return (
      <div className="h-full overflow-y-auto bg-gray-900 flex flex-col items-center justify-center gap-6 p-6">
        <div className="text-7xl">{iWon ? '🏆' : '💀'}</div>
        <h2 className={`text-4xl font-bold tracking-tight ${iWon ? 'text-yellow-300' : 'text-gray-400'}`}>
          {iWon ? 'Wygrałeś!' : 'Przegrałeś!'}
        </h2>

        {/* Statystyki */}
        <div className="flex gap-6 mt-2">
          <div className="bg-gray-800 border border-gray-700 rounded-xl px-6 py-4 flex flex-col items-center gap-1">
            <span className="text-gray-500 text-xs uppercase tracking-widest">Czas gry</span>
            <span className="text-white text-2xl font-mono font-bold">{durationStr}</span>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl px-6 py-4 flex flex-col items-center gap-1">
            <span className="text-gray-500 text-xs uppercase tracking-widest">Moje strzały</span>
            <span className="text-white text-2xl font-mono font-bold">{myTotal}</span>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl px-6 py-4 flex flex-col items-center gap-1">
            <span className="text-gray-500 text-xs uppercase tracking-widest">Trafienia</span>
            <span className="text-white text-2xl font-mono font-bold">{myHits}</span>
          </div>
        </div>

        {/* Plansze */}
        <div className="flex flex-col gap-6 mt-2 xl:flex-row xl:gap-12 items-center xl:items-start">
          <div className="flex flex-col gap-2 items-center">
            <h3 className="text-gray-400 text-xs font-semibold tracking-widest uppercase">Moja plansza</h3>
            <Board cells={buildMyBoard(myBoardCells, opponentShots, myPlacedShips)} onCellClick={() => {}} />
          </div>
          <div className="flex flex-col gap-2 items-center">
            <h3 className="text-gray-400 text-xs font-semibold tracking-widest uppercase">Plansza przeciwnika</h3>
            <Board cells={buildOpponentBoard(myShots, opponentShips)} onCellClick={() => {}} />
          </div>
        </div>

        <button
          onClick={onNewGame}
          className="mt-2 px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors cursor-pointer"
        >
          Nowa gra
        </button>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-900 flex flex-col items-center justify-center gap-4 p-6">

      {/* Wskaźnik tury */}
      <div className={`
        px-6 py-2 rounded-full text-sm font-bold transition-all
        ${!gameStarted
          ? 'bg-gray-800 border border-gray-700 text-gray-500'
          : isMyTurn
            ? 'bg-green-600 text-white shadow-lg shadow-green-900/40'
            : 'bg-gray-700 text-gray-300'
        }
      `}>
        {!gameStarted
          ? 'Oczekiwanie na gotowość przeciwnika…'
          : isMyTurn ? 'Twoja tura — wybierz cel' : 'Tura przeciwnika'}
      </div>

      {/* Powiadomienie o zatopieniu */}
      <div className="h-8 flex items-center justify-center">
        {notification && (
          <div className="px-4 py-1.5 rounded-lg bg-orange-700 text-white text-sm font-bold animate-pulse">
            {notification}
          </div>
        )}
      </div>

      {/* Plansze */}
      <div className="flex flex-col gap-8 xl:flex-row xl:gap-16 items-center xl:items-start">

        <div className="flex flex-col gap-2 items-center">
          <h2 className="text-gray-400 text-xs font-semibold tracking-widest uppercase">Moja plansza</h2>
          <Board
            cells={buildMyBoard(myBoardCells, opponentShots, myPlacedShips)}
            onCellClick={() => {}}
          />
        </div>

        <div className="flex flex-col gap-2 items-center">
          <h2 className="text-gray-400 text-xs font-semibold tracking-widest uppercase">Plansza przeciwnika</h2>
          <div className={`transition-opacity ${isMyTurn && gameStarted ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <Board
              cells={buildOpponentBoard(myShots, opponentShips)}
              onCellClick={handleShoot}
            />
          </div>
        </div>

      </div>
    </div>
  )
}
