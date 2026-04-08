import { describe, expect, it } from 'vitest'
import { createMockHabit } from './factories'
import {
  createHabitVisibilityHelpers,
  getChildrenFromIndex,
} from '../utils/habit-visibility'
import type { NormalizedHabit } from '../types/habit'

function buildHabitMap(habits: NormalizedHabit[]): Map<string, NormalizedHabit> {
  return new Map(habits.map((habit) => [habit.id, habit]))
}

describe('habit-visibility', () => {
  it('sorts children by position and createdAt fallback', () => {
    const parent = createMockHabit({ id: 'parent' })
    const a = createMockHabit({
      id: 'a',
      parentId: 'parent',
      position: null,
      createdAtUtc: '2025-01-01T00:00:00Z',
    })
    const b = createMockHabit({
      id: 'b',
      parentId: 'parent',
      position: 2,
      createdAtUtc: '2025-01-03T00:00:00Z',
    })
    const c = createMockHabit({
      id: 'c',
      parentId: 'parent',
      position: 1,
      createdAtUtc: '2025-01-02T00:00:00Z',
    })

    const result = getChildrenFromIndex(
      'parent',
      buildHabitMap([parent, a, b, c]),
      new Map([['parent', ['a', 'b', 'c']]]),
    )

    expect(result.map((habit) => habit.id)).toEqual(['c', 'b', 'a'])
  })

  it('includes descendants for search and today visibility checks', () => {
    const today = '2025-03-10'
    const parent = createMockHabit({
      id: 'parent',
      instances: [],
      isCompleted: true,
      searchMatches: null,
    })
    const child = createMockHabit({
      id: 'child',
      parentId: 'parent',
      instances: [{ date: today, status: 'Pending', logId: null, note: null }],
      isCompleted: false,
      searchMatches: [{ field: 'title', value: 'child' }],
    })

    const helpers = createHabitVisibilityHelpers({
      habitsById: buildHabitMap([parent, child]),
      childrenByParent: new Map([['parent', ['child']]]),
      selectedDate: today,
      searchQuery: 'chi',
      showCompleted: false,
      recentlyCompletedIds: new Set(),
    })

    expect(helpers.isRelevantToday(parent)).toBe(true)
    expect(helpers.hasSearchMatch(parent)).toBe(true)
    expect(helpers.getVisibleChildren('parent', 'today').map((habit) => habit.id)).toEqual([
      'child',
    ])
  })

  it('filters completed children unless recently completed or showCompleted is on', () => {
    const completed = createMockHabit({
      id: 'completed',
      parentId: 'parent',
      isCompleted: true,
    })
    const open = createMockHabit({
      id: 'open',
      parentId: 'parent',
      isCompleted: false,
      instances: [{ date: '2025-01-01', status: 'Pending', logId: null, note: null }],
    })

    const habitsById = buildHabitMap([createMockHabit({ id: 'parent' }), completed, open])
    const childrenByParent = new Map([['parent', ['completed', 'open']]])

    const hiddenCompleted = createHabitVisibilityHelpers({
      habitsById,
      childrenByParent,
      selectedDate: '2025-01-01',
      searchQuery: '',
      showCompleted: false,
      recentlyCompletedIds: new Set(),
    })

    expect(
      hiddenCompleted.getVisibleChildren('parent', 'all').map((habit) => habit.id),
    ).toEqual(['open'])

    const withRecentCompleted = createHabitVisibilityHelpers({
      habitsById,
      childrenByParent,
      selectedDate: '2025-01-01',
      searchQuery: '',
      showCompleted: false,
      recentlyCompletedIds: new Set(['completed']),
    })

    expect(
      withRecentCompleted.getVisibleChildren('parent', 'all').map((habit) => habit.id),
    ).toEqual(['completed', 'open'])
  })

  it('treats optimistic habits with scheduledDates as visible on the selected date', () => {
    const today = '2025-03-10'
    const optimisticHabit = createMockHabit({
      id: 'optimistic',
      instances: [],
      scheduledDates: [today],
      dueDate: today,
      isCompleted: false,
      isOverdue: false,
    })

    const helpers = createHabitVisibilityHelpers({
      habitsById: buildHabitMap([optimisticHabit]),
      childrenByParent: new Map(),
      selectedDate: today,
      searchQuery: '',
      showCompleted: false,
      recentlyCompletedIds: new Set(),
    })

    expect(helpers.isDueOnSelectedDate(optimisticHabit)).toBe(true)
    expect(helpers.hasVisibleContent(optimisticHabit)).toBe(true)
  })

  it('falls back to dueDate when optimistic sub-habits have no schedule instances yet', () => {
    const today = '2025-03-10'
    const optimisticChild = createMockHabit({
      id: 'child',
      parentId: 'parent',
      instances: [],
      scheduledDates: [],
      dueDate: today,
      isCompleted: false,
      isOverdue: false,
    })
    const parent = createMockHabit({
      id: 'parent',
      instances: [],
      scheduledDates: [],
      isCompleted: false,
      isOverdue: false,
    })

    const helpers = createHabitVisibilityHelpers({
      habitsById: buildHabitMap([parent, optimisticChild]),
      childrenByParent: new Map([['parent', ['child']]]),
      selectedDate: today,
      searchQuery: '',
      showCompleted: false,
      recentlyCompletedIds: new Set(),
    })

    expect(helpers.isRelevantToday(parent)).toBe(true)
    expect(helpers.getVisibleChildren('parent', 'today').map((habit) => habit.id)).toEqual([
      'child',
    ])
  })
})
