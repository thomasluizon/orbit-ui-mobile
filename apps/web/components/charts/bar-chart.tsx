export interface BarDatum {
  label: string
  value: number
}

export interface BarChartProps {
  bars: BarDatum[]
  ariaLabel?: string
  /** Formats the value shown at the end of each bar (e.g. adds a unit). */
  formatValue?: (value: number) => string
}

/**
 * Horizontal labeled bar chart for ranking a handful of named categories. Each row
 * pairs a truncated label, a proportional primary bar over a sunk track, and the
 * formatted value, so the comparison reads without a separate axis or legend.
 */
export function BarChart({
  bars,
  ariaLabel,
  formatValue = String,
}: Readonly<BarChartProps>) {
  const max = bars.reduce((peak, bar) => Math.max(peak, bar.value), 0)

  return (
    <ul aria-label={ariaLabel} className="flex flex-col" style={{ gap: 12 }}>
      {bars.map((bar) => {
        const ratio = max > 0 ? bar.value / max : 0
        return (
          <li key={bar.label} className="flex items-center" style={{ gap: 12 }}>
            <span
              className="t-secondary shrink-0 truncate"
              style={{ width: 136, color: 'var(--fg-2)' }}
              title={bar.label}
            >
              {bar.label}
            </span>
            <span
              aria-hidden
              className="relative flex-1 overflow-hidden rounded-full"
              style={{ height: 10, background: 'var(--bg-sunk)' }}
            >
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${Math.max(ratio * 100, bar.value > 0 ? 3 : 0)}%`,
                  background: 'var(--primary)',
                }}
              />
            </span>
            <span
              className="t-num shrink-0 text-right"
              style={{ width: 52, color: 'var(--fg-1)' }}
            >
              {formatValue(bar.value)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
