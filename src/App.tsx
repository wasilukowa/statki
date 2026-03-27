import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from './lib/supabase'
import Board from './components/Board'
import type { CellState, PreviewCell } from './components/Board'
import ShipPanel from './components/ShipPanel'
import { SHIPS, SHIP_COLORS } from './components/ShipPanel'
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
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)

  // Ref do callbacku stawiania — unika stale closures w globalnych event listenerach
  const isDragging = useRef(false)
  const placeFnRef = useRef<(row: number, col: number) => void>(() => {})

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

  // Globalne handlery drag (pointermove / pointerup)
  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!isDragging.current) return
      setDragPos({ x: e.clientX, y: e.clientY })
      // Znajdź komórkę planszy pod kursorem (ghost ma pointer-events-none)
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const btn = el?.closest('[data-row]') as HTMLElement | null
      if (btn) {
        setHoverCell({ row: parseInt(btn.dataset.row!), col: parseInt(btn.dataset.col!) })
      } else {
        setHoverCell(null)
      }
    }
    function onUp(e: PointerEvent) {
      if (!isDragging.current) return
      isDragging.current = false
      setDragPos(null)
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const btn = el?.closest('[data-row]') as HTMLElement | null
      if (btn) {
        placeFnRef.current(parseInt(btn.dataset.row!), parseInt(btn.dataset.col!))
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  const placedCounts = placedShips.reduce<Record<string, number>>((acc, s) => {
    acc[s.shipId] = (acc[s.shipId] ?? 0) + 1
    return acc
  }, {})

  const allPlaced = SHIPS.every(s => (placedCounts[s.id] ?? 0) >= s.total)
  const anyPlaced = placedShips.length > 0
  const selectedShip = SHIPS.find(s => s.id === selectedId) ?? null

  const previewCells: PreviewCell[] =
    selectedShip && hoverCell
      ? computePreview(cells, hoverCell.row, hoverCell.col, selectedShip.size, orientation)
      : []

  const previewValid = previewCells.length > 0 && previewCells.every(p => p.valid)

  const highlightCells: { row: number; col: number }[] = (() => {
    if (!hoverCell || previewCells.length > 0) return []
    if (cells[hoverCell.row]?.[hoverCell.col] !== 'ship') return []
    const ship = placedShips.find(s =>
      s.cells.some(c => c.row === hoverCell.row && c.col === hoverCell.col)
    )
    return ship?.cells ?? []
  })()

  // Mapa kolorów komórek — pochodna placedShips
  const colorGrid = useMemo(() => {
    const grid: (string | null)[][] = Array.from({ length: 10 }, () => Array(10).fill(null))
    for (const ship of placedShips) {
      const color = SHIP_COLORS[ship.shipId]?.bg ?? null
      for (const c of ship.cells) grid[c.row][c.col] = color
    }
    return grid
  }, [placedShips])

  // Klawisz R obraca wybrany statek
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'r' || e.key === 'R') setOrientation(prev => prev === 'H' ? 'V' : 'H')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function handleCellClick(row: number, col: number) {
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
    const newCount = (placedCounts[selectedShip.id] ?? 0) + 1
    if (newCount >= selectedShip.total) {
      const newCounts = { ...placedCounts, [selectedShip.id]: newCount }
      const next = SHIPS.find(s => s.id !== selectedId && (newCounts[s.id] ?? 0) < s.total)
      setSelectedId(next?.id ?? null)
    }
  }

  // Zawsze aktualny callback dla drag drop
  placeFnRef.current = handleCellClick

  function handleDragStart(e: React.PointerEvent, shipId: string) {
    e.preventDefault()
    isDragging.current = true
    setSelectedId(shipId)
    setDragPos({ x: e.clientX, y: e.clientY })
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
    const { error } = await supabase
      .from('boards')
      .upsert(
        { game_id: gameId, player_id: playerId, ships: placedShips, ready: true },
        { onConflict: 'game_id,player_id' }
      )
    if (error) { console.error('Błąd zapisu planszy:', error.message); return }
    const { data: game } = await supabase
      .from('games').select('player1_id, player2_id').eq('id', gameId).single()
    const opponentId = game?.player1_id === playerId ? game?.player2_id : game?.player1_id
    if (opponentId) {
      const { data: oppBoard } = await supabase
        .from('boards').select('ready').eq('game_id', gameId).eq('player_id', opponentId).single()
      if (oppBoard?.ready) {
        await supabase.from('games')
          .update({ status: 'playing', current_turn: game!.player1_id })
          .eq('id', gameId)
      }
    }
    onPlacingDone(cells, placedShips)
  }

  // Rozmiar komórki dla ghosta (28px mobile, 36px desktop)
  const cellSize = typeof window !== 'undefined' && window.innerWidth >= 768 ? 36 : 28

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-start md:justify-center p-4 md:p-6">

      {/* Kontener o szerokości planszy+panelu */}
      <div className="w-full md:w-fit flex flex-col gap-4 md:gap-6">

        {/* Pasek górny: LOBBY | tytuł | Obróć */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm font-medium transition-colors cursor-pointer"
          >
            <span>←</span><span>LOBBY</span>
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-white">Statki</h1>
          <button
            onClick={() => setOrientation(prev => prev === 'H' ? 'V' : 'H')}
            title="Obróć statek (R)"
            className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors cursor-pointer
              ${selectedId
                ? 'border-yellow-500 text-yellow-400 hover:bg-yellow-500/10'
                : 'border-gray-700 text-gray-600 cursor-default'
              }`}
          >
            <span>{orientation === 'H' ? '→' : '↓'}</span>
            <span>Obróć</span>
          </button>
        </div>

        {/* Plansza + panel */}
        <div className="flex flex-col md:flex-row gap-6 md:gap-10 items-start">
          <Board
            cells={cells}
            onCellClick={handleCellClick}
            onCellHover={(row, col) => { if (!isDragging.current) setHoverCell({ row, col }) }}
            onCellLeave={() => { if (!isDragging.current) setHoverCell(null) }}
            previewCells={previewCells}
            highlightCells={highlightCells}
            colorGrid={colorGrid}
          />
          <ShipPanel
            placedCounts={placedCounts}
            selectedId={selectedId}
            orientation={orientation}
            onSelect={id => setSelectedId(prev => prev === id ? null : id)}
            onDragStart={(e, shipId) => handleDragStart(e, shipId)}
          />
        </div>

        {/* Przyciski akcji */}
        <div className="flex gap-2">
          <button
            onClick={handleRandomize}
            className="flex-1 py-2 px-3 rounded-lg border border-gray-600 bg-gray-800 text-gray-300 text-sm font-medium hover:border-blue-400 hover:bg-gray-700 hover:text-white transition-all cursor-pointer"
          >
            Losowe
          </button>
          <button
            disabled={!anyPlaced}
            onClick={handleRestart}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all
              ${anyPlaced
                ? 'border border-gray-600 bg-gray-800 text-gray-300 hover:border-red-500 hover:text-red-300 cursor-pointer'
                : 'border border-gray-800 bg-gray-900 text-gray-700 cursor-not-allowed'
              }`}
          >
            Restart
          </button>
          <button
            disabled={!allPlaced}
            onClick={handleReady}
            className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-bold transition-all
              ${allPlaced
                ? 'bg-green-600 hover:bg-green-500 text-white cursor-pointer shadow-lg shadow-green-900/40'
                : 'bg-gray-800 border border-gray-700 text-gray-600 cursor-not-allowed'
              }`}
          >
            Gotowe
          </button>
        </div>

        {/* Komunikat o złym ułożeniu */}
        <div className="h-4 flex items-center justify-center">
          {selectedShip && !previewValid && hoverCell && (
            <p className="text-red-400 text-xs">Nie można tu postawić statku</p>
          )}
        </div>
      </div>

      {/* Ghost — podąża za kursorem podczas drag */}
      {dragPos && selectedId && selectedShip && (
        <div
          className="fixed pointer-events-none z-50 flex gap-0.5"
          style={{
            left: dragPos.x - cellSize / 2,
            top: dragPos.y - cellSize / 2,
            flexDirection: orientation === 'V' ? 'column' : 'row',
          }}
        >
          {Array.from({ length: selectedShip.size }).map((_, i) => (
            <div
              key={i}
              className={`rounded-sm opacity-75 ${SHIP_COLORS[selectedId]?.bg ?? 'bg-gray-500'}`}
              style={{ width: cellSize, height: cellSize }}
            />
          ))}
        </div>
      )}

      {/* Przeciwnik opuścił pokój */}
      {opponentLeft && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-sm w-full flex flex-col gap-4 items-center">
            <p className="text-white font-bold text-lg text-center">Przeciwnik opuścił pokój</p>
            <button onClick={onLeave} className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors cursor-pointer">
              Wróć do lobby
            </button>
          </div>
        </div>
      )}

      {/* Potwierdzenie wyjścia */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-sm w-full flex flex-col gap-4">
            <h3 className="text-white font-bold text-lg">Wyjść do lobby?</h3>
            <p className="text-gray-400 text-sm">Opuszczasz grę — utracisz postępy.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLeaveConfirm(false)} className="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 hover:border-gray-400 transition-colors cursor-pointer">Anuluj</button>
              <button
                onClick={async () => {
                  await supabase.from('games').update({ status: 'abandoned' }).eq('id', gameId)
                  onLeave()
                }}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold transition-colors cursor-pointer"
              >Wyjdź</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
