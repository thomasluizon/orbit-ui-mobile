import { expect, it } from 'vitest'
import { daySummaryCompletion, daySummaryLogControl, habitReadStatusKey, habitSnapshotCheck } from '../chat/day-summary-core'
import { createMockHabit } from './factories'
import { nestedDaySummaryFixture, rangeDaySummaryFixture } from './in-place-block-fixtures'

it('preserves saved period totals and rounding when live occurrences cover only the first day', () => {
  for (const isLoggedInRange of [false, true]) {
    const occurrences = new Map([['habit-1', createMockHabit({ isLoggedInRange })]])
    expect(daySummaryCompletion(rangeDaySummaryFixture, occurrences)).toEqual({ done: 3, completionRate: 43 })
  }
  expect(daySummaryCompletion(rangeDaySummaryFixture, undefined)).toEqual({ done: 3, completionRate: 43 })
  expect(daySummaryCompletion({ ...rangeDaySummaryFixture, due: 0, done: 0, completionRate: null }, undefined)).toEqual({ done: 0, completionRate: 0 })
})

it.each([false, true])('reconciles a nested single-day row from saved logged=%s through log, unlog and rollback', (savedLogged) => {
  const snapshot = {
    ...nestedDaySummaryFixture, done: Number(savedLogged), completionRate: Number(savedLogged) * 50,
    rows: nestedDaySummaryFixture.rows!.map(row => row.depth > 0 ? { ...row, status: savedLogged ? 'done' as const : 'today' as const } : row),
  }
  for (const isLoggedInRange of [savedLogged, !savedLogged, savedLogged]) {
    const occurrences = new Map([
      ['habit-1', createMockHabit()],
      ['child-1', createMockHabit({ id: 'child-1', isLoggedInRange })],
    ])
    expect(daySummaryCompletion(snapshot, occurrences)).toEqual({ done: Number(isLoggedInRange), completionRate: Number(isLoggedInRange) * 50 })
  }
})

it('keeps unavailable contributions and excludes avoid-habit slips from single-day completions', () => {
  const occurrences = new Map([['habit-1', createMockHabit({ isLoggedInRange: true })]])
  expect(daySummaryCompletion(nestedDaySummaryFixture, occurrences)).toEqual({ done: 2, completionRate: 100 })
  expect(daySummaryCompletion(nestedDaySummaryFixture, undefined)).toEqual({ done: 1, completionRate: 50 })
  const avoidParentSnapshot = { ...nestedDaySummaryFixture, rows: nestedDaySummaryFixture.rows!.map(row => row.depth === 0 ? { ...row, isBadHabit: true } : row) }
  const avoidOccurrences = new Map([['habit-1', createMockHabit({ isBadHabit: true, isLoggedInRange: true })]])
  expect(daySummaryCompletion(avoidParentSnapshot, avoidOccurrences)).toEqual({ done: 1, completionRate: 50 })
  expect(daySummaryCompletion({ ...nestedDaySummaryFixture, due: 0, done: 0, rows: null }, undefined)).toEqual({ done: 0, completionRate: 0 })
})

it.each([
  ['done', false, 'done', 'chat.habitList.logged'],
  ['done', true, 'bad', 'habits.statusDot.bad'],
  ['overdue', false, 'overdue', 'chat.habitList.overdue'],
  ['today', false, 'empty', 'chat.habitList.pending'],
] as const)('keeps the saved %s check when a live occurrence is unavailable', (status, isBadHabit, checkStatus, statusKey) => {
  expect(habitSnapshotCheck({ status, isBadHabit })).toEqual({ status: checkStatus, statusKey })
})

it('separates current write eligibility from the saved date and figures', () => {
  const habit = createMockHabit({ id: 'habit-one', createdAtUtc: '2026-09-01T00:00:00Z', frequencyUnit: 'Day', scheduledDates: ['2026-10-22'], dueDate: '2026-09-01' })
  const context = { date: '2026-10-22', today: '2026-10-22', timeZone: 'UTC', ready: true }
  expect(daySummaryLogControl(habit, false, context).writeAllowed).toBe(true)
  expect(daySummaryLogControl(habit, false, { ...context, date: '2026-10-23' }).writeAllowed).toBe(false)
  expect(daySummaryLogControl(habit, false, { ...context, date: '2026-09-01' }).writeAllowed).toBe(false)
  expect(daySummaryLogControl(habit, false, { ...context, ready: false }).writeAllowed).toBe(false)
  expect(daySummaryLogControl(undefined, true, context)).toMatchObject({ status: 'overdue', writeAllowed: false })
  expect(daySummaryLogControl({ ...habit, isLoggedInRange: true, isBadHabit: true }, false, context)).toMatchObject({ status: 'bad', undoUnavailable: true })
  expect(daySummaryLogControl(habit).writeAllowed).toBe(true)
  expect(daySummaryLogControl({ ...habit, isLoggedInRange: true, isFlexible: true }).undoUnavailable).toBe(true)
})

it('retains the server row status independently of live completion', () => {
  expect(habitReadStatusKey('done', false)).toBe('chat.habitList.logged')
  expect(habitReadStatusKey('done', true)).toBe('habits.statusDot.bad')
  expect(habitReadStatusKey('overdue', false)).toBe('chat.habitList.overdue')
  expect(habitReadStatusKey('none', false)).toBeNull()
})

it.each([
  [false, false, false, 'empty', 'chat.habitList.pending', 'chat.habitList.log', false],
  [true, false, false, 'overdue', 'chat.habitList.overdue', 'chat.habitList.log', false],
  [true, false, true, 'overdue', 'chat.habitList.overdue', 'chat.habitList.log', false],
  [false, true, false, 'done', 'chat.habitList.logged', 'chat.habitList.unlog', false],
  [true, true, false, 'done', 'chat.habitList.logged', 'chat.habitList.unlog', false],
  [false, true, true, 'bad', 'habits.statusDot.bad', 'chat.habitList.unlog', true],
  [true, true, true, 'bad', 'habits.statusDot.bad', 'chat.habitList.unlog', true],
] as const)('names overdue=%s logged=%s bad=%s without changing actions', (overdue, logged, isBadHabit, status, statusKey, actionKey, undoUnavailable) => {
  const habit = createMockHabit({ isLoggedInRange: logged, isBadHabit })
  expect(daySummaryLogControl(habit, overdue)).toEqual({ logged, status, statusKey, actionKey, undoUnavailable, writeAllowed: true })
})
