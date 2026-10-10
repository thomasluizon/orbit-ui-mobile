import { Children } from 'react'
import type { MonthGridProps } from '@orbit/shared/contracts/dates'

export function MonthGrid({
  weekdayLabels = [],
  children,
  gap = 8,
  label,
  loadingLabel,
  minimumDayGridHeight,
}: Readonly<MonthGridProps>) {
  const columns = weekdayLabels.length
  const gridStyle = columns > 0 ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined

  return (
    <div role="group" aria-label={label} data-columns={columns} style={{ display: 'grid', gap: 8 }}>
      {columns > 0 ? (
        <div className="grid justify-items-center" style={{ ...gridStyle, gap, opacity: loadingLabel ? 0 : undefined }} aria-hidden={loadingLabel ? true : undefined} data-testid="month-grid-header">
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
      <div
        className="grid justify-items-center"
        style={{ ...gridStyle, alignContent: 'start', gap, minHeight: minimumDayGridHeight }}
        data-testid="month-grid-days"
        role={loadingLabel ? "progressbar" : undefined}
        aria-label={loadingLabel}
        aria-busy={loadingLabel ? true : undefined}
        data-cols={loadingLabel ? columns : undefined}
        data-rows={loadingLabel ? Math.ceil(Children.count(children) / columns) : undefined}
      >
        {children}
      </div>
    </div>
  )
}
