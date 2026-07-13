'use client'

import { useState, type CSSProperties, type PointerEvent } from 'react'

export interface TrendPoint {
  label: string
  value: number
}

export interface TrendLineProps {
  points: TrendPoint[]
  height?: number
  ariaLabel?: string
  /** Formats a value for the y-axis ticks and the hover tooltip (e.g. adds a unit). */
  formatValue?: (value: number) => string
  /** Formats a point label for the x-axis and tooltip. When provided, the first and
   *  last labels render as an x-axis beneath the plot. */
  formatLabel?: (label: string) => string
}

const VIEW_W = 100
const PAD_Y = 16

function tooltipTransform(xPercent: number): string {
  if (xPercent < 18) return 'translate(0, calc(-100% - 10px))'
  if (xPercent > 82) return 'translate(-100%, calc(-100% - 10px))'
  return 'translate(-50%, calc(-100% - 10px))'
}

/**
 * Soft line + area chart for a time series. The line/area stretch to the parent
 * width (non-scaling strokes keep them crisp); an HTML overlay carries the crisp
 * dot, hover guide, formatted y-axis ticks, and a tooltip that reads the nearest
 * point. Pass `formatValue` for units and `formatLabel` to render a date x-axis.
 */
export function TrendLine({
  points,
  height = 168,
  ariaLabel,
  formatValue = String,
  formatLabel,
}: Readonly<TrendLineProps>) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const plotTop = PAD_Y
  const plotBottom = height - PAD_Y
  const values = points.map((point) => point.value)
  const max = values.length ? Math.max(...values) : 0
  const min = values.length ? Math.min(...values) : 0
  const span = max - min
  const lastIndex = points.length - 1

  const xPercent = (index: number) =>
    points.length <= 1 ? 50 : (index / lastIndex) * 100
  const yAt = (value: number) =>
    span === 0
      ? (plotTop + plotBottom) / 2
      : plotBottom - ((value - min) / span) * (plotBottom - plotTop)

  const gridLines = [plotTop, (plotTop + plotBottom) / 2, plotBottom]

  let linePath = ''
  let areaPath = ''
  if (points.length === 1) {
    const y = yAt(max)
    linePath = `M 0 ${y} L ${VIEW_W} ${y}`
    areaPath = `${linePath} L ${VIEW_W} ${plotBottom} L 0 ${plotBottom} Z`
  } else if (points.length > 1) {
    linePath = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xPercent(index)} ${yAt(point.value)}`)
      .join(' ')
    areaPath = `${linePath} L ${VIEW_W} ${plotBottom} L 0 ${plotBottom} Z`
  }

  const handleMove = (event: PointerEvent<HTMLDivElement>) => {
    if (points.length === 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    const clamped = Math.min(Math.max(ratio, 0), 1)
    setHoverIndex(Math.round(clamped * lastIndex))
  }

  const activeIndex = hoverIndex ?? lastIndex
  const activePoint = points[activeIndex]
  const firstPoint = points[0]
  const lastPoint = points[lastIndex]
  const dotLeft = points.length > 0 ? xPercent(activeIndex) : 50

  return (
    <div role="img" aria-label={ariaLabel} style={{ width: '100%' }}>
      <div
        className="relative"
        style={{ height, touchAction: 'pan-y' }}
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${VIEW_W} ${height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{ display: 'block' }}
        >
          {gridLines.map((y) => (
            <line
              key={y}
              x1={0}
              x2={VIEW_W}
              y1={y}
              y2={y}
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
            <span className="t-meta" style={tickStyle('top')}>
              {formatValue(max)}
            </span>
            {span !== 0 && (
              <span className="t-meta" style={tickStyle('bottom')}>
                {formatValue(min)}
              </span>
            )}
          </>
        )}

        {activePoint && (
          <span
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: `${dotLeft}%`,
              top: plotTop,
              height: plotBottom - plotTop,
              width: 1,
              background: 'var(--hairline-strong)',
              opacity: hoverIndex !== null ? 1 : 0,
              transition: 'opacity var(--dur-fast) var(--ease-standard)',
            }}
          />
        )}

        {points.length > 0 && activePoint && (
          <span
            aria-hidden
            className="pointer-events-none absolute rounded-full"
            style={{
              left: `${dotLeft}%`,
              top: yAt(activePoint.value),
              width: 10,
              height: 10,
              transform: 'translate(-50%, -50%)',
              background: 'var(--primary)',
              boxShadow: '0 0 0 3px var(--bg)',
            }}
          />
        )}

        {activePoint && (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 whitespace-nowrap rounded-[10px] px-2.5 py-1.5"
            style={{
              left: `${dotLeft}%`,
              top: yAt(activePoint.value),
              transform: tooltipTransform(dotLeft),
              background: 'var(--bg-elev-2)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              boxShadow: 'var(--shadow-2), inset 0 0 0 1px var(--hairline-strong)',
              opacity: hoverIndex !== null ? 1 : 0,
              transition: 'opacity var(--dur-fast) var(--ease-standard)',
            }}
          >
            <span className="t-num block" style={{ fontSize: 14, color: 'var(--fg-1)' }}>
              {formatValue(activePoint.value)}
            </span>
            <span className="t-meta block" style={{ color: 'var(--fg-3)' }}>
              {formatLabel ? formatLabel(activePoint.label) : activePoint.label}
            </span>
          </div>
        )}
      </div>

      {formatLabel && points.length > 1 && firstPoint && lastPoint && (
        <div className="mt-2 flex justify-between">
          <span className="t-meta">{formatLabel(firstPoint.label)}</span>
          <span className="t-meta">{formatLabel(lastPoint.label)}</span>
        </div>
      )}
    </div>
  )
}

function tickStyle(edge: 'top' | 'bottom'): CSSProperties {
  return {
    position: 'absolute',
    left: 0,
    top: edge === 'top' ? 0 : undefined,
    bottom: edge === 'bottom' ? 0 : undefined,
    padding: '1px 6px',
    borderRadius: 6,
    background: 'var(--bg-elev)',
    color: 'var(--fg-2)',
  }
}
