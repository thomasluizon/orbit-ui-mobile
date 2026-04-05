import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useHabitVisibility } from '@/hooks/use-habit-visibility'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

function makeHabit(overrides: Partial<NormalizedHabit> = {}): NormalizedHabit {
  return {
    id: 'h1',
    title: 'Test',
    description: '',
    frequencyUnit: null,
    frequencyQuantity: null,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2025-01-15',
    dueTime: '',
    dueEndTime: '',
    endDate: '',
    position: 0,
    checklistItems: [],
    createdAtUtc: '2025-01-01T00:00:00Z',
    parentId: null,
    scheduledDates: [],
    isOverdue: false,
    reminderEnabled: false,
    reminderTimes: [],
    scheduledReminders: [],
    slipAlertEnabled: false,
    tags: [],
    hasSubHabits: false,
    flexibleTarget: null,
    flexibleCompleted: 0,
    isLoggedInRange: false,
    linkedGoals: [],
    instances: [{ date: '2025-01-15', status: 'Pending' as const, logId: null, note: null }],
    searchMatches: null,
    ...overrides,
  } as NormalizedHabit
}

describe('useHabitVisibility', () => {
  const selectedDate = '2025-01-15'

  it('isDueOnSelectedDate returns true when habit has instance on selected date', () => {
    const habit = makeHabit({ instances: [{ date: '2025-01-15', status: 'Pending' as const, logId: null, note: null }] })
    const habitsById = new Map([['h1', habit]])

    const { result } = renderHook(() =>
      useHabitVisibility({
        habitsById,
        childrenByParent: new Map(),
        selectedDate,
        searchQuery: '',
        showCompleted: true,
        recentlyCompletedIds: new Set(),
      }),
    )

    expect(result.current.isDueOnSelectedDate(habit)).toBe(true)
  })

  it('isDueOnSelectedDate returns false when habit has no instance on selected date', () => {
    const habit = makeHabit({ instances: [{ date: '2025-01-16', status: 'Pending' as const, logId: null, note: null }] })
    const habitsById = new Map([['h1', habit]])

    const { result } = renderHook(() =>
      useHabitVisibility({
        habitsById,
        childrenByParent: new Map(),
        selectedDate,
        searchQuery: '',
        showCompleted: true,
        recentlyCompletedIds: new Set(),
      }),
    )

    expect(result.current.isDueOnSelectedDate(habit)).toBe(false)
  })

  it('hasSearchMatch returns true when habit has search matches', () => {
    const habit = makeHabit({ searchMatches: [{ field: 'title' as const, value: null }] })
    const habitsById = new Map([['h1', habit]])

    const { result } = renderHook(() =>
      useHabitVisibility({
        habitsById,
        childrenByParent: new Map(),
        selectedDate,
        searchQuery: 'test',
        showCompleted: true,
        recentlyCompletedIds: new Set(),
      }),
    )

    expect(result.current.hasSearchMatch(habit)).toBe(true)
  })

  it('hasSearchMatch returns false when habit has no matches', () => {
    const habit = makeHabit({ searchMatches: null })
    const habitsById = new Map([['h1', habit]])

    const { result } = renderHook(() =>
      useHabitVisibility({
        habitsById,
        childrenByParent: new Map(),
        selectedDate,
        searchQuery: 'test',
        showCompleted: true,
        recentlyCompletedIds: new Set(),
      }),
    )

    expect(result.current.hasSearchMatch(habit)).toBe(false)
  })

  it('getVisibleChildren returns all children when showCompleted is true', () => {
    const parent = makeHabit({ id: 'parent' })
    const child1 = makeHabit({ id: 'c1', parentId: 'parent', isCompleted: false, position: 0 })
    const child2 = makeHabit({ id: 'c2', parentId: 'parent', isCompleted: true, position: 1 })

    const habitsById = new Map([
      ['parent', parent],
      ['c1', child1],
      ['c2', child2],
    ])
    const childrenByParent = new Map([['parent', ['c1', 'c2']]])

    const { result } = renderHook(() =>
      useHabitVisibility({
        habitsById,
        childrenByParent,
        selectedDate,
        searchQuery: '',
        showCompleted: true,
        recentlyCompletedIds: new Set(),
      }),
    )

    const children = result.current.getVisibleChildren('parent', 'all')
    expect(children).toHaveLength(2)
  })

  it('getVisibleChildren filters completed in "all" view when showCompleted is false', () => {
    const parent = makeHabit({ id: 'parent' })
    const child1 = makeHabit({ id: 'c1', parentId: 'parent', isCompleted: false, position: 0 })
    const child2 = makeHabit({ id: 'c2', parentId: 'parent', isCompleted: true, position: 1 })

    const habitsById = new Map([
      ['parent', parent],
      ['c1', child1],
      ['c2', child2],
    ])
    const childrenByParent = new Map([['parent', ['c1', 'c2']]])

    const { result } = renderHook(() =>
      useHabitVisibility({
        habitsById,
        childrenByParent,
        selectedDate,
        searchQuery: '',
        showCompleted: false,
        recentlyCompletedIds: new Set(),
      }),
    )

    const children = result.current.getVisibleChildren('parent', 'all')
    expect(children).toHaveLength(1)
    expect(children[0]!.id).toBe('c1')
  })

  it('keeps recently completed habits visible when showCompleted is false', () => {
    const parent = makeHabit({ id: 'parent' })
    const child = makeHabit({ id: 'c1', parentId: 'parent', isCompleted: true, position: 0 })

    const habitsById = new Map([
      ['parent', parent],
      ['c1', child],
    ])
    const childrenByParent = new Map([['parent', ['c1']]])

    const { result } = renderHook(() =>
      useHabitVisibility({
        habitsById,
        childrenByParent,
        selectedDate,
        searchQuery: '',
        showCompleted: false,
        recentlyCompletedIds: new Set(['c1']),
      }),
    )

    const children = result.current.getVisibleChildren('parent', 'all')
    expect(children).toHaveLength(1)
  })

  it('hasVisibleContent returns true for overdue habits', () => {
    const habit = makeHabit({ isOverdue: true, isCompleted: false, instances: [] })
    const habitsById = new Map([['h1', habit]])

    const { result } = renderHook(() =>
      useHabitVisibility({
        habitsById,
        childrenByParent: new Map(),
        selectedDate,
        searchQuery: '',
        showCompleted: false,
        recentlyCompletedIds: new Set(),
      }),
    )

    expect(result.current.hasVisibleContent(habit)).toBe(true)
  })
})
