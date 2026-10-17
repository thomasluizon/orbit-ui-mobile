import { describe, expect, it } from 'vitest'
import { chatClientContextSchema, chatResponseSchema } from '../types/chat'
import { getMetricsRows, liveMetricsCard } from '../chat/metrics-card-core'

const series = { granularity: 'day', points: [{
  startDate: '2026-09-01', endDate: '2026-09-01', scheduled: 2, completed: 1, completionRate: 50,
}] }

describe('Astra metrics response contract', () => {
  it('keeps the API metrics and insight payloads', () => {
    const metricsCard = {
      period: 'week', completionRate: 50, totalCompletions: 1, totalScheduled: 2,
      activeDays: 1, currentStreak: 1, bestStreak: 1, hasData: true,
      surfaceId: 'progress', series, topHabitName: 'Walk', topHabitEmoji: '🚶',
    }
    const periodInsight = {
      period: 'month', dateFrom: '2026-09-01', dateTo: '2026-09-30',
      completionRate: 50, activeDays: 1, periodDays: 30, totalCompletions: 1,
      totalScheduled: 2, currentStreak: 1, bestStreak: 1, topHabits: [],
      needsAttention: [], narrative: { highlights: 'Walked', missed: '', trends: 'Steady', suggestion: 'Continue' },
      series, surfaceId: 'progress',
    }
    const response = chatResponseSchema.parse({ actions: [], metricsCard, periodInsight })
    expect(response.metricsCard).toEqual(metricsCard)
    expect(response.periodInsight).toEqual(periodInsight)
  })

  it('accepts both capability flags', () => {
    const context = chatClientContextSchema.parse({
      platform: 'web', locale: 'en', timeFormat: 'h12', currentAppArea: 'chat',
      supportsHabitListCard: true, supportsGoalListCard: true,
      supportsMetricsCard: true, supportsPeriodInsightCard: true,
    })
    expect(context.supportsMetricsCard).toBe(true)
    expect(context.supportsPeriodInsightCard).toBe(true)
  })

  it('builds the three overview and habit rows without inventing a missing rate', () => {
    const base = {
      period: 'week', completionRate: 50, totalCompletions: 1, totalScheduled: 2,
      activeDays: 1, currentStreak: 1, bestStreak: 3, hasData: true, surfaceId: 'progress',
    }
    expect(getMetricsRows(base).map((row) => row.id)).toEqual(['completionRate', 'activeDays', 'topHabit'])
    expect(getMetricsRows({ ...base, habitId: '92ca0543-c3e1-4f41-9370-c55e1bfa8157' }).map((row) => row.id)).toEqual(['currentStreak', 'bestStreak', 'monthlyRate'])
    expect(getMetricsRows({ ...base, habitId: '92ca0543-c3e1-4f41-9370-c55e1bfa8157' })[2]?.value).toBeNull()
    expect(getMetricsRows({ ...base, hasData: false })).toEqual([])
  })
})

it('updates habit figure visibility from live metrics when the reply was empty', () => {
  const snapshot = { period: 'habit', habitId: 'habit-1', completionRate: 0, totalCompletions: 0, totalScheduled: 0, activeDays: 0, currentStreak: 0, bestStreak: 0, hasData: false, surfaceId: 'progress' }
  const habit = { currentStreak: 2, longestStreak: 4, weeklyCompletionRate: 50, monthlyCompletionRate: 25, totalCompletions: 5, lastCompletedDate: '2026-10-17' }
  const populated = liveMetricsCard(snapshot, habit, undefined)
  expect(populated.hasData).toBe(true)
  expect(getMetricsRows(populated)).toHaveLength(3)
  expect(liveMetricsCard({ ...snapshot, hasData: true }, { ...habit, totalCompletions: 0 }, undefined).hasData).toBe(false)
})
