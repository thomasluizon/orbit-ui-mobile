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

function getIntlLocale(locale?: string | null): string {
  return normalizeLocale(locale) === 'pt-BR' ? 'pt-BR' : 'en-US'
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
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  },
): string {
  const date = parseDateInput(value)
  if (!date) {
    return typeof value === 'string' ? value : ''
  }

  return new Intl.DateTimeFormat(getIntlLocale(locale), options).format(date)
}

export function formatLocaleDateTime(
  value: DateInput,
  locale?: string | null,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  },
): string {
  const date = parseDateInput(value)
  if (!date) {
    return typeof value === 'string' ? value : ''
  }

  return new Intl.DateTimeFormat(getIntlLocale(locale), options).format(date)
}

export function formatLocaleTime(
  value: TimeInput,
  locale?: string | null,
  options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
  },
): string {
  const date = parseTimeInput(value)
  if (!date) {
    return value ?? ''
  }

  return new Intl.DateTimeFormat(getIntlLocale(locale), options).format(date)
}
