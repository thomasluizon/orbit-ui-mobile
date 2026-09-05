import { formatLocaleDate } from '@orbit/shared/utils'

export const cardSurface: React.CSSProperties = {
  background: 'var(--bg-card)',
  boxShadow: 'inset 0 0 0 1px var(--hairline)',
}

export const cardLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  color: 'var(--fg-3)',
}

export const metaTextStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--fg-3)',
}

export function formatBillingDate(isoDate: string, locale: string): string {
  return formatLocaleDate(isoDate, locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
