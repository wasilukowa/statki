// Panel z listą statków do rozstawienia — bez boxów, z kolorami

export type ShipDef = {
  id: string
  name: string
  size: number
  total: number
}

export const SHIPS: ShipDef[] = [
  { id: 'carrier',    name: 'Lotniskowiec', size: 5, total: 1 },
  { id: 'battleship', name: 'Pancernik',    size: 4, total: 1 },
  { id: 'cruiser',    name: 'Krążownik',    size: 3, total: 2 },
  { id: 'destroyer',  name: 'Niszczyciel',  size: 2, total: 1 },
]

export const SHIP_COLORS: Record<string, { bg: string; dim: string }> = {
  carrier:    { bg: 'bg-blue-500',    dim: 'bg-blue-900'    },
  battleship: { bg: 'bg-rose-500',    dim: 'bg-rose-900'    },
  cruiser:    { bg: 'bg-emerald-500', dim: 'bg-emerald-900' },
  destroyer:  { bg: 'bg-amber-500',   dim: 'bg-amber-900'   },
}

type ShipPanelProps = {
  placedCounts: Record<string, number>
  selectedId: string | null
  orientation: 'H' | 'V'
  onSelect: (id: string) => void
  onDragStart: (e: React.PointerEvent, shipId: string, grabIndex: number) => void
}

export default function ShipPanel({
  placedCounts,
  selectedId,
  orientation,
  onSelect,
  onDragStart,
}: ShipPanelProps) {
  return (
    <div className="flex flex-col gap-4 w-full md:w-52">
      <h2 className="text-lg font-bold text-white">Twoja flota</h2>

      <div className="flex flex-col gap-3">
        {SHIPS.map(ship => {
          const placed = placedCounts[ship.id] ?? 0
          const remaining = ship.total - placed
          const isFullyPlaced = placed >= ship.total
          const isSelected = selectedId === ship.id
          const color = SHIP_COLORS[ship.id]

          // Pokazujemy tyle "kopii" statku ile pozostało + ile postawiono
          return (
            <div key={ship.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${isFullyPlaced ? 'text-gray-600' : isSelected ? 'text-white' : 'text-gray-400'}`}>
                  {ship.name}{ship.total > 1 ? ` ×${ship.total}` : ''}
                </span>
                {ship.total > 1 && (
                  <span className="text-xs text-gray-600">{placed}/{ship.total}</span>
                )}
              </div>

              {/* Rząd kwadratów statku — klikalny + draggable */}
              <div
                className={`flex gap-0.5 ${isFullyPlaced ? 'cursor-default' : 'cursor-pointer'}`}
                onClick={() => !isFullyPlaced && onSelect(ship.id)}
              >
                {Array.from({ length: ship.size }).map((_, i) => (
                  <div
                    key={i}
                    onPointerDown={e => {
                      if (isFullyPlaced) return
                      e.preventDefault()
                      onSelect(ship.id)
                      onDragStart(e, ship.id, i)
                    }}
                    className={`
                      w-7 h-7 md:w-9 md:h-9 rounded-sm select-none touch-none
                      transition-all duration-75
                      ${isFullyPlaced
                        ? color.dim
                        : isSelected
                          ? color.bg + ' ring-2 ring-white/40 scale-105'
                          : color.bg + ' opacity-60 hover:opacity-100'
                      }
                    `}
                  />
                ))}

                {/* Dla statków z total > 1: pokaż wyszarzone kopie już postawionych */}
                {ship.total > 1 && placed > 0 && remaining > 0 && (
                  <div className="w-px" />
                )}
              </div>

              {/* Jeśli total > 1 i jakieś postawione — pokaż kolejną kopię statku */}
              {ship.total > 1 && placed > 0 && placed < ship.total && (
                <div className="flex gap-0.5 mt-0.5">
                  {Array.from({ length: ship.size }).map((_, i) => (
                    <div key={i} className={`w-7 h-7 md:w-9 md:h-9 rounded-sm ${color.dim}`} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Podpowiedź orientacji */}
      <p className="text-xs text-gray-600 text-center">
        Orientacja: <span className="text-gray-400">{orientation === 'H' ? 'pozioma →' : 'pionowa ↓'}</span>
      </p>
    </div>
  )
}
