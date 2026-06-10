import type { ReactNode } from 'react'

/** Saturn-ring celebration motif: concentric expanding hairline rings + anchor + body. */
interface RingMotifProps {
  anchor: ReactNode
  body?: ReactNode
  eyebrow?: ReactNode
  eyebrowColor?: string
  ringCount?: number
  ringSize?: number
  ringColor?: string
  dashed?: boolean
}

export function RingMotif({
  anchor,
  body,
  eyebrow,
  eyebrowColor,
  ringCount = 3,
  ringSize = 280,
  ringColor,
  dashed = false,
}: Readonly<RingMotifProps>) {
  const color = ringColor ?? 'var(--primary)'

  return (
    <div
      className="relative flex flex-col items-center"
      style={{ gap: 16 }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        {Array.from({ length: ringCount }).map((_, i) => {
          const size = (ringSize * (i + 1)) / ringCount
          const opacity = i === 0 ? 0.85 : (1 - i / ringCount) * 0.6
          return (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                width: size,
                height: size,
                border: `1px ${dashed ? 'dashed' : 'solid'} ${color}`,
                opacity,
              }}
            />
          )
        })}
      </div>

      {eyebrow && (
        <div
          className="relative"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 600,
            color: eyebrowColor ?? 'rgba(255,255,255,0.7)',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            zIndex: 1,
          }}
        >
          {eyebrow}
        </div>
      )}
      <div className="relative" style={{ zIndex: 1 }}>
        {anchor}
      </div>
      {body && (
        <div
          className="relative"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 16,
            fontStyle: 'italic',
            color: 'rgba(255,255,255,0.85)',
            zIndex: 1,
          }}
        >
          {body}
        </div>
      )}
    </div>
  )
}
