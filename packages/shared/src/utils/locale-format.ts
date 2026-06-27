import type { SupportedLocale } from '../types/profile'
import { parseAPIDate } from './dates'

type DateInput = Date | number | string
type TimeInput = string | null | undefined

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime())
}

function normalizeLocale(locale?: string | null): SupportedLocale {
  return locale === 'pt-BR' ? 'pt-BR' : 'en'
}

function isValidBcp47(locale: string): boolean {
  return /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(locale)
}

function getIntlLocale(locale?: string | null): string {
  if (locale && isValidBcp47(locale)) {
    return locale
  }
  return getSystemLocale()
}

export function getSystemLocale(): string {
  try {
    const resolved = new Intl.DateTimeFormat().resolvedOptions().locale
    if (resolved && isValidBcp47(resolved)) {
      return resolved
    }
  } catch {
  }
  return 'en-US'
}

function parseDateInput(value: DateInput): Date | null {
  if (value instanceof Date) {
    return isValidDate(value) ? value : null
  }

  if (typeof value === 'number') {
    const parsed = new Date(value)
    return isValidDate(parsed) ? parsed : null
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = parseAPIDate(value)
    return isValidDate(parsed) ? parsed : null
  }

  const parsed = new Date(value)
  return isValidDate(parsed) ? parsed : null
}

function parseTimeInput(value: TimeInput): Date | null {
  if (!value || !/^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return null
  }

  const [hoursRaw, minutesRaw, secondsRaw] = value.split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  const seconds = Number(secondsRaw ?? '0')

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    Number.isNaN(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null
  }

  return new Date(2000, 0, 1, hours, minutes, seconds)
}

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}

const DEFAULT_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
}

const DEFAULT_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
}

function formatIntlDateValue(
  value: Date | null,
  fallback: string,
  locale?: string | null,
  options?: Intl.DateTimeFormatOptions,
  defaultOptions?: Intl.DateTimeFormatOptions,
): string {
  if (!value) {
    return fallback
  }

  return new Intl.DateTimeFormat(
    getIntlLocale(locale),
    options ?? defaultOptions,
  ).format(value)
}

export function resolveSupportedLocale(locale?: string | null): SupportedLocale {
  return normalizeLocale(locale)
}

export function resolveSystemLocale(locale?: string | null): SupportedLocale {
  return locale?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'
}

export function detectDefaultTimeFormat(locale?: string | null): '12h' | '24h' {
  try {
    const resolved = new Intl.DateTimeFormat(getIntlLocale(locale), {
      hour: 'numeric',
    }).resolvedOptions() as { hour12?: boolean }
    return resolved.hour12 ? '12h' : '24h'
  } catch {
    return '24h'
  }
}

export function formatLocaleDate(
  value: DateInput,
  locale?: string | null,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = parseDateInput(value)
  return formatIntlDateValue(
    date,
    typeof value === 'string' ? value : '',
    locale,
    options,
    DEFAULT_DATE_OPTIONS,
  )
}

/** Uppercases only the first character, leaving the rest untouched. Use for
 *  localized month-year labels so locale connectors (e.g. pt-BR "de") stay
 *  lowercase while the month keeps its leading capital. */
export function capitalizeFirstLetter(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value
}

/** Splits a localized long "month year" label into its leading part (the month
 *  plus any locale connector, with only the first letter capitalized) and the
 *  year digits, so the year can render as its own control.
 *  e.g. pt-BR → { lead: "Agosto de", year: "2028" }; en → { lead: "August", year: "2028" }. */
export function splitMonthYear(
  value: DateInput,
  locale?: string | null,
): { lead: string; year: string } {
  const date = parseDateInput(value)
  if (!date) {
    return { lead: typeof value === 'string' ? value : '', year: '' }
  }
  const parts = new Intl.DateTimeFormat(getIntlLocale(locale), {
    month: 'long',
    year: 'numeric',
  }).formatToParts(date)
  const yearIndex = parts.findIndex((part) => part.type === 'year')
  const year =
    yearIndex >= 0 ? parts[yearIndex]!.value : String(date.getFullYear())
  const leadParts = yearIndex > 0 ? parts.slice(0, yearIndex) : []
  const lead = leadParts
    .map((part) => part.value)
    .join('')
    .trim()
  return { lead: capitalizeFirstLetter(lead), year }
}

export function formatLocaleDateTime(
  value: DateInput,
  locale?: string | null,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = parseDateInput(value)
  return formatIntlDateValue(
    date,
    typeof value === 'string' ? value : '',
    locale,
    options,
    DEFAULT_DATE_TIME_OPTIONS,
  )
}

export function formatLocaleTime(
  value: TimeInput,
  locale?: string | null,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = parseTimeInput(value)
  return formatIntlDateValue(
    date,
    value ?? '',
    locale,
    options,
    DEFAULT_TIME_OPTIONS,
  )
}

export function formatDeviceDate(
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
): string {
  return formatLocaleDate(value, getSystemLocale(), options)
}

export function formatDeviceDateTime(
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
): string {
  return formatLocaleDateTime(value, getSystemLocale(), options)
}

export function formatDeviceTime(
  value: TimeInput,
  options?: Intl.DateTimeFormatOptions,
): string {
  return formatLocaleTime(value, getSystemLocale(), options)
}
