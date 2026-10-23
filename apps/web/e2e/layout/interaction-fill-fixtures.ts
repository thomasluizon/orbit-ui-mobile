import type { BrowserContext } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockCalendarSyncEvent, createMockGamificationProfile, createMockGoal, createMockNotification, createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { buildRetrospectiveRequestUrl } from '@orbit/shared/utils/retrospective'
import { retrospectiveResponseSchema } from '@orbit/shared/types/gamification'
import { buildRecapRequestUrl } from '@orbit/shared/utils'
import { calendarEventsResponseSchema } from '@orbit/shared/types/calendar'
import { habitMetricsSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutFixtureSession } from './profile-session'
import { LAYOUT_FIXED_TIME } from './clock.mjs'

export async function installInteractionFillFixtures(context: BrowserContext, route: string, locale: 'en' | 'pt-BR') {
  const day = LAYOUT_FIXED_TIME.slice(0, 10)
  const hasProAccess = route !== '/upgrade'
  const profile = profileSchema.parse({ ...profileFixture, language: locale, canViewGamification: true, hasProAccess, plan: hasProAccess ? 'pro' : 'free', hasCompletedOnboarding: route !== '/onboarding' })
  const habit = makeHabitDetail()
  const items = Array.from({ length: 3 }, (_, index) => makeHabitScheduleItem({ id: index === 0 ? habit.id : `fill-habit-${index}`, title: index === 0 ? habit.title : `Read another chapter ${index}`, dueDate: day, scheduledDates: [day], children: [], hasSubHabits: false }))
  const goals = [createMockGoal(), createMockGoal({ id: 'goal-2', title: 'Walk every morning', position: 1 })]
  const notifications = [createMockNotification(), createMockNotification({ id: 'notif-2', title: 'Weekly review', isRead: true })]
  await setLayoutFixtureSession(context, [
    { path: API.profile.get, body: profile },
    { path: API.habits.list, body: { items, page: 1, pageSize: 200, totalCount: items.length, totalPages: 1 } },
    { path: API.goals.list, body: { items: goals, page: 1, pageSize: 100, totalCount: goals.length, totalPages: 1 } },
    { path: API.notifications.list, body: { items: notifications, unreadCount: 1 } },
    { path: API.gamification.profile, body: createMockGamificationProfile() },
  ])
  const events = calendarEventsResponseSchema.parse([createMockCalendarSyncEvent({ startDate: day, startTime: '09:00:00' }), createMockCalendarSyncEvent({ id: 'event-2', title: 'Read a chapter', startDate: day, startTime: '10:00:00' })])
  const metrics = habitMetricsSchema.parse({ currentStreak: 1, longestStreak: 1, weeklyCompletionRate: 100, monthlyCompletionRate: 100, totalCompletions: 1, lastCompletedDate: day })
  const retrospective = retrospectiveResponseSchema.parse({
    period: 'month', fromCache: false,
    narrative: { highlights: '', missed: '', trends: '', suggestion: '' },
    metrics: createMockRetrospectiveMetrics({ completionSeries: { granularity: 'day', points: Array.from({ length: 30 }, (_, index) => ({
      startDate: `2026-09-${String(index + 1).padStart(2, '0')}`, endDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
      scheduled: 4, completed: [0, 2, 4][index % 3]!, completionRate: [0, 50, 100][index % 3]!,
    })) } }),
  })
  const responses: readonly (readonly [string, unknown])[] = [
    [API.habits.get(habit.id), habit], [API.habits.logs(habit.id), []], [API.habits.metrics(habit.id), metrics],
    [API.habits.calendarMonth, { habits: items, logs: {} }], [API.calendar.events, events],
    [buildRetrospectiveRequestUrl('month', locale), retrospective],
    [API.habits.count, { count: items.length }], [buildRecapRequestUrl('week'), createMockRecap()],
  ]
  for (const [path, body] of responses) await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === path.split('?')[0], (request) => request.fulfill({ json: body }))
}
