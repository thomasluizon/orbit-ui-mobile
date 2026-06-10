/** Small progress ring (no inner text) showing child completion ratio. */
interface ParentRingProps {
  done: number
  total: number
  size?: number
  ariaLabel?: string
  /** Progress stroke color (defaults to `--primary`). */
  color?: string
}

export function ParentRing({
  done,
  total,
  size = 12,
  ariaLabel,
  color,
}: Readonly<ParentRingProps>) {
  const pct = total > 0 ? Math.min(Math.max(done / total, 0), 1) : 0
  const r = (size - 1.5) / 2
  const c = 2 * Math.PI * r

  return (
    <span
      aria-label={ariaLabel}
      className="relative inline-block shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--hairline-strong)"
          strokeWidth="1.5"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? 'var(--primary)'}
          strokeWidth="1.5"
          strokeDasharray={`${c * pct} ${c}`}
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}
