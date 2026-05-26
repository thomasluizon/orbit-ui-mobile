import type { ReactNode } from 'react'

/** Astra/Claude prose with a primary left-rule, optional mono eyebrow above. */
interface PullQuoteProps {
  children: ReactNode
  eyebrow?: ReactNode
  italic?: boolean
  paddingX?: number
  paddingY?: number | string
}

export function PullQuote({
  children,
  eyebrow,
  italic = true,
  paddingX = 20,
  paddingY = 14,
}: Readonly<PullQuoteProps>) {
  return (
    <div style={{ padding: `${typeof paddingY === 'number' ? `${paddingY}px` : paddingY} ${paddingX}px` }}>
      <div className="relative" style={{ paddingLeft: 14 }}>
        <span
          aria-hidden="true"
          className="absolute"
          style={{
            left: 0,
            top: 4,
            bottom: 4,
            width: 2,
            background: 'var(--primary)',
            borderRadius: 1,
          }}
        />
        {eyebrow && (
          <div
            className="inline-flex items-center"
            style={{
              fontFamily: 'var(--font-family-mono)',
              fontSize: 10.5,
              fontWeight: 500,
              letterSpacing: '0.06em',
              color: 'var(--fg-3)',
              marginBottom: 6,
              gap: 6,
            }}
          >
            {eyebrow}
          </div>
        )}
        <div
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 15,
            lineHeight: 1.5,
            color: 'var(--fg-2)',
            fontStyle: italic ? 'italic' : 'normal',
            textWrap: 'pretty',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
