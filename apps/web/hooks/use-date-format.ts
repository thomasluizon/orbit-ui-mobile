'use client'

import { useCallback, useMemo } from 'react'
import { formatLocaleDate, formatLocaleDateTime } from '@orbit/shared/utils'
import { useDeviceLocale } from './use-device-locale'

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

type DateInput = Date | number | string | null | undefined

export function useDateFormat() {
  const locale = useDeviceLocale()

  const displayDate = useCallback(
    (value: DateInput, options: Intl.DateTimeFormatOptions = DATE_LONG) => {
      if (value === null || value === undefined) return ''
      return formatLocaleDate(value, locale, options)
    },
    [locale],
  )

  const displayDateNumeric = useCallback(
    (value: DateInput) => {
      if (value === null || value === undefined) return ''
      return formatLocaleDate(value, locale, DATE_NUMERIC)
    },
    [locale],
  )

  const displayDateMedium = useCallback(
    (value: DateInput) => {
      if (value === null || value === undefined) return ''
      return formatLocaleDate(value, locale, DATE_MEDIUM)
    },
    [locale],
  )

  const displayWeekdayDate = useCallback(
    (value: DateInput, long = false) => {
      if (value === null || value === undefined) return ''
      return formatLocaleDate(value, locale, long ? WEEKDAY_LONG : WEEKDAY_MEDIUM)
    },
    [locale],
  )

  const displayMonthYear = useCallback(
    (value: DateInput) => {
      if (value === null || value === undefined) return ''
      return formatLocaleDate(value, locale, MONTH_YEAR)
    },
    [locale],
  )

  const displayDateTime = useCallback(
    (value: DateInput, options: Intl.DateTimeFormatOptions = DATETIME_SHORT) => {
      if (value === null || value === undefined) return ''
      return formatLocaleDateTime(value, locale, options)
    },
    [locale],
  )

  return useMemo(
    () => ({
      locale,
      displayDate,
      displayDateNumeric,
      displayDateMedium,
      displayWeekdayDate,
      displayMonthYear,
      displayDateTime,
    }),
    [locale, displayDate, displayDateNumeric, displayDateMedium, displayWeekdayDate, displayMonthYear, displayDateTime],
  )
}
