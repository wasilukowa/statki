import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Board from './components/Board'
import type { CellState, PreviewCell } from './components/Board'
import ShipPanel from './components/ShipPanel'
import { SHIPS } from './components/ShipPanel'
import Lobby from './components/Lobby'
import GameView from './components/GameView'

// Postawiony egzemplarz statku — śledzimy komórki, żeby móc go usunąć
type PlacedShip = {
  shipId: string
  cells: { row: number; col: number }[]
}

function emptyGrid(): CellState[][] {
  return Array.from({ length: 10 }, () => Array(10).fill('empty'))
}

// Oblicza komórki które zajmie statek
function shipCells(row: number, col: number, size: number, orientation: 'H' | 'V') {
  return Array.from({ length: size }, (_, i) => ({
    row: orientation === 'V' ? row + i : row,
    col: orientation === 'H' ? col + i : col,
  }))
}

// Sprawdza czy pozycja jest dozwolona:
// - statek musi w całości mieścić się w siatce
// - nie może nachodzić na inny statek
// - nie może stykać się z innym statkiem (8 kierunków)
function isPlacementValid(
  cells: CellState[][],
  toPlace: { row: number; col: number }[],
): boolean {
  const placedSet = new Set(toPlace.map(c => `${c.row},${c.col}`))
  return toPlace.every(({ row: r, col: c }) => {
    if (r < 0 || r > 9 || c < 0 || c > 9) return false
    if (cells[r][c] === 'ship') return false
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const nr = r + dr
        const nc = c + dc
        if (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 9
            && !placedSet.has(`${nr},${nc}`)
            && cells[nr][nc] === 'ship') {
          return false
        }
      }
    }
    return true
  })
}

// Oblicza komórki podglądu dla wybranego statku i pozycji kursora
function computePreview(
  cells: CellState[][],
  row: number,
  col: number,
  size: number,
  orientation: 'H' | 'V',
): PreviewCell[] {
  const toPlace = shipCells(row, col, size, orientation)
  const valid = isPlacementValid(cells, toPlace)
  return toPlace
    .filter(c => c.row >= 0 && c.row <= 9 && c.col >= 0 && c.col <= 9)
    .map(c => ({ ...c, valid }))
}

// Wykrywa orientację statku na podstawie jego komórek
function detectOrientation(cells: { row: number; col: number }[]): 'H' | 'V' {
  return cells.every(c => c.row === cells[0].row) ? 'H' : 'V'
}

// Losuje rozmieszczenie wszystkich statków spełniające zasady gry
function randomizeShips(): { cells: CellState[][]; placedShips: PlacedShip[] } {
  const cells = emptyGrid()
  const placedShips: PlacedShip[] = []

  for (const ship of SHIPS) {
    for (let n = 0; n < ship.total; n++) {
      for (let attempt = 0; attempt < 2000; attempt++) {
        const orientation: 'H' | 'V' = Math.random() < 0.5 ? 'H' : 'V'
        const row = Math.floor(Math.random() * 10)
        const col = Math.floor(Math.random() * 10)
        const toPlace = shipCells(row, col, ship.size, orientation)
        if (isPlacementValid(cells, toPlace)) {
          for (const c of toPlace) cells[c.row][c.col] = 'ship'
          placedShips.push({ shipId: ship.id, cells: toPlace })
          break
        }
      }
    }
  }

  return { cells, placedShips }
}

