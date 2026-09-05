import { formatLocaleDate } from '@orbit/shared/utils'

export const cardSurface: React.CSSProperties = {
  background: 'var(--bg-card)',
  boxShadow: 'inset 0 0 0 1px var(--hairline)',
}

export function formatBillingDate(isoDate: string, locale: string): string {
  return formatLocaleDate(isoDate, locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
