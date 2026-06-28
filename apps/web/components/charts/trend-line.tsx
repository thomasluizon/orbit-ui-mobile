export interface TrendPoint {
  label: string
  value: number
}

export interface TrendLineProps {
  points: TrendPoint[]
  height?: number
  ariaLabel?: string
}

const VIEW_W = 100
const PAD_Y = 14

/**
 * Soft line + area chart for a time series. Stretches to the parent width
 * (`preserveAspectRatio="none"` with non-scaling strokes so lines stay crisp);
 * primary stroke over a low-opacity primary area, hairline gridlines, and
 * min/max value annotations. Renders an empty axes frame for 0 points and a
 * flat line for a single point.
 */
export function TrendLine({ points, height = 160, ariaLabel }: Readonly<TrendLineProps>) {
  const plotTop = PAD_Y
  const plotBottom = height - PAD_Y
  const values = points.map((point) => point.value)
  const max = values.length ? Math.max(...values) : 0
  const min = values.length ? Math.min(...values) : 0
  const span = max - min

  const xAt = (index: number) =>
    points.length <= 1 ? VIEW_W / 2 : (index / (points.length - 1)) * VIEW_W
  const yAt = (value: number) =>
    span === 0
      ? (plotTop + plotBottom) / 2
      : plotBottom - ((value - min) / span) * (plotBottom - plotTop)

  const gridLines = [
    { id: 'top', y: plotTop },
    { id: 'mid', y: (plotTop + plotBottom) / 2 },
    { id: 'bottom', y: plotBottom },
  ]

  let linePath = ''
  let areaPath = ''
  if (points.length === 1) {
    const y = yAt(max)
    linePath = `M 0 ${y} L ${VIEW_W} ${y}`
    areaPath = `${linePath} L ${VIEW_W} ${plotBottom} L 0 ${plotBottom} Z`
  } else if (points.length > 1) {
    linePath = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xAt(index)} ${yAt(point.value)}`)
      .join(' ')
    areaPath = `${linePath} L ${VIEW_W} ${plotBottom} L 0 ${plotBottom} Z`
  }

  return (
    <div role="img" aria-label={ariaLabel} style={{ position: 'relative', width: '100%', height }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${VIEW_W} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ display: 'block' }}
      >
        {gridLines.map((gridLine) => (
          <line
            key={gridLine.id}
            x1={0}
            x2={VIEW_W}
            y1={gridLine.y}
            y2={gridLine.y}
            stroke="var(--hairline)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {areaPath && <path d={areaPath} fill="rgba(var(--primary-rgb), 0.12)" />}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {points.length > 0 && (
        <>
          <span className="t-meta" style={{ position: 'absolute', top: 0, left: 0 }}>
            {max}
          </span>
          {span !== 0 && (
            <span className="t-meta" style={{ position: 'absolute', bottom: 0, left: 0 }}>
              {min}
            </span>
          )}
        </>
      )}
    </div>
  )
}
