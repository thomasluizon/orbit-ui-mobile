import { isToday as isDateToday, isTomorrow, isYesterday } from 'date-fns'
import { formatLocaleDate } from '@orbit/shared/utils'

/** Formats a habit date-group key (yyyy-MM-dd) into a localized header label:
 *  Today / Tomorrow / Yesterday, else a full weekday-month-day-year date. */
export function formatDateGroupLabel(
  key: string,
  locale: string,
  t: (key: string) => string,
): string {
  if (!key) return t('common.unknown')

  const date = new Date(key + 'T00:00:00')

  if (isDateToday(date)) return t('dates.today')
  if (isTomorrow(date)) return t('dates.tomorrow')
  if (isYesterday(date)) return t('dates.yesterday')

  return formatLocaleDate(date, locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
