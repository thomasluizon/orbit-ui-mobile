import { describe, expect, it } from 'vitest'
import {
  formatDeviceDate,
  formatDeviceDateTime,
  formatDeviceTime,
  formatLocaleDate,
  getSystemLocale,
  splitMonthYear,
} from '../utils/locale-format'

describe('device formatters', () => {
  it('resolves and memoizes the system locale across calls', () => {
    const first = getSystemLocale()
    const second = getSystemLocale()

    expect(first).toBe(second)
    expect(first.length).toBeGreaterThan(0)
  })

  it('formats a date, date-time and time using the device locale', () => {
    expect(formatDeviceDate('2026-04-06')).toMatch(/2026/)
    expect(formatDeviceDateTime('2026-04-06T14:30:00Z')).toMatch(/2026/)
    expect(formatDeviceTime('14:30')).toMatch(/\d/)
  })
})

describe('formatLocaleDate input parsing', () => {
  it('formats an epoch-millisecond number input', () => {
    const millis = Date.UTC(2026, 3, 6)

    expect(
      formatLocaleDate(millis, 'en', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    ).toMatch(/2026/)
  })

  it('falls back to the device locale when the locale is not valid BCP-47', () => {
    expect(formatLocaleDate('2026-04-06', '123')).toMatch(/2026/)
  })
})

describe('splitMonthYear invalid input', () => {
  it('returns the raw string and empty year for an unparseable value', () => {
    expect(splitMonthYear('not-a-date', 'en')).toEqual({ lead: 'not-a-date', year: '' })
  })
})
