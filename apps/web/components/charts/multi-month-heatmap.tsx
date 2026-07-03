'use client'

import { useLocale } from 'next-intl'

export interface HeatmapDay {
  date: string
  value: number
}

export interface MultiMonthHeatmapProps {
  days: HeatmapDay[]
  maxValue?: number
  ariaLabel: string
  /** First day of the week for the grid rows: 0 = Sunday, 1 = Monday. */
  weekStartsOn?: 0 | 1
  /** Native tooltip text per cell, e.g. "Jun 12: 3 completed". */
  cellTitle?: (date: string, value: number) => string
  /** Renders a less -> more intensity legend beneath the grid when provided. */
  legend?: { less: string; more: string }
}

const CELL = 13
const GAP = 3
const ROWS = 7
const MS_PER_DAY = 86_400_000
const MONTH_LABEL_HEIGHT = 18
const MIN_LABEL_GAP_COLUMNS = 3
const LEGEND_ALPHAS = [0.2, 0.4, 0.65, 0.9]

function alphaFor(ratio: number): number {
  return ratio <= 0.25 ? 0.2 : ratio <= 0.5 ? 0.4 : ratio <= 0.75 ? 0.65 : 0.9
}

function monthLabelColumns(
  cells: ReadonlyArray<{ column: number; dayNumber: number }>,
): Array<{ column: number; monthStart: Date }> {
  const firstDayNumberByColumn = new Map<number, number>()
  for (const cell of cells) {
    const known = firstDayNumberByColumn.get(cell.column)
    if (known === undefined || cell.dayNumber < known) {
      firstDayNumberByColumn.set(cell.column, cell.dayNumber)
    }
  }

  const labels: Array<{ column: number; monthStart: Date }> = []
  let previousMonthKey: string | null = null
  let lastLabeledColumn = -MIN_LABEL_GAP_COLUMNS
  const columns = [...firstDayNumberByColumn.keys()].sort((a, b) => a - b)
  for (const column of columns) {
    const dayNumber = firstDayNumberByColumn.get(column)
    if (dayNumber === undefined) continue
    const date = new Date(dayNumber * MS_PER_DAY)
    const monthKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}`
    const isNewMonth = monthKey !== previousMonthKey
    previousMonthKey = monthKey
    if (!isNewMonth || column - lastLabeledColumn < MIN_LABEL_GAP_COLUMNS) continue
    labels.push({
      column,
      monthStart: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)),
    })
    lastLabeledColumn = column
  }
  return labels
}

/**
 * GitHub-style contribution grid: one cell per provided day, laid out in week
 * columns honoring the `weekStartsOn` preference, with a localized short month
 * label above the first week column of each month. Cell size scales with the
 * span (short ranges get larger cells so a week or month fills its row; a year
 * keeps the dense grid). Intensity tints each cell along a primary-alpha ramp
 * (zero renders as a hairline cell). Optional per-cell `cellTitle` adds a hover
 * tooltip and `legend` renders a less -> more key. Scrolls horizontally when it
 * exceeds the parent width; empty data renders nothing.
 */
export function MultiMonthHeatmap({
  days,
  maxValue,
  ariaLabel,
  weekStartsOn = 0,
  cellTitle,
  legend,
}: Readonly<MultiMonthHeatmapProps>) {
  const locale = useLocale()

  const parsed = days
    .map((day) => {
      const parts = day.date.slice(0, 10).split('-')
      const time = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      return {
        value: day.value,
        date: day.date,
        dayNumber: Math.floor(time / MS_PER_DAY),
        weekday: new Date(time).getUTCDay(),
      }
    })
    .sort((a, b) => a.dayNumber - b.dayNumber)

  const first = parsed[0]
  if (!first) {
    return <div role="img" aria-label={ariaLabel} />
  }

  const rowFor = (weekday: number) => (weekday - weekStartsOn + 7) % 7
  const firstWeekStart = first.dayNumber - rowFor(first.weekday)
  const cells = parsed.map((day) => ({
    column: Math.floor((day.dayNumber - firstWeekStart) / 7),
    row: rowFor(day.weekday),
    value: day.value,
    date: day.date,
    dayNumber: day.dayNumber,
  }))

  const columns = cells.reduce((peak, cell) => Math.max(peak, cell.column), 0) + 1
  const resolvedMax = maxValue ?? cells.reduce((peak, cell) => Math.max(peak, cell.value), 0)
  const cellSize = columns <= 6 ? 20 : columns <= 14 ? 16 : CELL
  const cellGap = columns <= 14 ? 4 : GAP
  const width = columns * (cellSize + cellGap) - cellGap
  const height = MONTH_LABEL_HEIGHT + ROWS * (cellSize + cellGap) - cellGap

  const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
  const labels = monthLabelColumns(cells)

  const fillFor = (value: number) =>
    value <= 0 || resolvedMax <= 0
      ? 'var(--hairline)'
      : `rgba(var(--primary-rgb), ${alphaFor(value / resolvedMax)})`

  return (
    <div role="img" aria-label={ariaLabel}>
      <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          style={{ display: 'block' }}
        >
          {labels.map((label) => (
            <text
              key={label.column}
              x={label.column * (cellSize + cellGap)}
              y={11}
              fill="var(--fg-3)"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                letterSpacing: '0.02em',
              }}
            >
              {monthFormatter.format(label.monthStart)}
            </text>
          ))}
          {cells.map((cell) => (
            <rect
              key={`${cell.column}-${cell.row}`}
              x={cell.column * (cellSize + cellGap)}
              y={MONTH_LABEL_HEIGHT + cell.row * (cellSize + cellGap)}
              width={cellSize}
              height={cellSize}
              rx={3}
              ry={3}
              fill={fillFor(cell.value)}
            >
              {cellTitle ? <title>{cellTitle(cell.date, cell.value)}</title> : null}
            </rect>
          ))}
        </svg>
      </div>
      {legend ? (
        <div className="mt-3 flex items-center" style={{ gap: 6 }}>
          <span className="t-meta">{legend.less}</span>
          <span
            className="inline-block rounded-[3px]"
            style={{ width: 12, height: 12, background: 'var(--hairline)' }}
          />
          {LEGEND_ALPHAS.map((alpha) => (
            <span
              key={alpha}
              className="inline-block rounded-[3px]"
              style={{ width: 12, height: 12, background: `rgba(var(--primary-rgb), ${alpha})` }}
            />
          ))}
          <span className="t-meta">{legend.more}</span>
        </div>
      ) : null}
    </div>
  )
}
