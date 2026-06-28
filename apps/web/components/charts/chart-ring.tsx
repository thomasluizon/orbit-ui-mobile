export interface ChartRingProps {
  value: number
  max: number
  label?: string
  size?: number
  ariaLabel: string
}

/**
 * Plain progress donut for a single ratio. Sweeps the primary arc with the
 * sanctioned `stroke-dashoffset` transition over a hairline track and centers
 * the value in tabular numerals. The ratio clamps to 0-1; a non-positive max
 * renders an empty ring.
 */
export function ChartRing({ value, max, label, size = 120, ariaLabel }: Readonly<ChartRingProps>) {
  const strokeWidth = Math.max(6, Math.round(size * 0.1))
  const radius = (size - strokeWidth) / 2 - 1
  const circumference = 2 * Math.PI * radius
  const center = size / 2
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0
  const dashOffset = circumference * (1 - ratio)

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
          r={radius}
          fill="none"
          stroke="var(--hairline-strong)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset var(--dur-slow) var(--ease-out)' }}
        />
      </svg>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{ gap: 2 }}
      >
        <span className="t-num" style={{ fontSize: Math.round(size * 0.26), lineHeight: 1 }}>
          {value}
        </span>
        {label && (
          <span
            className="t-eyebrow"
            style={{ maxWidth: size - 2 * strokeWidth, textAlign: 'center' }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  )
}
