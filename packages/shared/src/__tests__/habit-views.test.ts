import { describe, expect, it } from 'vitest'
import { createHabitViewFixture, createHabitViewItems, createHabitViewScheduleItems, HABIT_VIEW_ROW_ORDER } from './habit-view-fixtures'
import { createHabitVisibilityHelpers, filterHabitViewRoots } from '../utils/habit-visibility'
import { buildHabitDateBuckets, computeHabitDayProgress, computeParentPromptProgress } from '../utils/habit-list-progress'
import { getPersistedUIState, migratePersistedUIState, type UIStoreState } from '../stores/ui-store'

import { canLogHabitOnDate } from '../utils/habit-card-helpers'
import { createMockHabitScheduleChild, createMockHabitScheduleItem } from './factories'
import { normalizeHabitQueryData } from '../utils/habit-normalization'
import type { HabitVisibilityView } from '../utils/habit-visibility'
import type { HabitScheduleItem } from '../types/habit'
import { mergeHabitListSchedule } from '../utils/habit-list-schedule'

const TODAY = '2026-09-12'

function visibleView(items: HabitScheduleItem[], view: HabitVisibilityView, showCompleted = false, recentlyCompletedIds = new Set<string>()) {
  const fixture = normalizeHabitQueryData(items)
  const visibility = createHabitVisibilityHelpers({ ...fixture, selectedDate: TODAY, searchQuery: '', showCompleted, recentlyCompletedIds })
  const roots = filterHabitViewRoots(fixture.topLevelHabits, view, showCompleted, recentlyCompletedIds, visibility)
  const ordered = view === 'all' ? buildHabitDateBuckets(roots, TODAY).flatMap((bucket) => bucket.habits) : roots
  const rows = ordered.flatMap((habit) => [habit, ...visibility.getVisibleChildren(habit.id, view)])
  return { ids: rows.map((habit) => habit.id), progress: computeHabitDayProgress(rows, visibility.isDueOnSelectedDate, view) }
}

