import { describe, expect, it } from 'vitest'
import { createHabitViewFixture, HABIT_VIEW_ROW_ORDER } from './habit-view-fixtures'
import { createHabitVisibilityHelpers, filterHabitViewRoots } from '../utils/habit-visibility'
import { buildHabitDateBuckets, computeHabitDayProgress, computeParentPromptProgress } from '../utils/habit-list-progress'
import { getPersistedUIState, migratePersistedUIState, type UIStoreState } from '../stores/ui-store'

import { canLogHabitOnDate } from '../utils/habit-card-helpers'

const TODAY = '2026-09-12'

describe('production habit views', () => {
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
