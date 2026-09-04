import type { MonthGridProps } from '@orbit/shared/contracts/dates'

export function MonthGrid({
  weekdayLabels = [],
  children,
  gap = 8,
  label,
}: Readonly<MonthGridProps>) {
  const columns = weekdayLabels.length
  const gridStyle = columns > 0 ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined

  return (
    <div role="group" aria-label={label} data-columns={columns}>
      {columns > 0 ? (
        <div className="grid justify-items-center" style={{ ...gridStyle, gap, marginBottom: 8 }} data-testid="month-grid-header">
          {weekdayLabels.map((weekday, index) => (
            <span
              key={`${weekday}-${index}`}
              className="text-center"
              style={{
                color: 'var(--fg-3)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 500,
              }}
            >
              {weekday}
            </span>
          ))}
        </div>
      ) : null}
      <div className="grid justify-items-center" style={{ ...gridStyle, gap }} data-testid="month-grid-days">
        {children}
      </div>
    </div>
  )
}
