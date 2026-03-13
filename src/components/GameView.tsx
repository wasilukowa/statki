import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Board from './Board'
import type { CellState } from './Board'

type Shot = {
  id: string
  shooter_id: string
  row: number
  col: number
  hit: boolean
}

type PlacedShip = {
  shipId: string
  cells: { row: number; col: number }[]
}

type Props = {
  gameId: string
  myBoardCells: CellState[][]
}

// Nakłada strzały przeciwnika na moją planszę
function buildMyBoard(base: CellState[][], opponentShots: Shot[]): CellState[][] {
  const grid = base.map(r => [...r]) as CellState[][]
  for (const s of opponentShots) grid[s.row][s.col] = s.hit ? 'hit' : 'miss'
  return grid
}

// Buduje planszę przeciwnika — widać tylko moje strzały, statki ukryte
function buildOpponentBoard(myShots: Shot[]): CellState[][] {
  const grid: CellState[][] = Array.from({ length: 10 }, () => Array(10).fill('empty'))
  for (const s of myShots) grid[s.row][s.col] = s.hit ? 'hit' : 'miss'
  return grid
}

export default function GameView({ gameId, myBoardCells }: Props) {
  const myId = sessionStorage.getItem('player-id')!

  const [currentTurn, setCurrentTurn] = useState<string | null>(null)
  const [opponentId, setOpponentId] = useState<string | null>(null)
  const [shots, setShots] = useState<Shot[]>([])
  const [opponentShips, setOpponentShips] = useState<PlacedShip[]>([])
  const [loading, setLoading] = useState(true)

  // Pobierz dane startowe
  useEffect(() => {
    async function load() {
      const [{ data: game }, { data: shotsData }] = await Promise.all([
        supabase.from('games').select('current_turn, player1_id, player2_id').eq('id', gameId).single(),
        supabase.from('shots').select('*').eq('game_id', gameId).order('created_at'),
      ])

      if (game) {
        setCurrentTurn(game.current_turn)
        const oppId = game.player1_id === myId ? game.player2_id : game.player1_id
        setOpponentId(oppId)

        if (oppId) {
          const { data: board } = await supabase
            .from('boards').select('ships')
            .eq('game_id', gameId).eq('player_id', oppId).single()
          if (board?.ships) setOpponentShips(board.ships)
        }
      }

      if (shotsData) setShots(shotsData)
      setLoading(false)
    }

    load()
  }, [gameId, myId])

  // Subskrypcje Realtime — nowe strzały i zmiany tury
  useEffect(() => {
    const shotsChannel = supabase
      .channel(`shots:${gameId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shots', filter: `game_id=eq.${gameId}` },
        payload => {
          const shot = payload.new as Shot
          // Deduplikacja — Realtime może dostarczyć to samo zdarzenie dwukrotnie po reconnect
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
          // Wczytaj planszę przeciwnika gdy status zmieni się na playing
          // opponentId pobieramy z aktualnego stanu przez setter funkcyjny
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
  }, [gameId])  // gameId jest stabilne — nie przebudowujemy kanałów przy zmianie opponentId

  async function handleShoot(row: number, col: number) {
    if (currentTurn !== myId || !opponentId) return
    if (shots.some(s => s.shooter_id === myId && s.row === row && s.col === col)) return

    const allShipCells = opponentShips.flatMap(s => s.cells)
    const hit = allShipCells.some(c => c.row === row && c.col === col)

    await supabase.from('shots').insert({ game_id: gameId, shooter_id: myId, row, col, hit })

    // Trafienie — gracz strzela ponownie (tura nie przechodzi)
    // Pudło — tura przechodzi na przeciwnika
    if (!hit) {
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

  const myShots = shots.filter(s => s.shooter_id === myId)
  const opponentShots = shots.filter(s => s.shooter_id !== myId)
  const isMyTurn = currentTurn === myId
  const gameStarted = currentTurn !== null

  return (
    <div className="h-full overflow-y-auto bg-gray-900 flex flex-col items-center justify-center gap-6 p-6">

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
          : isMyTurn
            ? 'Twoja tura — wybierz cel'
            : 'Tura przeciwnika'
        }
      </div>

      {/* Plansze */}
      <div className="flex flex-col gap-8 xl:flex-row xl:gap-16 items-center xl:items-start">

        {/* Moja plansza */}
        <div className="flex flex-col gap-2 items-center">
          <h2 className="text-gray-400 text-xs font-semibold tracking-widest uppercase">
            Moja plansza
          </h2>
          <Board
            cells={buildMyBoard(myBoardCells, opponentShots)}
            onCellClick={() => {}}
          />
        </div>

        {/* Plansza przeciwnika */}
        <div className="flex flex-col gap-2 items-center">
          <h2 className="text-gray-400 text-xs font-semibold tracking-widest uppercase">
            Plansza przeciwnika
          </h2>
          <div className={`transition-opacity ${isMyTurn && gameStarted ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <Board
              cells={buildOpponentBoard(myShots)}
              onCellClick={handleShoot}
            />
          </div>
        </div>

      </div>
    </div>
  )
}
