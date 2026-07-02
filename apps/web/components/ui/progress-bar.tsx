interface ProgressBarProps {
  /** Fill ratio between 0 and 1 (values outside the range are clamped). */
  progress: number
  label: string
  /** Fill color override (defaults to the scheme primary). */
  color?: string
  className?: string
}

/** Kit progress bar: 8px pill track with a primary fill animated via scaleX only. */
export function ProgressBar({ progress, label, color, className }: Readonly<ProgressBarProps>) {
  const clamped = Math.min(1, Math.max(0, progress))

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-label={label}
      className={['h-2 overflow-hidden rounded-full transition-opacity duration-[var(--dur-base)]', className].filter(Boolean).join(' ')}
      style={{
        background: 'color-mix(in srgb, var(--fg-1) 8%, transparent)',
        opacity: clamped === 0 ? 0.45 : 1,
      }}
    >
      <div
        className="h-full w-full origin-left rounded-full transition-transform duration-[var(--dur-base)] ease-[var(--ease-standard)] motion-reduce:transition-none"
        style={{ background: color ?? 'var(--primary)', transform: `scaleX(${clamped})` }}
      />
    </div>
  )
}
