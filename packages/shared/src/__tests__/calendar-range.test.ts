import { describe, it, expect } from 'vitest'
import { clampRangeToMaxDays, MAX_RANGE_DAYS } from '../utils/calendar-range'

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