export default function App() {
  const [gameId, setGameId] = useState<string | null>(null)
  const [pendingGameId, setPendingGameId] = useState<string | null>(null)
  const [gamePhase, setGamePhase] = useState<'placing' | 'playing'>('placing')
  const [myBoardCells, setMyBoardCells] = useState<CellState[][] | null>(null)
  const [myPlacedShips, setMyPlacedShips] = useState<PlacedShip[]>([])

  // Nasłuchuje na zmianę statusu gry (waiting → placing) po stronie gracza 1
  useEffect(() => {
    if (!pendingGameId) return

    const channel = supabase
      .channel(`game-status:${pendingGameId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${pendingGameId}` },
        payload => {
          if (payload.new.status === 'placing') setGameId(pendingGameId)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [pendingGameId])

  if (!gameId) {
    return (
      <Lobby
        pendingGameId={pendingGameId}
        onGameCreated={setPendingGameId}
        onGameJoined={setGameId}
      />
    )
  }

  function handleNewGame() {
    setGameId(null)
    setPendingGameId(null)
    setGamePhase('placing')
    setMyBoardCells(null)
    setMyPlacedShips([])
  }

  function handleGameReset() {
    setGamePhase('placing')
    setMyBoardCells(null)
    setMyPlacedShips([])
  }

  if (gamePhase === 'playing' && myBoardCells) {
    return (
      <GameView
        gameId={gameId}
        myBoardCells={myBoardCells}
        myPlacedShips={myPlacedShips}
        onNewGame={handleNewGame}
        onGameReset={handleGameReset}
      />
    )
  }

  return (
    <Game
      gameId={gameId}
      onLeave={handleNewGame}
      onPlacingDone={(cells, ships) => {
        setMyBoardCells(cells)
        setMyPlacedShips(ships)
        setGamePhase('playing')
      }}
    />
  )
}

function Game({ gameId, onLeave, onPlacingDone }: {
  gameId: string
  onLeave: () => void
  onPlacingDone: (cells: CellState[][], ships: PlacedShip[]) => void
}) {
  const [cells, setCells] = useState<CellState[][]>(emptyGrid)
  const [placedShips, setPlacedShips] = useState<PlacedShip[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [orientation, setOrientation] = useState<'H' | 'V'>('H')
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [opponentLeft, setOpponentLeft] = useState(false)

  useEffect(() => {
    const channel = supabase
      .channel(`game-placing:${gameId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        payload => { if (payload.new.status === 'abandoned') setOpponentLeft(true) }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [gameId])

  // Licznik postawionych statków — pochodna placedShips
  const placedCounts = placedShips.reduce<Record<string, number>>((acc, s) => {
    acc[s.shipId] = (acc[s.shipId] ?? 0) + 1
    return acc
  }, {})

  const allPlaced = SHIPS.every(s => (placedCounts[s.id] ?? 0) >= s.total)
  const anyPlaced = placedShips.length > 0
  const selectedShip = SHIPS.find(s => s.id === selectedId) ?? null

  // Podgląd aktualnej pozycji kursora
  const previewCells: PreviewCell[] =
    selectedShip && hoverCell
      ? computePreview(cells, hoverCell.row, hoverCell.col, selectedShip.size, orientation)
      : []

  const previewValid = previewCells.length > 0 && previewCells.every(p => p.valid)

  // Podświetlenie statku pod kursorem (gdy nie stawiamy innego statku)
  const highlightCells: { row: number; col: number }[] = (() => {
    if (!hoverCell || previewCells.length > 0) return []
    if (cells[hoverCell.row]?.[hoverCell.col] !== 'ship') return []
    const ship = placedShips.find(s =>
      s.cells.some(c => c.row === hoverCell.row && c.col === hoverCell.col)
    )
    return ship?.cells ?? []
  })()

  // Klawisz R obraca aktualnie wybrany statek
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'r' || e.key === 'R') {
        setOrientation(prev => (prev === 'H' ? 'V' : 'H'))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function handleCellClick(row: number, col: number) {
    // Kliknięcie na postawiony statek — podnieś go
    if (cells[row][col] === 'ship') {
      const idx = placedShips.findIndex(s => s.cells.some(c => c.row === row && c.col === col))
      if (idx !== -1) {
        const picked = placedShips[idx]
        setCells(prev => {
          const next = prev.map(r => [...r])
          for (const c of picked.cells) next[c.row][c.col] = 'empty'
          return next
        })
        setPlacedShips(prev => prev.filter((_, i) => i !== idx))
        setSelectedId(picked.shipId)
        setOrientation(detectOrientation(picked.cells))
        return
      }
    }

    if (!selectedShip) return
    const toPlace = shipCells(row, col, selectedShip.size, orientation)
    if (!isPlacementValid(cells, toPlace)) return

    setCells(prev => {
      const next = prev.map(r => [...r])
      for (const p of toPlace) next[p.row][p.col] = 'ship'
      return next
    })

    const newPlaced = [...placedShips, { shipId: selectedShip.id, cells: toPlace }]
    setPlacedShips(newPlaced)

    // Jeśli wyczerpano egzemplarze, przejdź do następnego niepostawionego statku
    const newCount = (placedCounts[selectedShip.id] ?? 0) + 1
    if (newCount >= selectedShip.total) {
      const newCounts = { ...placedCounts, [selectedShip.id]: newCount }
      const next = SHIPS.find(s => s.id !== selectedId && (newCounts[s.id] ?? 0) < s.total)
      setSelectedId(next?.id ?? null)
    }
  }

  function handleRemoveLast(shipId: string) {
    // Znajdź ostatni postawiony egzemplarz danego statku
    let lastIdx = -1
    for (let i = placedShips.length - 1; i >= 0; i--) {
      if (placedShips[i].shipId === shipId) { lastIdx = i; break }
    }
    if (lastIdx === -1) return

    const removed = placedShips[lastIdx]
    setCells(prev => {
      const next = prev.map(r => [...r])
      for (const c of removed.cells) next[c.row][c.col] = 'empty'
      return next
    })
    setPlacedShips(prev => prev.filter((_, i) => i !== lastIdx))
  }

  function handleRestart() {
    setCells(emptyGrid())
    setPlacedShips([])
    setSelectedId(null)
    setHoverCell(null)
  }

  function handleRandomize() {
    const { cells: newCells, placedShips: newPlaced } = randomizeShips()
    setCells(newCells)
    setPlacedShips(newPlaced)
    setSelectedId(null)
    setHoverCell(null)
  }

  async function handleReady() {
    const playerId = sessionStorage.getItem('player-id')!

    // Zapisz planszę do bazy
    const { error } = await supabase
      .from('boards')
      .upsert(
        { game_id: gameId, player_id: playerId, ships: placedShips, ready: true },
        { onConflict: 'game_id,player_id' }
      )

    if (error) { console.error('Błąd zapisu planszy:', error.message); return }

    // Sprawdź czy przeciwnik też jest gotowy — jeśli tak, start gry
    const { data: game } = await supabase
      .from('games').select('player1_id, player2_id').eq('id', gameId).single()

    const opponentId = game?.player1_id === playerId ? game?.player2_id : game?.player1_id

    if (opponentId) {
      const { data: oppBoard } = await supabase
        .from('boards').select('ready').eq('game_id', gameId).eq('player_id', opponentId).single()

      if (oppBoard?.ready) {
        // Obaj gotowi — player1 zaczyna
        await supabase
          .from('games')
          .update({ status: 'playing', current_turn: game!.player1_id })
          .eq('id', gameId)
      }
    }

    onPlacingDone(cells, placedShips)
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-start md:justify-center gap-6 md:gap-8 p-4 md:p-6">

      {/* Przycisk powrotu do lobby */}
      <div className="self-start">
        <button
          onClick={() => setShowLeaveConfirm(true)}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm font-medium transition-colors cursor-pointer"
        >
          <span>←</span>
          <span>LOBBY</span>
        </button>
      </div>

      <h1 className="text-2xl md:text-4xl font-bold text-white">Statki</h1>

      <div className="flex flex-col md:flex-row gap-6 md:gap-12 items-center md:items-start">
        <Board
          cells={cells}
          onCellClick={handleCellClick}
          onCellHover={(row, col) => setHoverCell({ row, col })}
          onCellLeave={() => setHoverCell(null)}
          previewCells={previewCells}
          highlightCells={highlightCells}
        />

        <ShipPanel
          placedCounts={placedCounts}
          selectedId={selectedId}
          orientation={orientation}
          onSelect={id => setSelectedId(prev => (prev === id ? null : id))}
          onOrientationToggle={() => setOrientation(prev => (prev === 'H' ? 'V' : 'H'))}
          onRemoveLast={handleRemoveLast}
          onRestart={handleRestart}
          onRandomize={handleRandomize}
          onReady={handleReady}
          anyPlaced={anyPlaced}
          allPlaced={allPlaced}
        />
      </div>

      {/* Stały kontener na komunikaty — zawsze zajmuje miejsce, żeby layout nie skakał */}
      <div className="h-5 flex items-center justify-center">
        {selectedShip && !previewValid && hoverCell && (
          <p className="text-red-400 text-sm">Nie można tu postawić statku</p>
        )}
      </div>

      {/* Przeciwnik opuścił pokój */}
      {opponentLeft && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-sm w-full flex flex-col gap-4 items-center">
            <p className="text-white font-bold text-lg text-center">Przeciwnik opuścił pokój</p>
            <button
              onClick={onLeave}
              className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors cursor-pointer"
            >
              Wróć do lobby
            </button>
          </div>
        </div>
      )}

      {/* Potwierdzenie wyjścia do lobby */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-sm w-full flex flex-col gap-4">
            <h3 className="text-white font-bold text-lg">Wyjść do lobby?</h3>
            <p className="text-gray-400 text-sm">Opuszczasz grę — utracisz postępy.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 hover:border-gray-400 transition-colors cursor-pointer"
              >
                Anuluj
              </button>
              <button
                onClick={async () => {
                  await supabase.from('games').update({ status: 'abandoned' }).eq('id', gameId)
                  onLeave()
                }}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold transition-colors cursor-pointer"
              >
                Wyjdź
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
