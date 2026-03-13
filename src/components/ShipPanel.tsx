// Panel boczny z listą statków do rozstawienia

export type ShipDef = {
  id: string
  name: string
  size: number
  total: number
}

export const SHIPS: ShipDef[] = [
  { id: 'carrier',     name: 'Lotniskowiec', size: 5, total: 1 },
  { id: 'battleship',  name: 'Pancernik',    size: 4, total: 1 },
  { id: 'cruiser',     name: 'Krążownik',    size: 3, total: 2 },
  { id: 'destroyer',   name: 'Niszczyciel',  size: 2, total: 1 },
]

function RotateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  )
}

type ShipPanelProps = {
  placedCounts: Record<string, number>
  selectedId: string | null
  orientation: 'H' | 'V'
  anyPlaced: boolean
  allPlaced: boolean
  onSelect: (id: string) => void
  onOrientationToggle: () => void
  onRemoveLast: (shipId: string) => void
  onRestart: () => void
  onRandomize: () => void
  onReady: () => void
}

export default function ShipPanel({
  placedCounts,
  selectedId,
  orientation,
  anyPlaced,
  allPlaced,
  onSelect,
  onOrientationToggle,
  onRemoveLast,
  onRestart,
  onRandomize,
  onReady,
}: ShipPanelProps) {
  return (
    <div className="flex flex-col gap-4 w-52">
      <h2 className="text-lg font-bold text-white">Twoja flota</h2>

      <div className="flex flex-col gap-2">
        {SHIPS.map(ship => {
          const placed = placedCounts[ship.id] ?? 0
          const isFullyPlaced = placed >= ship.total
          const isSelected = selectedId === ship.id
          const canRemove = placed > 0

          return (
            <div
              key={ship.id}
              role="button"
              tabIndex={isFullyPlaced ? -1 : 0}
              onClick={() => !isFullyPlaced && onSelect(ship.id)}
              onKeyDown={e => e.key === 'Enter' && !isFullyPlaced && onSelect(ship.id)}
              className={`
                flex flex-col gap-1.5 p-3 rounded-lg border text-left transition-all select-none
                ${isSelected
                  ? 'border-yellow-400 bg-yellow-400/10 text-yellow-300'
                  : isFullyPlaced
                    ? 'border-gray-700 bg-gray-800/40 text-gray-600 cursor-default'
                    : 'border-gray-600 bg-gray-800 text-gray-200 hover:border-blue-400 hover:bg-gray-700 cursor-pointer'
                }
              `}
            >
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>{ship.name}</span>
                <div className="flex items-center gap-1">
                  <span className={`text-xs ${isFullyPlaced ? 'text-gray-600' : 'text-gray-400'}`}>
                    {placed}/{ship.total}
                  </span>

                  {/* Ikona obrotu — zawsze widoczna, aktywna gdy statek jest wybrany */}
                  <button
                    title={isSelected ? `Obróć (R) — teraz: ${orientation === 'H' ? 'poziomo' : 'pionowo'}` : 'Wybierz statek, aby obrócić'}
                    onClick={e => { e.stopPropagation(); if (isSelected) onOrientationToggle() }}
                    tabIndex={isSelected ? 0 : -1}
                    className={`
                      w-6 h-6 flex items-center justify-center rounded transition-all
                      ${isSelected
                        ? 'text-yellow-300 hover:text-yellow-100 hover:bg-yellow-400/20 cursor-pointer'
                        : 'text-gray-700 cursor-default'
                      }
                    `}
                  >
                    <RotateIcon className="w-4 h-4" />
                  </button>

                  {/* Ikona kosza — zawsze widoczna, aktywna gdy statek jest postawiony */}
                  <button
                    title={canRemove ? 'Usuń ostatni postawiony egzemplarz' : 'Brak postawionych statków'}
                    onClick={e => { e.stopPropagation(); if (canRemove) onRemoveLast(ship.id) }}
                    tabIndex={canRemove ? 0 : -1}
                    className={`
                      w-6 h-6 flex items-center justify-center rounded transition-all
                      ${canRemove
                        ? 'text-gray-500 hover:text-red-400 hover:bg-red-400/10 cursor-pointer'
                        : 'text-gray-700 cursor-default'
                      }
                    `}
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Wizualna reprezentacja rozmiaru statku */}
              <div className="flex gap-0.5">
                {Array.from({ length: ship.size }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-3 w-5 rounded-sm ${
                      isFullyPlaced
                        ? 'bg-gray-700'
                        : isSelected
                          ? 'bg-yellow-400'
                          : 'bg-gray-500'
                    }`}
                  />
                ))}
              </div>

              <div className={`text-xs ${isFullyPlaced ? 'text-gray-600' : 'text-gray-500'}`}>
                {ship.size} {ship.size === 1 ? 'pole' : ship.size < 5 ? 'pola' : 'pól'}
              </div>
            </div>
          )
        })}
      </div>

      {/* Instrukcja */}
      <div className="h-8 flex items-center justify-center">
        {allPlaced ? (
          <p className="text-xs text-green-400 text-center">Wszystkie statki rozstawione!</p>
        ) : selectedId ? (
          <p className="text-xs text-gray-400 text-center">
            Kliknij na planszy, aby postawić statek
            <br />
            <span className="text-gray-600">
              Naciśnij <kbd className="px-1 py-0.5 rounded bg-gray-700 text-gray-500 font-mono text-xs">R</kbd> aby obrócić
            </span>
          </p>
        ) : (
          <p className="text-xs text-gray-500 text-center">Wybierz statek z listy</p>
        )}
      </div>

      {/* Przyciski akcji */}
      <div className="flex flex-col gap-2 mt-1">
        <button
          onClick={onRandomize}
          className="w-full py-2 px-3 rounded-lg border border-gray-600 bg-gray-800 text-gray-300 text-sm font-medium hover:border-blue-400 hover:bg-gray-700 hover:text-white transition-all cursor-pointer"
        >
          Losowe rozmieszczenie
        </button>

        <button
          disabled={!anyPlaced}
          onClick={onRestart}
          className={`
            w-full py-2 px-3 rounded-lg text-sm font-medium transition-all
            ${anyPlaced
              ? 'border border-gray-600 bg-gray-800 text-gray-300 hover:border-red-500 hover:bg-red-500/10 hover:text-red-300 cursor-pointer'
              : 'border border-gray-800 bg-gray-900 text-gray-700 cursor-not-allowed'
            }
          `}
        >
          Restart
        </button>

        <button
          disabled={!allPlaced}
          onClick={onReady}
          className={`
            w-full py-2.5 px-3 rounded-lg text-sm font-bold transition-all
            ${allPlaced
              ? 'bg-green-600 hover:bg-green-500 text-white cursor-pointer shadow-lg shadow-green-900/40 border border-transparent'
              : 'bg-gray-800 border border-gray-700 text-gray-600 cursor-not-allowed'
            }
          `}
        >
          Gotowe
        </button>
      </div>
    </div>
  )
}
