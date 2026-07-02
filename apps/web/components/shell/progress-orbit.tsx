import { Fragment } from 'react'

interface ProgressOrbitProps {
  done: number
  total: number
  size?: number
  /** Eyebrow shown under the count while the day is in progress. */
  label: string
  /** Eyebrow shown when every habit is done. */
  completeLabel: string
  ariaLabel: string
}

const SATELLITE_CAP = 12

/**
 * The day's progress as a closing violet orbit: a ring that fills as habits are
 * completed, with one satellite per habit that ignites on completion. Uses the
 * sanctioned `stroke-dashoffset` sweep (paint-only, reduced-motion gated globally).
 * Beyond {@link SATELLITE_CAP} habits the ring carries progress without satellites.
 */
export function ProgressOrbit({
  done,
  total,
  size = 200,
  label,
  completeLabel,
  ariaLabel,
}: Readonly<ProgressOrbitProps>) {
  const safeTotal = Math.max(total, 0)
  const safeDone = Math.max(Math.min(done, safeTotal), 0)
  const pct = safeTotal > 0 ? safeDone / safeTotal : 0
  const isComplete = safeTotal > 0 && safeDone >= safeTotal

  const strokeWidth = 4
  const r = size / 2 - 12
  const circumference = 2 * Math.PI * r
  const center = size / 2

  const showSatellites = safeTotal > 0 && safeTotal <= SATELLITE_CAP
  const satellites = showSatellites
    ? Array.from({ length: safeTotal }, (_, i) => {
        const angle = (i / safeTotal) * 2 * Math.PI
        return {
          key: i,
          x: center + r * Math.cos(angle),
          y: center + r * Math.sin(angle),
          ignited: i < safeDone,
        }
      })
    : []

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden="true"
      >
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="var(--hairline-strong)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          style={{ transition: 'stroke-dashoffset var(--dur-slow) var(--ease-out)' }}
        />
        {satellites.map((satellite) => (
          <Fragment key={satellite.key}>
            <circle
              cx={satellite.x}
              cy={satellite.y}
              r={7}
              fill="var(--primary)"
              opacity={satellite.ignited ? 0.18 : 0}
              style={{ transition: 'opacity var(--dur-base) var(--ease-out)' }}
            />
            <circle
              cx={satellite.x}
              cy={satellite.y}
              r={3.5}
              fill={satellite.ignited ? 'var(--primary)' : 'var(--bg)'}
              stroke={satellite.ignited ? 'var(--primary)' : 'var(--hairline-strong)'}
              strokeWidth={1.5}
              style={{ transition: 'fill var(--dur-base) var(--ease-out)' }}
            />
          </Fragment>
        ))}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ gap: 4 }}>
        <span className="flex items-baseline" style={{ gap: 3 }}>
          <span className="t-num-xl">{safeDone}</span>
          <span className="t-num" style={{ fontSize: 18, color: 'var(--fg-3)' }}>
            /{safeTotal}
          </span>
        </span>
        <span className="t-eyebrow">{isComplete ? completeLabel : label}</span>
      </div>
    </div>
  )
}
