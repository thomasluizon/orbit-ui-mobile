import { describe, expect, it } from 'vitest'
import {
  detectDefaultTimeFormat,
  formatLocaleDate,
  formatLocaleDateTime,
  formatLocaleTime,
  resolveSupportedLocale,
  resolveSystemLocale,
} from '../utils/locale-format'

describe('locale-format utils', () => {
  it('formats time for English locale', () => {
    expect(formatLocaleTime('14:30', 'en')).toBe('2:30 PM')
  })

  it('formats time for Portuguese locale', () => {
    expect(formatLocaleTime('14:30', 'pt-BR')).toBe('14:30')
  })

  it('detects locale-specific default time formats', () => {
    expect(detectDefaultTimeFormat('en')).toBe('12h')
    expect(detectDefaultTimeFormat('pt-BR')).toBe('24h')
  })

  it('maps Portuguese system locales to pt-BR', () => {
    expect(resolveSystemLocale('pt-PT')).toBe('pt-BR')
    expect(resolveSystemLocale('en-US')).toBe('en')
  })

  it('normalizes supported locales and formats dates', () => {
    expect(resolveSupportedLocale('pt-BR')).toBe('pt-BR')
    expect(resolveSupportedLocale('fr-FR')).toBe('en')

    expect(
      formatLocaleDate('2026-04-06', 'en', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    ).toBe(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(Date.UTC(2026, 3, 6))),
    )
  })

  it('formats locale date-times and preserves invalid inputs', () => {
    expect(
      formatLocaleDateTime('2026-04-06T14:30:00Z', 'en', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    ).toBe('04/06/2026, 02:30 PM')

    expect(formatLocaleDate('not-a-date', 'en')).toBe('not-a-date')
    expect(formatLocaleDateTime('not-a-date', 'en')).toBe('not-a-date')
    expect(formatLocaleTime('25:61', 'en')).toBe('25:61')
    expect(formatLocaleTime(null, 'en')).toBe('')
  })
})
