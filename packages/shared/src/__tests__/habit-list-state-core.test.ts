import { afterEach,expect,it,vi } from 'vitest'
import { computeHabitChildrenProgress,createUseHabitRecentCompletions,getHabitDeleteConfirmation } from '../hooks/habit-list-state-core'
import { createHookStateHarness } from '../test-support/hook-state'
import { createMockHabit } from './factories'

afterEach(() => vi.useRealTimers())

it('describes the selected delete subtree and clears a missing selection', () => {
  const parent = createMockHabit({ id: 'parent', title: 'Read' })
  const habits = new Map([[parent.id, parent]])
  const children = new Map([['parent', ['child']], ['child', ['grandchild']]])
  expect(getHabitDeleteConfirmation(parent.id, habits, children)).toEqual({ name: 'Read', descendantCount: 2 })
  expect(getHabitDeleteConfirmation(null, habits, children)).toEqual({ name: '', descendantCount: 0 })
  expect(getHabitDeleteConfirmation('missing', habits, children)).toEqual({ name: '', descendantCount: 0 })
})

it('counts nested child progress once per ancestor', () => {
  const parent = createMockHabit({ id: 'parent' })
  const child = createMockHabit({ id: 'child', parentId: parent.id, isCompleted: true })
  const grandchild = createMockHabit({ id: 'grandchild', parentId: child.id })
  const habits = [parent, child, grandchild]
  const progress = computeHabitChildrenProgress(new Map(habits.map(habit => [habit.id, habit])), id => habits.filter(habit => habit.parentId === id), { isDueOnSelectedDate: () => true }, 'today')
  expect(progress.get(parent.id)).toEqual({ done: 1, total: 2 })
  expect(progress.get(child.id)).toEqual({ done: 0, total: 1 })
  expect(progress.get(grandchild.id)).toEqual({ done: 0, total: 0 })
})

it('expires recent completions per date and releases its timers on unmount', () => {
  vi.useFakeTimers()
  const state = createHookStateHarness()
  let cleanup: (() => void) | undefined
  let dates = new Map<string, Set<string>>()
  const useRecent = createUseHabitRecentCompletions({
    useRef: value => { const [ref] = state.useState(() => ({ current: value })); return ref },
    useEffect: effect => { cleanup = effect() ?? undefined }, useCallback: callback => callback,
  }, 150)
  const recent = state.render(() => useRecent({ selectedDateStr: '2026-09-16', setRecentlyCompletedDates: update => { dates = typeof update === 'function' ? update(dates) : update } }))
  recent.markRecentlyCompleted('habit')
  recent.markRecentlyCompleted('habit', '2026-09-15')
  expect(dates.get('habit')?.has('2026-09-16')).toBe(true)
  recent.clearRecentlyCompleted('habit', '2026-09-15')
  expect(dates.get('habit')?.has('2026-09-15')).toBe(false)
  vi.advanceTimersByTime(150)
  expect(dates.size).toBe(0)
  recent.markRecentlyCompleted('habit')
  cleanup?.()
  expect(vi.getTimerCount()).toBe(0)
})
