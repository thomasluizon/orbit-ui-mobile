/** Mono-typed stat strip used below the AppBar (e.g., Today's "2 of 6 · 33%"). */
interface InfoRowProps {
  label: string
  progress?: number
  mono?: boolean
}

export function InfoRow({ label, progress, mono = true }: Readonly<InfoRowProps>) {
  return (
    <div
      className="flex items-center shrink-0"
      style={{
        padding: '12px 20px',
        gap: 16,
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      <span
        className="whitespace-nowrap"
        style={{
          fontFamily: mono ? 'var(--font-family-mono)' : 'var(--font-family-sans)',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--fg-2)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {label}
      </span>
      {progress != null && (
        <div
          className="relative flex-1 rounded-full"
          style={{ height: 3, background: 'var(--bg-sunk)' }}
        >
          <div
            className="absolute left-0 top-0 bottom-0 rounded-full"
            style={{
              width: `${Math.max(0, Math.min(100, Math.round(progress * 100)))}%`,
              background: 'var(--primary)',
            }}
          />
        </div>
      )}
    </div>
  )
}
