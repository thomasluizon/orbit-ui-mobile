import { describe, it, expect } from 'vitest'
import { differenceInCalendarDays } from 'date-fns'
import {
  CALENDAR_MONTH_MAX_RANGE_DAYS,
  clampRangeToMaxDays,
  MAX_RANGE_DAYS,
  splitCalendarMonthRange,
} from '../utils/calendar-range'
import { parseAPIDate } from '../utils/dates'

describe('clampRangeToMaxDays', () => {
  it('caps the interval at 14 days', () => {
    expect(MAX_RANGE_DAYS).toBe(14)
  })

  it('leaves a short forward range untouched', () => {
    expect(clampRangeToMaxDays('2025-06-01', '2025-06-10')).toEqual({
      start: '2025-06-01',
      end: '2025-06-10',
      clamped: false,
    })
  })

  it('keeps an exactly-14-day range without clamping', () => {
    expect(clampRangeToMaxDays('2025-06-01', '2025-06-14')).toEqual({
      start: '2025-06-01',
      end: '2025-06-14',
      clamped: false,
    })
  })

  it('clamps a forward range longer than 14 days to the anchor', () => {
    expect(clampRangeToMaxDays('2025-06-01', '2025-06-30')).toEqual({
      start: '2025-06-01',
      end: '2025-06-14',
      clamped: true,
    })
  })

  it('clamps a backward range longer than 14 days, preserving the anchor end', () => {
    expect(clampRangeToMaxDays('2025-06-20', '2025-06-01')).toEqual({
      start: '2025-06-07',
      end: '2025-06-20',
      clamped: true,
    })
  })

  it('orders a same-day pick without clamping', () => {
    expect(clampRangeToMaxDays('2025-06-05', '2025-06-05')).toEqual({
      start: '2025-06-05',
      end: '2025-06-05',
      clamped: false,
    })
  })
})

describe('splitCalendarMonthRange', () => {
  it('pins the endpoint cap at 62 days', () => {
    expect(CALENDAR_MONTH_MAX_RANGE_DAYS).toBe(62)
  })

  it('returns a single chunk for a range within the cap', () => {
    expect(splitCalendarMonthRange('2025-06-01', '2025-06-30')).toEqual([
      { from: '2025-06-01', to: '2025-06-30' },
    ])
  })

  it('returns a single chunk for an exactly-62-day span', () => {
    expect(splitCalendarMonthRange('2025-01-01', '2025-03-04')).toEqual([
      { from: '2025-01-01', to: '2025-03-04' },
    ])
  })

  it('returns a single chunk for a same-day range', () => {
    expect(splitCalendarMonthRange('2025-06-05', '2025-06-05')).toEqual([
      { from: '2025-06-05', to: '2025-06-05' },
    ])
  })

  it('splits a contiguous, gap-free, non-overlapping quarter span', () => {
    const chunks = splitCalendarMonthRange('2026-04-03', '2026-07-03')
    expect(chunks[0]!.from).toBe('2026-04-03')
    expect(chunks.at(-1)!.to).toBe('2026-07-03')
    for (let i = 1; i < chunks.length; i += 1) {
      expect(
        differenceInCalendarDays(
          parseAPIDate(chunks[i]!.from),
          parseAPIDate(chunks[i - 1]!.to),
        ),
      ).toBe(1)
    }
  })

  it.each([
    ['quarter', '2026-04-03', '2026-07-03'],
    ['year', '2025-07-03', '2026-07-03'],
    ['two years', '2024-01-01', '2026-01-01'],
  ])('keeps every %s chunk within the 62-day cap', (_label, from, to) => {
    for (const chunk of splitCalendarMonthRange(from, to)) {
      const span = differenceInCalendarDays(
        parseAPIDate(chunk.to),
        parseAPIDate(chunk.from),
      )
      expect(span).toBeGreaterThanOrEqual(0)
      expect(span).toBeLessThanOrEqual(CALENDAR_MONTH_MAX_RANGE_DAYS)
    }
  })
})
