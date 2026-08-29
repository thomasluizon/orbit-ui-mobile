import { describe, expect, it } from 'vitest'
import { canNavigateToNextDay, getTodayBoundary } from '@orbit/shared/utils'

describe('Hoje date boundaries', () => {
  it('keeps seven days back loggable and marks the next day read only', () => {
    expect(getTodayBoundary('2026-04-01', '2026-04-08')).toBe('last-loggable')
    expect(getTodayBoundary('2026-03-31', '2026-04-08')).toBe('read-only')
  })

  it('marks future days without blocking navigation', () => {
    expect(getTodayBoundary('2026-04-09', '2026-04-08')).toBe('future')
  })

  it('stops the forward control at the API horizon', () => {
    expect(canNavigateToNextDay('2026-07-06', '2026-04-08')).toBe(true)
    expect(canNavigateToNextDay('2026-07-07', '2026-04-08')).toBe(false)
  })
})
