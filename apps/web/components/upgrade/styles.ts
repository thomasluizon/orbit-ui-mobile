import { formatLocaleDate } from '@orbit/shared/utils'

export function formatBillingDate(isoDate: string, locale: string): string {
  return formatLocaleDate(isoDate, locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
