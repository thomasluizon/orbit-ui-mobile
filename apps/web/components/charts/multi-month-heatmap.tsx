export interface HeatmapDay {
  date: string
  value: number
}

export interface MultiMonthHeatmapProps {
  days: HeatmapDay[]
  maxValue?: number
  ariaLabel: string
}

const CELL = 12
const GAP = 3
const ROWS = 7
const MS_PER_DAY = 86_400_000

/**
 * GitHub-style contribution grid: one cell per provided day, laid out in week
 * columns (Sunday-first rows). Intensity tints each cell along a primary-alpha
 * ramp (zero renders as a hairline cell). Scrolls horizontally when it exceeds
 * the parent width. Empty data renders nothing.
 */
export function MultiMonthHeatmap({ days, maxValue, ariaLabel }: Readonly<MultiMonthHeatmapProps>) {
  const parsed = days
    .map((day) => {
      const parts = day.date.slice(0, 10).split('-')
      const time = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      return {
        value: day.value,
        dayNumber: Math.floor(time / MS_PER_DAY),
        weekday: new Date(time).getUTCDay(),
      }
    })
    .sort((a, b) => a.dayNumber - b.dayNumber)

  const first = parsed[0]
  if (!first) {
    return <div role="img" aria-label={ariaLabel} />
  }

  const firstSunday = first.dayNumber - first.weekday
  const cells = parsed.map((day) => ({
    column: Math.floor((day.dayNumber - firstSunday) / 7),
    row: day.weekday,
    value: day.value,
  }))

  const columns = cells.reduce((peak, cell) => Math.max(peak, cell.column), 0) + 1
  const resolvedMax = maxValue ?? cells.reduce((peak, cell) => Math.max(peak, cell.value), 0)
  const width = columns * (CELL + GAP) - GAP
  const height = ROWS * (CELL + GAP) - GAP

  const fillFor = (value: number) => {
    if (value <= 0 || resolvedMax <= 0) {
      return 'var(--hairline)'
    }
    const ratio = value / resolvedMax
    const alpha = ratio <= 0.25 ? 0.2 : ratio <= 0.5 ? 0.4 : ratio <= 0.75 ? 0.65 : 0.9
    return `rgba(var(--primary-rgb), ${alpha})`
  }

  return (
    <div role="img" aria-label={ariaLabel} style={{ overflowX: 'auto', maxWidth: '100%' }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        style={{ display: 'block' }}
      >
        {cells.map((cell) => (
          <rect
            key={`${cell.column}-${cell.row}`}
            x={cell.column * (CELL + GAP)}
            y={cell.row * (CELL + GAP)}
            width={CELL}
            height={CELL}
            rx={3}
            ry={3}
            fill={fillFor(cell.value)}
          />
        ))}
      </svg>
    </div>
  )
}
