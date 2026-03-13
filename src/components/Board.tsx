// Typy stanu pola planszy
export type CellState = 'empty' | 'ship' | 'hit' | 'miss'

export type PreviewCell = { row: number; col: number; valid: boolean }

type BoardProps = {
  cells: CellState[][]
  onCellClick: (row: number, col: number) => void
  onCellHover?: (row: number, col: number) => void
  onCellLeave?: () => void
  previewCells?: PreviewCell[]
  highlightCells?: { row: number; col: number }[]
}

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
const COLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

function cellClass(state: CellState, preview: PreviewCell | undefined, highlight: boolean): string {
  if (preview) {
    return preview.valid ? 'bg-green-500 opacity-80' : 'bg-red-500 opacity-70'
  }
  if (highlight && state === 'ship') return 'bg-gray-300'
  switch (state) {
    case 'ship': return 'bg-gray-500'
    case 'hit':  return 'bg-red-600'
    case 'miss': return 'bg-slate-100'
    default:     return 'bg-blue-600'
  }
}

export default function Board({
  cells,
  onCellClick,
  onCellHover,
  onCellLeave,
  previewCells = [],
  highlightCells = [],
}: BoardProps) {
  const previewMap = new Map<string, PreviewCell>()
  for (const p of previewCells) previewMap.set(`${p.row},${p.col}`, p)

  const highlightSet = new Set(highlightCells.map(c => `${c.row},${c.col}`))

  return (
    <div className="inline-block" onMouseLeave={onCellLeave}>
      {/* Nagłówek kolumn */}
      <div className="flex ml-8">
        {COLS.map(col => (
          <div key={col} className="w-9 h-8 flex items-center justify-center text-sm font-semibold text-gray-300">
            {col}
          </div>
        ))}
      </div>

      {/* Wiersze */}
      {ROWS.map((rowLabel, row) => (
        <div key={rowLabel} className="flex">
          {/* Etykieta wiersza */}
          <div className="w-8 h-9 flex items-center justify-center text-sm font-semibold text-gray-300">
            {rowLabel}
          </div>

          {/* Pola wiersza */}
          {COLS.map((_, col) => {
            const state = cells[row][col]
            const preview = previewMap.get(`${row},${col}`)
            const highlight = highlightSet.has(`${row},${col}`)
            return (
              <button
                key={col}
                onClick={() => onCellClick(row, col)}
                onMouseEnter={() => onCellHover?.(row, col)}
                className={`
                  w-9 h-9 border border-blue-900
                  ${cellClass(state, preview, highlight)}
                  ${!preview && !highlight ? 'hover:brightness-125' : ''}
                  hover:scale-105
                  transition-all duration-75
                  flex items-center justify-center
                  text-gray-500 font-bold text-xl leading-none
                  ${highlight ? 'cursor-grab' : 'cursor-pointer'}
                `}
              >
                {state === 'miss' && '·'}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
