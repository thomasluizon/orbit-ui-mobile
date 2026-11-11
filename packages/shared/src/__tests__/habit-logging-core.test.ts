import { QueryClient,QueryObserver } from '@tanstack/query-core'
import { afterEach,describe,expect,it,vi } from 'vitest'
import { applyHabitLogSuccess,rollbackHabitLogCalendars,rollbackOptimisticHabitLogsCache,setOptimisticCalendarHabitLog,setOptimisticHabitLogs } from '../hooks/habit-logging-core'
import { gamificationKeys,habitKeys,profileKeys } from '../query/keys'
import { logHabitResponseSchema,type CalendarMonthResponse } from '../types/habit'
import type { HabitLog } from '../types/calendar'
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

describe('shared optimistic habit logs', () => {
  const date = '2026-09-16'
  const optimisticLogId = `optimistic-log:habit:${date}`
  const serverLog: HabitLog = { id: 'server-log', date, value: 1, createdAtUtc: '2026-09-16T09:00:00Z' }
  const otherDayLog: HabitLog = { id: 'other-log', date: '2026-09-15', value: 1, createdAtUtc: '2026-09-15T09:00:00Z' }

  it.each([
    { intent: 'log', initial: [otherDayLog], during: [otherDayLog, { id: optimisticLogId, date, value: 1, createdAtUtc: 'now' }] },
    { intent: 'unlog', initial: [otherDayLog, serverLog], during: [otherDayLog] },
  ] as const)('writes the $intent at once and restores the snapshot on failure', ({ intent, initial, during }) => {
    const client = new QueryClient()
    client.setQueryData(habitKeys.logs('habit'), initial)
    const previousLogs = setOptimisticHabitLogs(client, 'habit', date, intent === 'log', optimisticLogId, 'now')
    expect(previousLogs).toEqual(initial)
    expect(client.getQueryData(habitKeys.logs('habit'))).toEqual(during)
    rollbackOptimisticHabitLogsCache(client, previousLogs, 'habit', date)
    expect(client.getQueryData(habitKeys.logs('habit'))).toEqual(initial)
    client.clear()
  })

  it('keeps the logs unchanged when the date already has the requested state', () => {
    const client = new QueryClient()
    const initial = [serverLog]
    client.setQueryData(habitKeys.logs('habit'), initial)
    setOptimisticHabitLogs(client, 'habit', date, true, optimisticLogId, 'now')
    expect(client.getQueryData(habitKeys.logs('habit'))).toBe(initial)
    client.clear()
  })

  it('keeps a later server log when an earlier optimistic unlog fails', () => {
    const client = new QueryClient()
    const laterLog: HabitLog = { ...serverLog, id: 'later-log' }
    client.setQueryData(habitKeys.logs('habit'), [serverLog])
    const previousLogs = setOptimisticHabitLogs(client, 'habit', date, false, optimisticLogId, 'now')
    client.setQueryData(habitKeys.logs('habit'), [laterLog])
    rollbackOptimisticHabitLogsCache(client, previousLogs, 'habit', date)
    expect(client.getQueryData(habitKeys.logs('habit'))).toEqual([laterLog])
    client.clear()
  })

  it.each([true, false])('writes no logs cache for a habit that has no cached logs and no observer (completed: %s)', completed => {
    const client = new QueryClient()
    const previousLogs = setOptimisticHabitLogs(client, 'habit', date, completed, optimisticLogId, 'now')
    expect(previousLogs).toBeUndefined()
    expect(client.getQueryData(habitKeys.logs('habit'))).toBeUndefined()
    rollbackOptimisticHabitLogsCache(client, previousLogs, 'habit', date)
    expect(client.getQueryCache().find({ queryKey: habitKeys.logs('habit') })).toBeUndefined()
    client.clear()
  })

  function observeLoadingLogs(client: QueryClient) {
    const readLogs = vi.fn(() => new Promise<HabitLog[]>(() => {}))
    const unsubscribe = new QueryObserver(client, { queryKey: habitKeys.logs('habit'), queryFn: readLogs, retry: false }).subscribe(() => {})
    return { readLogs, unsubscribe }
  }

  it('writes the log for a mounted screen whose logs still load, and returns that screen to loading when the log fails', async () => {
    const client = new QueryClient()
    const { readLogs, unsubscribe } = observeLoadingLogs(client)
    const previousLogs = setOptimisticHabitLogs(client, 'habit', date, true, optimisticLogId, 'now')
    await Promise.resolve()
    expect(previousLogs).toBeUndefined()
    expect(client.getQueryData(habitKeys.logs('habit'))).toEqual([{ id: optimisticLogId, date, value: 1, createdAtUtc: 'now' }])
    rollbackOptimisticHabitLogsCache(client, previousLogs, 'habit', date)
    expect(client.getQueryData(habitKeys.logs('habit'))).toBeUndefined()
    expect(client.getQueryState(habitKeys.logs('habit'))).toMatchObject({ status: 'pending', fetchStatus: 'fetching' })
    expect(readLogs).toHaveBeenCalledTimes(2)
    unsubscribe()
    client.clear()
  })

  it('keeps loading the logs of a mounted screen for an unlog, because no cached log exists to remove', () => {
    const client = new QueryClient()
    const { readLogs, unsubscribe } = observeLoadingLogs(client)
    const previousLogs = setOptimisticHabitLogs(client, 'habit', date, false, optimisticLogId, 'now')
    expect(previousLogs).toBeUndefined()
    rollbackOptimisticHabitLogsCache(client, previousLogs, 'habit', date)
    expect(client.getQueryData(habitKeys.logs('habit'))).toBeUndefined()
    expect(client.getQueryState(habitKeys.logs('habit'))).toMatchObject({ status: 'pending', fetchStatus: 'fetching' })
    expect(readLogs).toHaveBeenCalledOnce()
    unsubscribe()
    client.clear()
  })
})
