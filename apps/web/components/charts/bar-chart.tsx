export interface BarDatum {
  label: string
  value: number
}

export interface BarChartProps {
  bars: BarDatum[]
  height?: number
  ariaLabel?: string
}

const PLOT_TOP = 10
const BAR_GAP = 6

/**
 * Vertical bar chart. Bars fill the parent width and grow from a hairline
 * baseline, rendered as flex columns (CSS keeps the rounded tops crisp at any
 * width). Each bar uses the scheme primary with auto-clamped rounded tops over
 * three hairline gridlines. Empty data renders just the axes frame.
 */
export function BarChart({ bars, height = 160, ariaLabel }: Readonly<BarChartProps>) {
  const max = bars.reduce((peak, bar) => Math.max(peak, bar.value), 0)

  return (
    <div role="img" aria-label={ariaLabel} style={{ position: 'relative', width: '100%', height }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: PLOT_TOP, bottom: 0 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 1, background: 'var(--hairline)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'var(--hairline)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, background: 'var(--hairline)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: BAR_GAP }}>
          {bars.map((bar, index) => (
            <div
              key={`${bar.label}-${index}`}
              style={{
                flex: 1,
                height: max > 0 ? `${(bar.value / max) * 100}%` : 0,
                minHeight: bar.value > 0 ? 2 : 0,
                background: 'var(--primary)',
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
