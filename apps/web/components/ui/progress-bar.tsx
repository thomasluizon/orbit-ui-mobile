import type { ProgressBarProps } from '@orbit/shared/contracts/display'

/** Accent shows unfinished progress; a completed bar returns to neutral. */
export function ProgressBar({ value = 0, max = 100, label }: Readonly<ProgressBarProps>) {
  const safeMax = max > 0 ? max : 100
  const clampedValue = Math.min(safeMax, Math.max(0, value))
  const ratio = clampedValue / safeMax
  const complete = ratio === 1

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={clampedValue}
      aria-label={label}
      className="h-2 overflow-hidden rounded-full bg-[var(--fg-4)]"
      data-complete={complete || undefined}
    >
      <div
        className="h-full w-full origin-left rounded-full transition-transform duration-[var(--dur-base)] ease-linear motion-reduce:transition-none"
        style={{ background: complete ? 'var(--fg-3)' : 'var(--primary)', transform: `scaleX(${ratio})` }}
      />
    </div>
  )
}
