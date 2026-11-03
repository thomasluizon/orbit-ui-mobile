import { QueryClient } from '@tanstack/query-core'
import { afterEach,describe,expect,it,vi } from 'vitest'
import { applyHabitLogSuccess,rollbackHabitLogCalendars,setOptimisticCalendarHabitLog } from '../hooks/habit-logging-core'
import { gamificationKeys,habitKeys,profileKeys } from '../query/keys'
import { logHabitResponseSchema,type CalendarMonthResponse } from '../types/habit'
import { createMockGamificationProfile,createMockHabitScheduleItem,createMockProfile } from './factories'

afterEach(() => vi.useRealTimers())

describe('shared habit log settlement', () => {
  it.each(['good', 'bad', 'unknown'] as const)('reconciles rewards while celebrating only a known good habit: %s', kind => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-16T12:00:00Z'))
    const client = new QueryClient()
    const profile = createMockProfile({ timeZone: 'UTC', currentStreak: 6 })
    const rewards = createMockGamificationProfile({ totalXp: 100 })
    client.setQueryData(profileKeys.detail(), profile)
    client.setQueryData(gamificationKeys.profile(), rewards)
    if (kind !== 'unknown') client.setQueryData(habitKeys.list({}), [createMockHabitScheduleItem({ id: 'habit', isBadHabit: kind === 'bad' })])
    const effects = { setStreakCelebration: vi.fn(), showStreakMoment: vi.fn(), armMilestoneSharePrompt: vi.fn() }
    const response = logHabitResponseSchema.parse({ logId: 'log', isFirstCompletionToday: true, previousStreak: 6, currentStreak: 7, xpEarned: 10 })
    applyHabitLogSuccess(client, response, { habitId: 'habit', date: '2026-09-16', intent: 'log' }, undefined, effects)
    expect(client.getQueryData<typeof rewards>(gamificationKeys.profile())?.totalXp).toBe(110)
    expect(client.getQueryData<typeof profile>(profileKeys.detail())?.currentStreak).toBe(kind === 'good' ? 7 : 6)
    expect(effects.showStreakMoment).toHaveBeenCalledWith(7, 6, expect.objectContaining({ countsTowardStreak: kind === 'good' }))
    expect(effects.setStreakCelebration).toHaveBeenCalledTimes(kind === 'good' ? 1 : 0)
    client.clear()
  })

  it('rolls back its optimistic calendar occurrence while retaining a later log', () => {
    const client = new QueryClient()
    const key = habitKeys.calendar('2026-09-01', '2026-09-30')
    const before: CalendarMonthResponse = { habits: [], logs: {} }
    client.setQueryData(key, before)
    setOptimisticCalendarHabitLog(client, 'habit', '2026-09-16', true, 'optimistic-log:habit:2026-09-16', '2026-09-16T12:00:00Z')
    expect(client.getQueryData<CalendarMonthResponse>(key)?.logs.habit).toHaveLength(1)
    const later = { id: 'later', date: '2026-09-17', value: 1, createdAtUtc: '2026-09-17T12:00:00Z' }
    client.setQueryData<CalendarMonthResponse>(key, current => ({ ...current!, logs: { ...current!.logs, habit: [...current!.logs.habit!, later] } }))
    rollbackHabitLogCalendars(client, [[key, before]], 'habit', '2026-09-16')
    expect(client.getQueryData<CalendarMonthResponse>(key)?.logs.habit).toEqual([later])
    client.clear()
  })
})
