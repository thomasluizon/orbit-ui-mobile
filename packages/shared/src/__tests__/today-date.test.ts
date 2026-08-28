import { describe, expect, it } from 'vitest'
import { canNavigateToNextDay, getDayOffset, getTodayBoundary } from '../utils/today-date'

describe('Hoje date boundaries', () => {
  it('uses calendar days across month boundaries', () => {
    expect(getDayOffset('2026-03-31', '2026-04-08')).toBe(-8)
  })

  it('distinguishes the last loggable, read-only, and future notices', () => {
    expect(getTodayBoundary('2026-04-01', '2026-04-08')).toBe('last-loggable')
    expect(getTodayBoundary('2026-03-31', '2026-04-08')).toBe('read-only')
    expect(getTodayBoundary('2026-04-09', '2026-04-08')).toBe('future')
    expect(getTodayBoundary('2026-04-08', '2026-04-08')).toBeNull()
  })

  it('allows the 90th day and stops after it', () => {
    expect(canNavigateToNextDay('2026-07-06', '2026-04-08')).toBe(true)
    expect(canNavigateToNextDay('2026-07-07', '2026-04-08')).toBe(false)
  })
})
