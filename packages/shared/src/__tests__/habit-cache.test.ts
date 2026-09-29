import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/query-core'
import { createMockHabit } from './factories'
import { habitKeys } from '../query/keys'
import {
  deduplicateHabitList,
  getTodayHabitList,
  invalidateHabitDependents,
  updateHabitListsForDate,
} from '../query/habit-cache'
import { optimisticRemoveHabits } from '../utils/habit-optimistic'
import type { HabitScheduleItem } from '../types/habit'

describe('habit list cache targeting', () => {
  it('changes only lists containing the affected date', () => {
    const queryClient = new QueryClient()
    const todayKey = habitKeys.list({ dateFrom: '2025-01-02', dateTo: '2025-01-02' })
    const yesterdayKey = habitKeys.list({ dateFrom: '2025-01-01', dateTo: '2025-01-01' })
    const allKey = habitKeys.list({})
    const habit: HabitScheduleItem = { ...createMockHabit(), children: [], linkedGoals: [] }
    for (const key of [todayKey, yesterdayKey, allKey]) queryClient.setQueryData(key, [habit])

    updateHabitListsForDate(queryClient, '2025-01-02', (items) =>
      items.map((item) => ({ ...item, isCompleted: true })))

    expect(queryClient.getQueryData<HabitScheduleItem[]>(todayKey)?.[0]?.isCompleted).toBe(true)
    expect(queryClient.getQueryData<HabitScheduleItem[]>(allKey)?.[0]?.isCompleted).toBe(true)
    expect(queryClient.getQueryData<HabitScheduleItem[]>(yesterdayKey)?.[0]?.isCompleted).toBe(false)
  })

  it('leaves a list with no data untouched', () => {
    const queryClient = new QueryClient()
    const emptyKey = habitKeys.list({ dateFrom: '2025-01-02', dateTo: '2025-01-02' })
    queryClient.setQueryData(emptyKey, undefined)
    const updater = vi.fn((items: HabitScheduleItem[]) => items)

    updateHabitListsForDate(queryClient, '2025-01-02', updater)

    expect(updater).not.toHaveBeenCalled()
  })
})

describe('habit mutation settlement', () => {
  it('refetches every list and the habit dependents, but not the habit count', () => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    invalidateHabitDependents(queryClient, 'habit-1')

    for (const queryKey of [
      habitKeys.lists(),
      habitKeys.detail('habit-1'),
      habitKeys.fullDetail('habit-1'),
      habitKeys.logs('habit-1'),
      habitKeys.metrics('habit-1'),
      habitKeys.calendarPrefix(),
      habitKeys.summaryPrefix(),
    ]) expect(invalidate).toHaveBeenCalledWith({ queryKey })
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: habitKeys.count() })
  })
})

describe('optimisticRemoveHabits', () => {
  it('removes selected top-level habits and nested children, keeping the rest', () => {
    const grandchild = { ...createMockHabit({ id: 'grandchild' }), children: [] }
    const child = { ...createMockHabit({ id: 'child' }), children: [grandchild] }
    const keptChild = { ...createMockHabit({ id: 'kept-child' }), children: [] }
    const parent: HabitScheduleItem = { ...createMockHabit({ id: 'parent' }), children: [child, keptChild], linkedGoals: [] } as HabitScheduleItem
    const removed: HabitScheduleItem = { ...createMockHabit({ id: 'removed' }), children: [], linkedGoals: [] }

    const result = optimisticRemoveHabits([parent, removed], ['removed', 'grandchild', 'kept-child'])

    expect(result.map((item) => item.id)).toEqual(['parent'])
    expect(result[0]?.children.map((item) => item.id)).toEqual(['child'])
    expect(result[0]?.children[0]?.children).toEqual([])
  })
})

describe('getTodayHabitList', () => {
  const today = '2025-01-02'
  const todayFilters = { dateFrom: today, dateTo: today, includeOverdue: true, pageSize: 2 }
  const scheduled = (id: string): HabitScheduleItem => ({ ...createMockHabit({ id }), children: [], linkedGoals: [] })

  it('returns the Today list once every scheduled habit is loaded', () => {
    const queryClient = new QueryClient()
    const items = [scheduled('a'), { ...scheduled('general'), isGeneral: true }, scheduled('b')]
    queryClient.setQueryData(habitKeys.list(todayFilters), items)
    queryClient.setQueryData(habitKeys.listTotalCount(todayFilters), 2)

    expect(getTodayHabitList(queryClient, today)).toBe(items)
  })

  it('refuses a Today list that holds only the first page', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(habitKeys.list(todayFilters), [scheduled('a'), scheduled('b')])
    queryClient.setQueryData(habitKeys.listTotalCount(todayFilters), 5)

    expect(getTodayHabitList(queryClient, today)).toBeUndefined()
  })

  it('treats a list without a total count as complete only below the page size', () => {
    const shortClient = new QueryClient()
    shortClient.setQueryData(habitKeys.list(todayFilters), [scheduled('a')])
    const fullPageClient = new QueryClient()
    fullPageClient.setQueryData(habitKeys.list(todayFilters), [scheduled('a'), scheduled('b')])

    expect(getTodayHabitList(shortClient, today)?.map((item) => item.id)).toEqual(['a'])
    expect(getTodayHabitList(fullPageClient, today)).toBeUndefined()
  })

  it('ignores filtered, other-day and overdue-free lists', () => {
    const queryClient = new QueryClient()
    for (const filters of [
      { ...todayFilters, search: 'run' },
      { ...todayFilters, tagIds: ['tag-1'] },
      { ...todayFilters, dateFrom: '2025-01-01', dateTo: '2025-01-01' },
      { ...todayFilters, includeOverdue: false },
      { ...todayFilters, isCompleted: false },
    ]) queryClient.setQueryData(habitKeys.list(filters), [scheduled('a')])

    expect(getTodayHabitList(queryClient, today)).toBeUndefined()
  })

  it('keeps a dated list complete through removal, insertion and rollback', () => {
    const queryClient = new QueryClient()
    const key = habitKeys.list(todayFilters)
    const countKey = habitKeys.listTotalCount(todayFilters)
    const original = [scheduled('a'), scheduled('b')]
    queryClient.setQueryData(key, original)
    queryClient.setQueryData(countKey, 2)

    updateHabitListsForDate(queryClient, today, (items) => optimisticRemoveHabits(items, ['a']))
    expect(queryClient.getQueryData(countKey)).toBe(1)
    expect(getTodayHabitList(queryClient, today)?.map((item) => item.id)).toEqual(['b'])

    updateHabitListsForDate(queryClient, today, () => original)
    expect(queryClient.getQueryData(countKey)).toBe(2)

    updateHabitListsForDate(queryClient, today, (items) => [...items, scheduled('c')])
    expect(queryClient.getQueryData(countKey)).toBe(3)
    expect(getTodayHabitList(queryClient, today)?.map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('deduplicateHabitList', () => {
  it('keeps one row per habit, at its first position, with the latest page data', () => {
    const first = { ...createMockHabit({ id: 'a', title: 'Old' }), children: [], linkedGoals: [] }
    const other = { ...createMockHabit({ id: 'b' }), children: [], linkedGoals: [] }
    const latest = { ...first, title: 'New' }

    const result = deduplicateHabitList([first, other, latest])

    expect(result.map((item) => [item.id, item.title])).toEqual([['a', 'New'], ['b', 'Exercise']])
  })
})
