import { formatLocaleDate, formatLocaleDateTime } from '../utils'

const DATE_NUMERIC: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}

const DATE_MEDIUM: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
}

const DATE_LONG: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
}

const WEEKDAY_MEDIUM: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
}

const WEEKDAY_LONG: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
}

const MONTH_YEAR: Intl.DateTimeFormatOptions = {
  month: 'long',
  year: 'numeric',
}

const DATETIME_SHORT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}

export type DateFormatInput = Date | number | string | null | undefined

export interface LocaleDateFormatters {
  locale: string
  displayDate: (value: DateFormatInput, options?: Intl.DateTimeFormatOptions) => string
  displayDateNumeric: (value: DateFormatInput) => string
  displayDateMedium: (value: DateFormatInput) => string
  displayWeekdayDate: (value: DateFormatInput, long?: boolean) => string
  displayMonthYear: (value: DateFormatInput) => string
  displayDateTime: (value: DateFormatInput, options?: Intl.DateTimeFormatOptions) => string
}

/**
 * Framework-agnostic locale-bound date/time display helpers shared by the web
 * and mobile `useDateFormat` hooks. Each hook resolves its locale through its
 * own i18n adapter (next-intl vs react-i18next) and memoizes this factory on it.
 */
export function createLocaleDateFormatters(locale: string): LocaleDateFormatters {
  return {
    locale,
    displayDate: (value, options = DATE_LONG) => {
      if (value === null || value === undefined) return ''
      return formatLocaleDate(value, locale, options)
    },
    displayDateNumeric: (value) => {
      if (value === null || value === undefined) return ''
      return formatLocaleDate(value, locale, DATE_NUMERIC)
    },
    displayDateMedium: (value) => {
      if (value === null || value === undefined) return ''
      return formatLocaleDate(value, locale, DATE_MEDIUM)
    },
    displayWeekdayDate: (value, long = false) => {
      if (value === null || value === undefined) return ''
      return formatLocaleDate(value, locale, long ? WEEKDAY_LONG : WEEKDAY_MEDIUM)
    },
    displayMonthYear: (value) => {
      if (value === null || value === undefined) return ''
      return formatLocaleDate(value, locale, MONTH_YEAR)
    },
    displayDateTime: (value, options = DATETIME_SHORT) => {
      if (value === null || value === undefined) return ''
      return formatLocaleDateTime(value, locale, options)
    },
  }
}
