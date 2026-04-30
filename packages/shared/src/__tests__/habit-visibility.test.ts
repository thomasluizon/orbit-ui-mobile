import { describe, expect, it } from 'vitest'
import { createMockHabit } from './factories'
import {
  createHabitVisibilityHelpers,
  getChildrenFromIndex,
  isHabitVisibleInAllView,
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
      instances: [{ date: today, status: 'Pending', logId: null }],
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

  it('surfaces overdue one-time habits on the today view', () => {
    const today = '2026-04-09'
    const overdue = createMockHabit({
      id: 'overdue',
      isOverdue: true,
      isCompleted: false,
      frequencyUnit: null,
      instances: [],
      scheduledDates: [],
    })
    const helpers = createHabitVisibilityHelpers({
      habitsById: buildHabitMap([overdue]),
      childrenByParent: new Map(),
      selectedDate: today,
      searchQuery: '',
      showCompleted: false,
      recentlyCompletedIds: new Set(),
    })

    expect(helpers.hasVisibleContent(overdue)).toBe(true)
  })

  it('surfaces parents whose children are overdue on the today view', () => {
    const today = '2026-04-09'
    const parent = createMockHabit({
      id: 'parent',
      isOverdue: false,
      isCompleted: false,
      instances: [],
      scheduledDates: [],
    })
    const child = createMockHabit({
      id: 'child',
      parentId: 'parent',
      isOverdue: true,
      isCompleted: false,
      frequencyUnit: null,
      instances: [],
      scheduledDates: [],
    })

    const helpers = createHabitVisibilityHelpers({
      habitsById: buildHabitMap([parent, child]),
      childrenByParent: new Map([['parent', ['child']]]),
      selectedDate: today,
      searchQuery: '',
      showCompleted: false,
      recentlyCompletedIds: new Set(),
    })

    expect(helpers.hasVisibleContent(parent)).toBe(true)
  })

  it('does not surface recurring habits that are merely missed (not overdue)', () => {
    const today = '2026-04-09'
    const missed = createMockHabit({
      id: 'missed',
      isOverdue: false,
      isCompleted: false,
      frequencyUnit: 'Day',
      instances: [],
      scheduledDates: [],
    })
    const helpers = createHabitVisibilityHelpers({
      habitsById: buildHabitMap([missed]),
      childrenByParent: new Map(),
      selectedDate: today,
      searchQuery: '',
      showCompleted: false,
      recentlyCompletedIds: new Set(),
    })

    expect(helpers.hasVisibleContent(missed)).toBe(false)
  })

  it('hides logged recurring habits in today view until showCompleted is on', () => {
    const today = '2026-04-09'
    const logged = createMockHabit({
      id: 'logged',
      isCompleted: false,
      isLoggedInRange: true,
      frequencyUnit: 'Day',
      instances: [{ date: today, status: 'Completed', logId: 'log-1' }],
      scheduledDates: [],
    })

    const hidden = createHabitVisibilityHelpers({
      habitsById: buildHabitMap([logged]),
      childrenByParent: new Map(),
      selectedDate: today,
      searchQuery: '',
      showCompleted: false,
      recentlyCompletedIds: new Set(),
    })
    const visible = createHabitVisibilityHelpers({
      habitsById: buildHabitMap([logged]),
      childrenByParent: new Map(),
      selectedDate: today,
      searchQuery: '',
      showCompleted: true,
      recentlyCompletedIds: new Set(),
    })

    expect(hidden.hasVisibleContent(logged)).toBe(false)
    expect(visible.hasVisibleContent(logged)).toBe(true)
    expect(isHabitVisibleInAllView(logged, false)).toBe(true)
  })

  it('filters only completed one-time children in all view when showCompleted is off', () => {
    const completedOneTime = createMockHabit({
      id: 'completed-one-time',
      parentId: 'parent',
      isCompleted: true,
      frequencyUnit: null,
    })
    const completedRecurring = createMockHabit({
      id: 'completed-recurring',
      parentId: 'parent',
      isCompleted: true,
      frequencyUnit: 'Day',
    })
    const general = createMockHabit({
      id: 'general',
      parentId: 'parent',
      isGeneral: true,
      isCompleted: false,
      frequencyUnit: null,
    })
    const open = createMockHabit({
      id: 'open',
      parentId: 'parent',
      isCompleted: false,
      instances: [{ date: '2025-01-01', status: 'Pending', logId: null }],
    })

    const habitsById = buildHabitMap([
      createMockHabit({ id: 'parent' }),
      completedOneTime,
      completedRecurring,
      general,
      open,
    ])
    const childrenByParent = new Map([[
      'parent',
      ['completed-one-time', 'completed-recurring', 'general', 'open'],
    ]])

    const withoutCompletedOneTime = createHabitVisibilityHelpers({
      habitsById,
      childrenByParent,
      selectedDate: '2025-01-01',
      searchQuery: '',
      showCompleted: false,
      recentlyCompletedIds: new Set(),
    })

    expect(
      withoutCompletedOneTime.getVisibleChildren('parent', 'all').map((habit) => habit.id),
    ).toEqual(['completed-recurring', 'open'])

    const withCompletedOneTime = createHabitVisibilityHelpers({
      habitsById,
      childrenByParent,
      selectedDate: '2025-01-01',
      searchQuery: '',
      showCompleted: true,
      recentlyCompletedIds: new Set(),
    })

    expect(
      withCompletedOneTime.getVisibleChildren('parent', 'all').map((habit) => habit.id),
    ).toEqual(['completed-one-time', 'completed-recurring', 'open'])
  })

  it('applies all-view top-level visibility rules', () => {
    expect(isHabitVisibleInAllView(createMockHabit({ isGeneral: true }), true)).toBe(false)
    expect(isHabitVisibleInAllView(createMockHabit({ isCompleted: true, frequencyUnit: null }), false)).toBe(false)
    expect(isHabitVisibleInAllView(createMockHabit({ isCompleted: true, frequencyUnit: 'Day' }), false)).toBe(true)
    expect(isHabitVisibleInAllView(createMockHabit({ isCompleted: true, frequencyUnit: null }), true)).toBe(true)
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