describe('production habit views', () => {
  it.each([
    { view: 'today', done: 0, total: 3 },
    { view: 'all', done: 1, total: 6 },
    { view: 'general', done: 0, total: 2 },
  ] as const)('lists the expected roots and children with matching counts in $view', ({ view, done, total }) => {
    const items = createHabitViewItems(TODAY, view)
    const enriched = view === 'all' ? mergeHabitListSchedule(items, createHabitViewScheduleItems(TODAY)) : items
    expect(visibleView(enriched, view)).toEqual({ ids: HABIT_VIEW_ROW_ORDER[view], progress: { done, total } })
  })

  it.each(['today', 'all', 'general'] as const)('shows an empty list and zero progress with no habits in %s', (view) => {
    expect(visibleView([], view)).toEqual({ ids: [], progress: { done: 0, total: 0 } })
  })

  it.each(['all', 'general'] as const)('hides a finished one-time parent and its subtree until completed habits are shown in %s', (view) => {
    const items = [createMockHabitScheduleItem({
      id: 'finished', isGeneral: view === 'general', frequencyUnit: null, isCompleted: true,
      dueDate: '', scheduledDates: [], hasSubHabits: true,
      children: [createMockHabitScheduleChild({ id: 'open-child', isGeneral: view === 'general', dueDate: '', scheduledDates: [] })],
    })]
    expect(visibleView(items, view)).toEqual({ ids: [], progress: { done: 0, total: 0 } })
    expect(visibleView(items, view, true)).toEqual({ ids: ['finished', 'open-child'], progress: { done: 1, total: 2 } })
  })

  it.each(['all', 'general'] as const)('shows all-done counts only after revealing completed one-time habits in %s', (view) => {
    const items = ['first', 'second'].map((id, position) => createMockHabitScheduleItem({
      id, position, isGeneral: view === 'general', frequencyUnit: null, isCompleted: true, dueDate: '', scheduledDates: [],
    }))
    expect(visibleView(items, view)).toEqual({ ids: [], progress: { done: 0, total: 0 } })
    expect(visibleView(items, view, true)).toEqual({ ids: ['first', 'second'], progress: { done: 2, total: 2 } })
  })

  it('keeps a just-completed Geral habit visible until its completion feedback ends', () => {
    const items = [createMockHabitScheduleItem({ id: 'done', isGeneral: true, isCompleted: true, dueDate: '', scheduledDates: [] })]
    expect(visibleView(items, 'general', false, new Set(['done']))).toEqual({ ids: ['done'], progress: { done: 1, total: 1 } })
    expect(visibleView(items, 'general')).toEqual({ ids: [], progress: { done: 0, total: 0 } })
  })

  it.each(['today', 'all', 'general'] as const)('keeps the saved %s view through persistence and migration', (activeView) => {
    const persisted = getPersistedUIState({ activeView, activeFilters: {}, calendarShowRecurring: true } as UIStoreState)
    expect(migratePersistedUIState(JSON.parse(JSON.stringify(persisted))).activeView).toBe(activeView)
  })

  it.each(['all', 'general'] as const)('reveals completed one-time habits only on request in %s', (view) => {
    const fixture = createHabitViewFixture(TODAY, view)
    const visibility = createHabitVisibilityHelpers({ ...fixture, selectedDate: TODAY, searchQuery: '', showCompleted: true, recentlyCompletedIds: new Set() })
    const roots = filterHabitViewRoots(fixture.topLevelHabits, view, true, new Set(), visibility)
    expect(roots.map((habit) => habit.id)).toContain(view === 'all' ? 'once-done' : 'general-done')
    if (view === 'all') expect(roots.some((habit) => habit.isGeneral)).toBe(false)
  })

  it('keeps production date ordering while preserving the child position order', () => {
    const fixture = createHabitViewFixture(TODAY, 'all')
    const visibility = createHabitVisibilityHelpers({ ...fixture, selectedDate: TODAY, searchQuery: '', showCompleted: false, recentlyCompletedIds: new Set() })
    const roots = filterHabitViewRoots(fixture.topLevelHabits, 'all', false, new Set(), visibility)
    const order = buildHabitDateBuckets(roots, TODAY).flatMap((bucket) => bucket.habits.flatMap((habit) => [habit.id, ...visibility.getVisibleChildren(habit.id, 'all').map((child) => child.id)]))
    expect(order).toEqual(HABIT_VIEW_ROW_ORDER.all)
  })

  it('keeps an undated overdue daily root grouped and loggable', () => {
    const fixture = createHabitViewFixture(TODAY, 'all')
    const habit = fixture.habitsById.get('overdue')!
    expect(habit.frequencyUnit).toBe('Day')
    expect(buildHabitDateBuckets([habit], TODAY)[0]?.key).toBe('__overdue__')
    expect(canLogHabitOnDate(habit, TODAY, TODAY)).toBe(true)
  })

  it('counts future children in list progress and waits for them before parent settlement', () => {
    const fixture = createHabitViewFixture(TODAY, 'all')
    const visibility = createHabitVisibilityHelpers({ ...fixture, selectedDate: TODAY, searchQuery: '', showCompleted: false, recentlyCompletedIds: new Set() })
    const children = visibility.getVisibleChildren('parent', 'all')
    expect(computeHabitDayProgress(children, visibility.isDueOnSelectedDate, 'all')).toEqual({ done: 0, total: 2 })
    expect(computeHabitDayProgress(children, visibility.isDueOnSelectedDate)).toEqual({ done: 0, total: 1 })
    expect(computeParentPromptProgress({ parentId: 'parent', getChildren: (id) => visibility.getVisibleChildren(id, 'all'), isDueOnSelectedDate: visibility.isDueOnSelectedDate, isRelevantToday: visibility.isRelevantToday, isListView: true, skippedIds: new Set(), resolvedModes: new Map([['today-child', 'log']]) })).toEqual({ done: 1, total: 2, loggedDone: 1 })
  })
})
