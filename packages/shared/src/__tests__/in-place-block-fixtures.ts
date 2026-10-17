import { vi } from 'vitest'
import type { z } from 'zod'
const { PostApiChatResponse } = await vi.importActual<{ PostApiChatResponse: z.ZodObject<{ daySummary: z.ZodType; calendar: z.ZodType }> }>('../types/__generated__/api.generated')
import { calendarCardSchema, daySummaryCardSchema } from '../types/chat'

export const inPlaceDayFixture = daySummaryCardSchema.parse(PostApiChatResponse.shape.daySummary.parse({
  date: '2026-10-17', due: 25, done: 0, completionRate: 0, overdueCount: 0, currentStreak: 3, surfaceId: 'today', totalRows: 25,
  rows: Array.from({ length: 25 }, (_, index) => ({ id: `habit-${index + 1}`, title: `Habit ${index + 1}`, emoji: null, depth: 0, isBadHabit: false, status: 'today' })),
}))

export const inPlaceCalendarFixture = calendarCardSchema.parse(PostApiChatResponse.shape.calendar.parse({
  events: [{ id: 'event /one', title: 'Walk with the team', start: '2026-10-17T13:00:00Z', end: null, isAllDay: false, calendarName: 'Work' }],
  sync: null, surfaceId: 'calendar',
}))
