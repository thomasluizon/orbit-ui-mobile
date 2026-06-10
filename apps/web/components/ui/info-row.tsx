'use client'

interface InfoRowProps {
  /** Mono caption (e.g. "2 of 6 · 33%"). */
  label?: string
  /** Render the label in mono with tabular nums (default true). */
  mono?: boolean
  /** Optional progress 0..1 — renders a hairline bar below the label. */
  progress?: number
}

/**
 * v8 InfoRow: 1-line stat strip used directly below the AppBar.
 * Optional progress bar renders as a 3px hairline track with primary fill.
 */
export function InfoRow({ label, mono = true, progress }: Readonly<InfoRowProps>) {
  const clampedProgress =
    typeof progress === 'number' ? Math.max(0, Math.min(1, progress)) : null

  return (
    <div
      className="flex flex-col gap-2 border-b border-[var(--hairline)]"
      style={{ padding: '12px 20px' }}
    >
      {label ? (
        <span
          className="truncate text-[var(--fg-3)]"
          style={
            mono
              ? {
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '0.04em',
                }
              : { fontFamily: 'var(--font-sans)', fontSize: 12 }
          }
        >
          {label}
        </span>
      ) : null}
      {clampedProgress !== null ? (
        <div className="overflow-hidden rounded-full bg-[var(--bg-sunk)]" style={{ height: 3 }}>
          <div
            className="h-full rounded-full bg-[var(--primary)]"
            style={{ width: `${Math.round(clampedProgress * 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}
