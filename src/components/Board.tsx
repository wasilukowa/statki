// Typy stanu pola planszy
export type CellState = 'empty' | 'ship' | 'hit' | 'miss'

type BoardProps = {
  cells: CellState[][]
  onCellClick: (row: number, col: number) => void
}

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
const COLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

function cellClass(state: CellState): string {
  switch (state) {
    case 'ship': return 'bg-gray-500'
    case 'hit':  return 'bg-red-600'
    case 'miss': return 'bg-white'
    default:     return 'bg-blue-600'
  }
}

export default function Board({ cells, onCellClick }: BoardProps) {
  return (
    <div className="inline-block">
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
            return (
              <button
                key={col}
                onClick={() => onCellClick(row, col)}
                className={`
                  w-9 h-9 border border-blue-900
                  ${cellClass(state)}
                  hover:brightness-125 hover:scale-105
                  transition-all duration-100
                  flex items-center justify-center
                  text-gray-700 font-bold text-sm
                  cursor-pointer
                `}
              >
                {state === 'miss' && '×'}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
