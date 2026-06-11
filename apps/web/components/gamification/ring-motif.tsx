import type { ReactNode } from 'react'

/** Saturn-ring celebration motif: concentric expanding hairline rings + optional eyebrow above the anchor. */
interface RingMotifProps {
  anchor: ReactNode
  eyebrow?: ReactNode
  eyebrowColor?: string
  ringCount?: number
  ringSize?: number
  ringColor?: string
  dashed?: boolean
}

export function RingMotif({
  anchor,
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
        data-slot="celebration-rings"
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
          className="relative z-[1]"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: eyebrowColor ?? 'var(--fg-3)',
          }}
        >
          {eyebrow}
        </div>
      )}
      <div className="relative z-[1]">{anchor}</div>
    </div>
  )
}
