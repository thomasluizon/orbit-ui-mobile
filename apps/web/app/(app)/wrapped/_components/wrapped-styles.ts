import type { CSSProperties } from 'react'

export const eyebrowStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--fg-3)',
}

export const heroNumeralStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 44,
  lineHeight: 1,
  fontWeight: 700,
  letterSpacing: '-0.02em',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--fg-1)',
}

export const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 16,
  fontWeight: 500,
  color: 'var(--fg-2)',
}

export const captionStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  color: 'var(--fg-2)',
  maxWidth: 280,
  textAlign: 'center',
  textWrap: 'pretty',
}

export const titleStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 34,
  lineHeight: 1.1,
  fontWeight: 700,
  letterSpacing: '-0.02em',
  color: 'var(--fg-1)',
  textAlign: 'center',
  textWrap: 'balance',
}

export const coverTitleStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 60,
  lineHeight: 1.15,
  fontWeight: 700,
  letterSpacing: '-0.02em',
  color: 'var(--fg-1)',
  textWrap: 'balance',
}

export const coverSubtitleStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  color: 'var(--fg-2)',
  maxWidth: 300,
  textWrap: 'pretty',
}

export const dayLabelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  fontWeight: 400,
  letterSpacing: '0.02em',
  color: 'var(--fg-3)',
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'center',
}
