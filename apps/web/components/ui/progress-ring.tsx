import type { ProgressRingProps } from '@orbit/shared/contracts/display'

/** A circular progress sweep over a neutral track. */
export function ProgressRing({ value = 0, size = 64, label }: Readonly<ProgressRingProps>) {
  const clamped = Math.min(100, Math.max(0, value))
  const complete = clamped === 100
  const strokeWidth = Math.max(2, size / 16)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      data-complete={complete || undefined}
    >
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--fg-4)" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={complete ? 'var(--fg-3)' : 'var(--primary)'}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}
