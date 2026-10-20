import { describe, expect, it } from 'vitest'
import type { BulkLogResult } from '../types/habit'
import { deriveBulkLogStreakTransition } from '../utils/bulk-log-streak'
import { createMockHabitScheduleChild, createMockHabitScheduleItem } from './factories'

const createdEntry: BulkLogResult['results'][number] = {
  index: 0,
  status: 'Success',
  habitId: 'habit-1',
  logId: 'log-1',
  error: null,
}
const habits = [createMockHabitScheduleItem({ id: createdEntry.habitId })]

describe('deriveBulkLogStreakTransition', () => {
  it.each([
    { name: 'restart', previousStreak: 0, currentStreak: 1, countsTowardStreak: true },
    { name: 'normal first log', previousStreak: 4, currentStreak: 5, countsTowardStreak: true },
    { name: 'second log', previousStreak: 5, currentStreak: 5, countsTowardStreak: false },
    { name: 'unchanged streak', previousStreak: 0, currentStreak: 0, countsTowardStreak: false },
    { name: 'missing previous streak', previousStreak: undefined, currentStreak: 1, countsTowardStreak: false },
    { name: 'null previous streak', previousStreak: null, currentStreak: 1, countsTowardStreak: false },
    { name: 'missing current streak', previousStreak: 0, currentStreak: undefined, countsTowardStreak: false },
    { name: 'null current streak', previousStreak: 0, currentStreak: null, countsTowardStreak: false },
  ])('derives eligibility for $name', ({ previousStreak, currentStreak, countsTowardStreak }) => {
    const response = { previousStreak, currentStreak, results: [createdEntry] }
    expect(deriveBulkLogStreakTransition([response], [createdEntry], habits)).toEqual({
      previousStreak: previousStreak ?? undefined,
      currentStreak: currentStreak ?? undefined,
      countsTowardStreak,
    })
  })

  it.each([
    { firstPrevious: 0, firstCurrent: 1, lastPrevious: 1, lastCurrent: 1, movingBadHabit: false, countsTowardStreak: true },
    { firstPrevious: 0, firstCurrent: 0, lastPrevious: 0, lastCurrent: 1, movingBadHabit: false, countsTowardStreak: true },
    { firstPrevious: 4, firstCurrent: 5, lastPrevious: 5, lastCurrent: 4, movingBadHabit: false, countsTowardStreak: true },
    { firstPrevious: 0, firstCurrent: 1, lastPrevious: 1, lastCurrent: 1, movingBadHabit: true, countsTowardStreak: false },
  ])('keeps chunk eligibility separate from the overall transition: %j', (scenario) => {
    const lastEntry = { ...createdEntry, index: 100, habitId: 'habit-101', logId: 'log-101' }
    const responses = [
      { previousStreak: scenario.firstPrevious, currentStreak: scenario.firstCurrent, results: [createdEntry] },
      { previousStreak: scenario.lastPrevious, currentStreak: scenario.lastCurrent, results: [lastEntry] },
    ]
    const previousHabits = [
      createMockHabitScheduleItem({ id: createdEntry.habitId, isBadHabit: scenario.movingBadHabit }),
      createMockHabitScheduleItem({ id: lastEntry.habitId, isBadHabit: scenario.lastCurrent < scenario.lastPrevious }),
    ]
    expect(deriveBulkLogStreakTransition(responses, [createdEntry, lastEntry], previousHabits)).toEqual({
      previousStreak: scenario.firstPrevious,
      currentStreak: scenario.lastCurrent,
      countsTowardStreak: scenario.countsTowardStreak,
    })
  })

  it.each([
    { name: 'no created log', entry: { ...createdEntry, logId: null }, successfulEntries: [createdEntry], previousHabits: habits },
    { name: 'ineligible date or queued entry', entry: createdEntry, successfulEntries: [], previousHabits: habits },
    { name: 'different result index', entry: { ...createdEntry, index: 100 }, successfulEntries: [createdEntry], previousHabits: habits },
    { name: 'uncached habit', entry: createdEntry, successfulEntries: [createdEntry], previousHabits: [] },
    { name: 'slip', entry: createdEntry, successfulEntries: [createdEntry], previousHabits: [createMockHabitScheduleItem({ id: createdEntry.habitId, isBadHabit: true })] },
  ])('excludes $name from the moving chunk', ({ entry, successfulEntries, previousHabits }) => {
    expect(deriveBulkLogStreakTransition(
      [{ previousStreak: 0, currentStreak: 1, results: [entry] }], successfulEntries, previousHabits,
    ).countsTowardStreak).toBe(false)
  })

  it('finds a positive child habit in the previous tree', () => {
    const previousHabits = [createMockHabitScheduleItem({
      id: 'parent',
      children: [createMockHabitScheduleChild({ id: createdEntry.habitId })],
    })]
    expect(deriveBulkLogStreakTransition(
      [{ previousStreak: 0, currentStreak: 1, results: [createdEntry] }], [createdEntry], previousHabits,
    ).countsTowardStreak).toBe(true)
  })

  it('does not borrow missing transition fields from another chunk', () => {
    const responses = [
      { results: [createdEntry] },
      { previousStreak: 0, currentStreak: 1, results: [createdEntry] },
      { results: [] },
    ]
    expect(deriveBulkLogStreakTransition(responses, [createdEntry], habits)).toEqual({
      previousStreak: undefined, currentStreak: undefined, countsTowardStreak: true,
    })
  })

  it('returns no transition for no confirmed responses', () => {
    expect(deriveBulkLogStreakTransition([], [], habits)).toEqual({
      previousStreak: undefined, currentStreak: undefined, countsTowardStreak: false,
    })
  })
})
