// Typy stanu pola planszy
export type CellState = 'empty' | 'ship' | 'hit' | 'miss' | 'sunk'

export type PreviewCell = { row: number; col: number; valid: boolean }

type BoardProps = {
  cells: CellState[][]
  onCellClick: (row: number, col: number) => void
  onCellHover?: (row: number, col: number) => void
  onCellLeave?: () => void
  previewCells?: PreviewCell[]
  highlightCells?: { row: number; col: number }[]
  colorGrid?: (string | null)[][]
}

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
const COLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

function cellClass(
  state: CellState,
  preview: PreviewCell | undefined,
  highlight: boolean,
  shipColor?: string | null,
): string {
  if (preview) {
    return preview.valid ? 'bg-green-500 opacity-80' : 'bg-red-500 opacity-70'
  }
  if (highlight && state === 'ship') return (shipColor ?? 'bg-gray-400') + ' brightness-150'
  switch (state) {
    case 'ship': return shipColor ?? 'bg-gray-500'
    case 'hit':  return 'bg-red-600'
    case 'miss': return 'bg-slate-400'
    case 'sunk': return 'bg-orange-700'
    default:     return 'bg-gray-600'
  }
}

export default function Board({
  cells,
  onCellClick,
  onCellHover,
  onCellLeave,
  previewCells = [],
  highlightCells = [],
  colorGrid,
}: BoardProps) {
  const previewMap = new Map<string, PreviewCell>()
  for (const p of previewCells) previewMap.set(`${p.row},${p.col}`, p)

  const highlightSet = new Set(highlightCells.map(c => `${c.row},${c.col}`))

  return (
    <div className="inline-block" onMouseLeave={onCellLeave}>
      {/* Nagłówek kolumn */}
      <div className="flex ml-7 md:ml-8">
        {COLS.map(col => (
          <div key={col} className="w-7 h-7 md:w-9 md:h-8 flex items-center justify-center text-xs md:text-sm font-semibold text-gray-300">
            {col}
          </div>
        ))}
      </div>

      {/* Wiersze */}
      {ROWS.map((rowLabel, row) => (
        <div key={rowLabel} className="flex">
          {/* Etykieta wiersza */}
          <div className="w-7 h-7 md:w-8 md:h-9 flex items-center justify-center text-xs md:text-sm font-semibold text-gray-300">
            {rowLabel}
          </div>

          {/* Pola wiersza */}
          {COLS.map((_, col) => {
            const state = cells[row][col]
            const preview = previewMap.get(`${row},${col}`)
            const highlight = highlightSet.has(`${row},${col}`)
            const shipColor = colorGrid?.[row][col]
            return (
              <button
                key={col}
                data-row={row}
                data-col={col}
                onClick={() => onCellClick(row, col)}
                onMouseEnter={() => onCellHover?.(row, col)}
                className={`
                  w-7 h-7 md:w-9 md:h-9 border border-gray-800
                  ${cellClass(state, preview, highlight, shipColor)}
                  ${!preview && !highlight ? 'hover:brightness-125' : ''}
                  hover:scale-105
                  transition-all duration-75
                  flex items-center justify-center
                  text-gray-500 font-bold text-sm md:text-xl leading-none
                  ${highlight ? 'cursor-grab' : 'cursor-pointer'}
                `}
              >
                {state === 'miss' && '·'}
                {state === 'sunk' && '✕'}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
