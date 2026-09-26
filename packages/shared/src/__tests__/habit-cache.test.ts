import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/query-core'
import { createMockHabit } from './factories'
import { habitKeys } from '../query/keys'
import { updateHabitListsForDate } from '../query/habit-cache'
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
})
