import { afterEach, expect, it, vi } from 'vitest'
import { habitListOccurrenceFilters, habitListReadControl, habitListRowState, habitListSnapshotStatusKey } from '../chat/habit-list-core'
import { focusedDatedHabitListFixture } from '../test-support/chat-fixtures'
import { createMockHabit } from './factories'

afterEach(() => vi.useRealTimers())

it('queries only the displayed date including general and overdue occurrences', () => {
  expect(habitListOccurrenceFilters('2026-09-01')).toEqual({ dateFrom: '2026-09-01', dateTo: '2026-09-01', includeGeneral: true, includeOverdue: true })
})

it('retains query completion metadata independently of live action state', () => {
  const item = focusedDatedHabitListFixture.items[0]!
  expect(habitListSnapshotStatusKey(item, true)).toBe('chat.habitList.logged')
  expect(habitListSnapshotStatusKey(item, false)).toBeUndefined()
  expect(habitListSnapshotStatusKey({ ...item, isBadHabit: true }, true)).toBe('habits.statusDot.bad')
  expect(habitListSnapshotStatusKey({ ...item, status: 'overdue' }, false)).toBe('chat.habitList.overdue')
  expect(habitListSnapshotStatusKey({ ...item, status: 'none' }, true)).toBeUndefined()
})

it('checks action eligibility against the current account day on every interaction', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-22T23:59:00Z'))
  const habit = createMockHabit({ createdAtUtc: '2026-09-01T00:00:00Z', frequencyUnit: 'Day', dueDate: '2026-10-22', scheduledDates: ['2026-10-22'] })
  const scope = { ready: true, timeZone: 'UTC' }
  expect(habitListReadControl(habit, 'today', '2026-10-22', scope).writeAllowed).toBe(true)
  expect(habitListReadControl(habit, 'done', '2026-09-01', scope).writeAllowed).toBe(false)
  expect(habitListReadControl(habit, 'today', '2026-10-22', { ...scope, ready: false }).writeAllowed).toBe(false)
  expect(habitListReadControl(habit, 'today', '2026-10-23', scope).writeAllowed).toBe(false)
  vi.setSystemTime(new Date('2026-10-23T00:01:00Z'))
  expect(habitListReadControl(habit, 'today', '2026-10-23', scope).writeAllowed).toBe(true)
  expect(habitListReadControl(habit, 'today', '2026-10-23', { ...scope, timeZone: 'America/Sao_Paulo' }).writeAllowed).toBe(false)
  expect(habitListReadControl(undefined, 'overdue', '2026-10-22')).toMatchObject({ status: 'overdue', writeAllowed: true })
})

it('keeps row metadata independent of pending, unavailable and completed live controls', () => {
  const item = focusedDatedHabitListFixture.items[0]!
  const habit = createMockHabit({ isLoggedInRange: false })
  expect(habitListRowState(item, habit, true, '2026-09-01', false)).toMatchObject({ snapshotStatusKey: 'chat.habitList.logged', logged: false, unavailable: false })
  expect(habitListRowState(item, habit, true, '2026-09-01', true).unavailable).toBe(true)
  expect(habitListRowState(item, { ...habit, isLoggedInRange: true, isBadHabit: true }, true, '2026-09-01', false)).toMatchObject({ logged: true, unavailable: true })
  expect(habitListRowState(item, undefined, true, '2026-09-01', false, { ready: false, timeZone: null }).unavailable).toBe(true)
})
