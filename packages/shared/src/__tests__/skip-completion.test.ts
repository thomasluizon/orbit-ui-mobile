import { QueryClient } from '@tanstack/query-core'
import { afterEach, expect, it, vi } from 'vitest'
import { createMockHabitScheduleItem } from './factories'
import { habitKeys, applyCachedHabitSkip } from '../query'
import { checkCompletionAfterSkip, settleBulkSkippedHabits } from '../query/skip-completion'
import type { HabitScheduleItem } from '../types/habit'
import { getAllDoneOnDate } from '../utils/all-done'

afterEach(() => vi.useRealTimers())

it('settles accepted skips, restores rejected schedules and waits for pending siblings', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-16T01:00:00Z'))
  const date = '2026-06-15'
  const client = new QueryClient()
  const key = habitKeys.list({ dateFrom: date, dateTo: date, includeOverdue: true, completeDay: true })
  const items = ['accepted', 'rejected'].map((id) => createMockHabitScheduleItem({ id, scheduledDates: [date], dueDate: date }))
  client.setQueryData(key, items)
  const requests = items.map((item) => ({ habitId: item.id, date }))
  for (const request of requests) applyCachedHabitSkip(client, request.habitId, date)
  const check = vi.fn()
  const confirmed = settleBulkSkippedHabits(client, requests, [[key, items]], new Set(['rejected']), date)
  expect(confirmed).toEqual([{ habitId: 'accepted', date }])
  expect(client.getQueryData<HabitScheduleItem[]>(key)?.find((item) => item.id === 'rejected')?.scheduledDates).toContain(date)
  checkCompletionAfterSkip(client, confirmed, 'America/Sao_Paulo', check, [[key, items]])
  expect(check).toHaveBeenCalledWith(expect.any(Map), expect.any(Map), date, 'America/Sao_Paulo', new Set(['accepted']))
  check.mockClear()
  checkCompletionAfterSkip(client, confirmed, 'UTC', check, [[key, items]])
  expect(check).not.toHaveBeenCalled()
  client.clear()
})

it('does not infer whole-day completion from a filtered list', () => {
  const client = new QueryClient()
  client.setQueryData(habitKeys.list({ search: 'walk' }), [createMockHabitScheduleItem()])
  const check = vi.fn()
  checkCompletionAfterSkip(client, [{ habitId: 'habit' }], 'UTC', check, [])
  expect(check).not.toHaveBeenCalled()
  client.clear()
})

it.each([false, true])('keeps confirmed completion after the authoritative refetch removes the skipped row, nested=%s', (nested) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-16T01:00:00Z'))
  const date = '2026-06-15'
  const client = new QueryClient()
  const key = habitKeys.list({ dateFrom: date, dateTo: date, includeOverdue: true, completeDay: true })
  const skipped = createMockHabitScheduleItem({ id: 'skipped', scheduledDates: [date], dueDate: date })
  const items = nested ? [createMockHabitScheduleItem({ id: 'parent', scheduledDates: [], children: [skipped] })] : [skipped]
  client.setQueryData(key, items)
  applyCachedHabitSkip(client, skipped.id, date)
  client.setQueryData(key, [])
  const check = vi.fn((...args: Parameters<typeof getAllDoneOnDate>) => getAllDoneOnDate(...args))
  checkCompletionAfterSkip(client, [{ habitId: skipped.id, date }], 'America/Sao_Paulo',
    (habits, children, day, _zone, confirmed) => check(habits, children, day, confirmed), [[key, items]])
  expect(check).toHaveReturnedWith({ allDone: true, count: 1 })
  client.setQueryData(key, [createMockHabitScheduleItem({ id: 'still-pending', scheduledDates: [date] })])
  checkCompletionAfterSkip(client, [{ habitId: skipped.id, date }], 'America/Sao_Paulo',
    (habits, children, day, _zone, confirmed) => check(habits, children, day, confirmed), [[key, items]])
  expect(check).toHaveLastReturnedWith({ allDone: false, count: 1 })
  client.clear()
})
