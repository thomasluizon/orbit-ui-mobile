import { describe, expect, it } from 'vitest'
import {
  DAY_PERIODS,
  formatTimeParts,
  from12Hour,
  HOURS_12,
  HOURS_24,
  MINUTES,
  padTimePart,
  parseTimeParts,
  to12Hour,
} from '../utils/time-parts'

describe('time part columns', () => {
  it('offers every hour and every minute, so no value is out of reach', () => {
    expect(HOURS_24).toHaveLength(24)
    expect(HOURS_24[0]).toBe(0)
    expect(HOURS_24.at(-1)).toBe(23)

    expect(HOURS_12).toHaveLength(12)
    expect(HOURS_12[0]).toBe(1)
    expect(HOURS_12.at(-1)).toBe(12)

    expect(MINUTES).toHaveLength(60)
    expect(MINUTES[0]).toBe(0)
    expect(MINUTES.at(-1)).toBe(59)

    expect(DAY_PERIODS).toEqual(['AM', 'PM'])
  })
})

describe('padTimePart', () => {
  it('pads a single digit and leaves two digits alone', () => {
    expect(padTimePart(0)).toBe('00')
    expect(padTimePart(7)).toBe('07')
    expect(padTimePart(23)).toBe('23')
  })
})

describe('parseTimeParts', () => {
  it('reads an odd minute as written', () => {
    expect(parseTimeParts('07:13')).toEqual({ hour24: 7, minute: 13 })
    expect(parseTimeParts('07:45')).toEqual({ hour24: 7, minute: 45 })
    expect(parseTimeParts('23:59')).toEqual({ hour24: 23, minute: 59 })
  })

  it('accepts a single-digit hour', () => {
    expect(parseTimeParts('7:05')).toEqual({ hour24: 7, minute: 5 })
  })

  it.each(['', 'noon', '7', '07:5', '07:005', '24:00', '23:60', '-1:00'])(
    'rejects %j',
    (value) => {
      expect(parseTimeParts(value)).toBeNull()
    },
  )
})

describe('formatTimeParts', () => {
  it('writes the canonical HH:MM the API stores', () => {
    expect(formatTimeParts({ hour24: 7, minute: 13 })).toBe('07:13')
    expect(formatTimeParts({ hour24: 0, minute: 0 })).toBe('00:00')
    expect(formatTimeParts({ hour24: 23, minute: 59 })).toBe('23:59')
  })
})

describe('to12Hour', () => {
  it.each([
    [0, 12, 'AM'],
    [1, 1, 'AM'],
    [11, 11, 'AM'],
    [12, 12, 'PM'],
    [13, 1, 'PM'],
    [23, 11, 'PM'],
  ])('reads %i as %i %s', (hour24, hour12, period) => {
    expect(to12Hour(hour24)).toEqual({ hour12, period })
  })
})

describe('from12Hour', () => {
  it.each([
    [12, 'AM', 0],
    [1, 'AM', 1],
    [11, 'AM', 11],
    [12, 'PM', 12],
    [1, 'PM', 13],
    [11, 'PM', 23],
  ])('writes %i %s as %i', (hour12, period, hour24) => {
    expect(from12Hour(hour12, period as 'AM' | 'PM')).toBe(hour24)
  })

  it('round-trips every hour through the 12-hour columns', () => {
    for (const hour24 of HOURS_24) {
      const { hour12, period } = to12Hour(hour24)
      expect(from12Hour(hour12, period)).toBe(hour24)
    }
  })
})
