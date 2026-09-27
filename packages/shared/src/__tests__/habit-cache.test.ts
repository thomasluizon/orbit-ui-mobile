import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/query-core'
import { createMockHabit } from './factories'
import { habitKeys } from '../query/keys'
import { invalidateHabitDependents, updateHabitListsForDate } from '../query/habit-cache'
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

  it('keeps undated lists unchanged for an explicit-date completion', () => {
    const queryClient = new QueryClient()
    const datedKey = habitKeys.list({ dateFrom: '2025-01-02', dateTo: '2025-01-02' })
    const allKey = habitKeys.list({})
    const habit: HabitScheduleItem = { ...createMockHabit(), children: [], linkedGoals: [] }
    queryClient.setQueryData(datedKey, [habit])
    queryClient.setQueryData(allKey, [habit])

    updateHabitListsForDate(queryClient, '2025-01-02',
      (items) => items.map((item) => ({ ...item, isCompleted: true })),
      { includeUnfiltered: false })

    expect(queryClient.getQueryData<HabitScheduleItem[]>(datedKey)?.[0]?.isCompleted).toBe(true)
    expect(queryClient.getQueryData<HabitScheduleItem[]>(allKey)?.[0]?.isCompleted).toBe(false)
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
