import type { CSSProperties } from 'react'

export const heroNumeralStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 60,
  lineHeight: 1,
  fontWeight: 600,
  letterSpacing: '-0.03em',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--fg-1)',
}

export const streakNumeralStyle: CSSProperties = {
  ...heroNumeralStyle,
  fontSize: 44,
}

export const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 20,
  fontWeight: 400,
  color: 'var(--fg-2)',
}

export const captionStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 16,
  lineHeight: 1.55,
  color: 'var(--fg-3)',
  maxWidth: '40ch',
  textWrap: 'pretty',
}

const baseTitleStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  lineHeight: 1.15,
  fontWeight: 500,
  letterSpacing: '-0.02em',
  color: 'var(--fg-1)',
  textWrap: 'balance',
}

export const titleStyle: CSSProperties = {
  ...baseTitleStyle,
  fontSize: 28,
}

export const introTitleStyle: CSSProperties = { ...baseTitleStyle, lineHeight: 1.1, letterSpacing: '-0.03em' }
export const topHabitTitleStyle: CSSProperties = { ...baseTitleStyle, fontSize: 34, lineHeight: 1.1 }
export const weekdayNoteStyle: CSSProperties = { ...captionStyle, fontSize: 14, maxWidth: '46ch' }
export const weekdayReadingStyle: CSSProperties = { ...captionStyle, color: 'var(--fg-2)' }

export const coverTitleStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 34,
  lineHeight: 1.1,
  fontWeight: 500,
  letterSpacing: '-0.03em',
  color: 'var(--fg-1)',
  textWrap: 'pretty',
}

export const coverSubtitleStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 16,
  lineHeight: 1.55,
  color: 'var(--fg-3)',
  textWrap: 'pretty',
}

export const coverEyebrowStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--fg-3)',
}
