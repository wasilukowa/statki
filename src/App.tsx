import { useState } from 'react'
import Board from './components/Board'
import type { CellState } from './components/Board'

// Testowy układ statków
function createInitialCells(): CellState[][] {
  const grid: CellState[][] = Array.from({ length: 10 }, () => Array(10).fill('empty'))
  // Kilka testowych statków
  grid[0][0] = 'ship'
  grid[0][1] = 'ship'
  grid[0][2] = 'ship'
  grid[3][5] = 'ship'
  grid[3][6] = 'ship'
  return grid
}

export default function App() {
  const [cells, setCells] = useState<CellState[][]>(createInitialCells)

  function handleCellClick(row: number, col: number) {
    setCells(prev => {
      const next = prev.map(r => [...r])
      const current = next[row][col]
      if (current === 'ship') next[row][col] = 'hit'
      else if (current === 'empty') next[row][col] = 'miss'
      return next
    })
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center gap-8">
      <h1 className="text-4xl font-bold text-white">Statki</h1>
      <Board cells={cells} onCellClick={handleCellClick} />
    </div>
  )
}
