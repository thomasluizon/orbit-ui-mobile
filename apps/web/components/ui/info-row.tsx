'use client'

interface InfoRowProps {
  /** Caption line (Rubik 14 fg-3; Roboto tabular meta when `mono`). */
  label?: string
  /** Render the label in mono with tabular nums (default true). */
  mono?: boolean
  /** Optional value line under the label (Rubik 16 fg-1). */
  value?: string
  /** Optional progress 0..1 — renders a hairline bar below the text. */
  progress?: number
}

/**
 * Kit ListRow-language info strip: label over optional value, used directly
 * below the AppBar and for key/value rows. Optional 3px progress bar.
 */
export function InfoRow({ label, mono = true, value, progress }: Readonly<InfoRowProps>) {
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
                  letterSpacing: '0.02em',
                }
              : { fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 400 }
          }
        >
          {label}
        </span>
      ) : null}
      {value ? (
        <span
          className="truncate text-[var(--fg-1)]"
          style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 400 }}
        >
          {value}
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
