import { describe, expect, it } from 'vitest'
import {
  buildRecapRequestUrl,
  buildShareCardStats,
  formatCompletionRate,
  isRecapShareEmpty,
  RECAP_SHARE_PERIODS,
  recapPeriodLabelKey,
  parseWrappedRouteSelection,
} from '../utils/share-card'
import { createMockRetrospectiveMetrics } from './factories'

describe('formatCompletionRate', () => {
  it('rounds to a whole-percent string', () => {
    expect(formatCompletionRate(82.4)).toBe('82%')
    expect(formatCompletionRate(82.6)).toBe('83%')
  })

  it('clamps out-of-range values', () => {
    expect(formatCompletionRate(-5)).toBe('0%')
    expect(formatCompletionRate(140)).toBe('100%')
  })
})

describe('buildRecapRequestUrl', () => {
  it('targets the recap endpoint with the period query', () => {
    expect(buildRecapRequestUrl('week')).toBe('/api/gamification/recap?period=week')
    expect(buildRecapRequestUrl('year')).toBe('/api/gamification/recap?period=year')
  })

  it('targets the carried closed month without changing the selected period', () => {
    expect(buildRecapRequestUrl('month', { year: 2026, month: 8 })).toBe(
      '/api/gamification/recap?period=month&year=2026&month=8',
    )
    expect(parseWrappedRouteSelection('month', '2026', '8')).toEqual({
      period: 'month',
      closedMonth: { year: 2026, month: 8 },
    })
  })
})

describe('recapPeriodLabelKey', () => {
  it('exposes the three share periods', () => {
    expect(RECAP_SHARE_PERIODS).toEqual(['week', 'month', 'year'])
  })

  it('maps a period to its i18n label key', () => {
    expect(recapPeriodLabelKey('month')).toBe('shareCard.periods.month')
  })
})

describe('buildShareCardStats', () => {
  it('derives an ordered, formatted stat model', () => {
    const stats = buildShareCardStats(
      createMockRetrospectiveMetrics({
        completionRate: 73.5,
        totalCompletions: 40,
        bestStreak: 18,
        activeDays: 5,
      }),
    )

    expect(stats.map((stat) => stat.labelKey)).toEqual([
      'shareCard.stats.completions',
      'shareCard.stats.bestStreak',
      'shareCard.stats.activeDays',
    ])
    expect(stats.map((stat) => stat.value)).toEqual(['40', '18', '5'])
  })

  it('handles all-zero metrics without throwing', () => {
    const stats = buildShareCardStats(
      createMockRetrospectiveMetrics({
        completionRate: 0,
        totalCompletions: 0,
        bestStreak: 0,
        activeDays: 0,
      }),
    )

    expect(stats.map((stat) => stat.value)).toEqual(['0', '0', '0'])
  })
})

describe('isRecapShareEmpty', () => {
  it('is true only when there is no logged activity', () => {
    expect(
      isRecapShareEmpty(createMockRetrospectiveMetrics({ totalCompletions: 0, activeDays: 0 })),
    ).toBe(true)
    expect(
      isRecapShareEmpty(createMockRetrospectiveMetrics({ totalCompletions: 3, activeDays: 0 })),
    ).toBe(false)
    expect(
      isRecapShareEmpty(createMockRetrospectiveMetrics({ totalCompletions: 0, activeDays: 2 })),
    ).toBe(false)
  })
})
