import { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
import Board from './components/Board'
import type { CellState, PreviewCell } from './components/Board'
import ShipPanel from './components/ShipPanel'
import { SHIPS } from './components/ShipPanel'
import Lobby from './components/Lobby'

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
  // pendingGameId — gracz 1 stworzył grę, czeka na dołączenie gracza 2
  const [pendingGameId, setPendingGameId] = useState<string | null>(null)

  // Nasłuchuje na zmianę statusu gry (waiting → placing) po stronie gracza 1
  useEffect(() => {
    if (!pendingGameId) return

    const channel = supabase
      .channel(`game-status:${pendingGameId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${pendingGameId}`,
        },
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

  return <Game gameId={gameId} />
}

function Game({ gameId: _gameId }: { gameId: string }) {
  const [cells, setCells] = useState<CellState[][]>(emptyGrid)
  const [placedShips, setPlacedShips] = useState<PlacedShip[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [orientation, setOrientation] = useState<'H' | 'V'>('H')
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null)

  // Licznik postawionych statków — pochodna placedShips
  const placedCounts = placedShips.reduce<Record<string, number>>((acc, s) => {
    acc[s.shipId] = (acc[s.shipId] ?? 0) + 1
    return acc
  }, {})

  const allPlaced = SHIPS.every(s => (placedCounts[s.id] ?? 0) >= s.total)
  const anyPlaced = placedShips.length > 0
  const selectedShip = SHIPS.find(s => s.id === selectedId) ?? null

  // Test połączenia z Supabase — odpali się raz przy montowaniu
  const connectionTested = useRef(false)
  useEffect(() => {
    if (connectionTested.current) return
    connectionTested.current = true
    supabase
      .from('games')
      .select('*', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (error) console.error('[Supabase] Błąd połączenia:', error.message)
        else console.log(`[Supabase] Połączono. Liczba rekordów w games: ${count}`)
      })
  }, [])

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

  function handleReady() {
    // TODO: przejście do fazy walki
    alert('Gotowe! Czas na bitwę.')
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center gap-8">
      <h1 className="text-4xl font-bold text-white">Statki</h1>

      <div className="flex gap-12 items-start">
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
    </div>
  )
}
