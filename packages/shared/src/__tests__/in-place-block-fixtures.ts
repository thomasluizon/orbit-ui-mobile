import { vi } from 'vitest'
import type { z } from 'zod'
const { PostApiChatResponse } = await vi.importActual<{ PostApiChatResponse: z.ZodObject<{ daySummary: z.ZodType; calendar: z.ZodType }> }>('../types/__generated__/api.generated')
import { calendarCardSchema, daySummaryCardSchema } from '../types/chat'
import { logHabitResponseSchema } from '../types/habit'
import { createMockRecap, createMockRetrospectiveMetrics } from './factories'

export const successfulUnlogResponse = logHabitResponseSchema.parse({
  logId: '11111111-1111-4111-8111-111111111111', isFirstCompletionToday: false,
  currentStreak: 0, linkedGoalUpdates: [], xpEarned: null, newAchievementIds: null,
})

export function recapWithCompletions(completed: number) {
  return createMockRecap({ metrics: createMockRetrospectiveMetrics({
    totalCompletions: completed, completionRate: completed * 100, totalScheduled: 1,
    activeDays: completed, badHabitSlips: 0, topHabits: [],
  }) })
}

export const inPlaceDayFixture = daySummaryCardSchema.parse(PostApiChatResponse.shape.daySummary.parse({
  date: '2026-10-17', due: 25, done: 0, completionRate: 0, overdueCount: 0, currentStreak: 3, surfaceId: 'today', totalRows: 25,
  rows: Array.from({ length: 25 }, (_, index) => ({ id: `habit-${index + 1}`, title: `Habit ${index + 1}`, emoji: null, depth: 0, isBadHabit: false, status: 'today' })),
}))

export const rangeDaySummaryFixture = daySummaryCardSchema.parse(PostApiChatResponse.shape.daySummary.parse({
  ...inPlaceDayFixture, dateTo: '2026-10-23', due: 7, done: 3, completionRate: 43, totalRows: 1,
  rows: [{ ...inPlaceDayFixture.rows![0]!, status: 'done' }],
}))

export const nestedDaySummaryFixture = daySummaryCardSchema.parse(PostApiChatResponse.shape.daySummary.parse({
  ...inPlaceDayFixture, dateTo: inPlaceDayFixture.date, due: 2, done: 1, completionRate: 50, totalRows: 2,
  rows: [inPlaceDayFixture.rows![0]!, { id: 'child-1', title: 'Stretch', emoji: null, depth: 1, isBadHabit: false, status: 'done' }],
}))

export const inPlaceCalendarFixture = calendarCardSchema.parse(PostApiChatResponse.shape.calendar.parse({
  events: [{ id: 'event /one', title: 'Walk with the team', start: '2026-10-17T13:00:00Z', end: null, isAllDay: false, calendarName: 'Work' }],
  sync: null, surfaceId: 'calendar',
}))
