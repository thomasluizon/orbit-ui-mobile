import { QueryClient } from '@tanstack/query-core'
import { afterEach, expect, it, vi } from 'vitest'
import { createMockHabitScheduleItem } from './factories'
import { habitKeys, applyCachedHabitSkip } from '../query'
import { checkCompletionAfterSkip, settleBulkSkippedHabits } from '../query/skip-completion'
import type { HabitScheduleItem } from '../types/habit'

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
  checkCompletionAfterSkip(client, confirmed, 'America/Sao_Paulo', check)
  expect(check).toHaveBeenCalledWith(expect.any(Map), expect.any(Map), date, 'America/Sao_Paulo', new Set(['accepted']))
  check.mockClear()
  checkCompletionAfterSkip(client, confirmed, 'UTC', check)
  expect(check).not.toHaveBeenCalled()
  client.clear()
})

it('does not infer whole-day completion from a filtered list', () => {
  const client = new QueryClient()
  client.setQueryData(habitKeys.list({ search: 'walk' }), [createMockHabitScheduleItem()])
  const check = vi.fn()
  checkCompletionAfterSkip(client, [{ habitId: 'habit' }], 'UTC', check)
  expect(check).not.toHaveBeenCalled()
  client.clear()
})
