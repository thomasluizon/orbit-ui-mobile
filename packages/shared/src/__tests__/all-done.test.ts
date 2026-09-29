import { describe, expect, it } from 'vitest'
import { createMockHabit } from './factories'
import { getAllDoneOnDate } from '../utils/all-done'

const date = '2025-03-10'

describe('getAllDoneOnDate', () => {
  it('keeps a flexible habit open until its window target is reached', () => {
    const habit = createMockHabit({ id: 'flexible', isFlexible: true, flexibleTarget: 2,
      flexibleCompleted: 1, isCompleted: true, isLoggedInRange: true, scheduledDates: [date] })
    expect(getAllDoneOnDate(new Map([[habit.id, habit]]), new Map(), date))
      .toEqual({ allDone: false, count: 0 })
  })

  it('resolves a skipped occurrence without counting it as a positive log', () => {
    const logged = createMockHabit({ id: 'logged', scheduledDates: [date], isLoggedInRange: true })
    const skipped = createMockHabit({ id: 'skipped', scheduledDates: [date],
      instances: [{ date, status: 'Completed', logId: 'skip-log' }] })
    const habits = new Map([logged, skipped].map((habit) => [habit.id, habit]))
    expect(getAllDoneOnDate(habits, new Map(), date)).toEqual({ allDone: true, count: 1 })
  })
  it('counts a recurring habit logged in the date range', () => {
    const habit = createMockHabit({ id: 'recurring', isCompleted: false, isLoggedInRange: true, scheduledDates: [date] })
    expect(getAllDoneOnDate(new Map([[habit.id, habit]]), new Map(), date)).toEqual({ allDone: true, count: 1 })
  })

  it('counts a due habit marked completed', () => {
    const habit = createMockHabit({ id: 'completed', isCompleted: true, isLoggedInRange: false, scheduledDates: [date] })
    expect(getAllDoneOnDate(new Map([[habit.id, habit]]), new Map(), date)).toEqual({ allDone: true, count: 1 })
  })

  it('ignores general and bad habits', () => {
    const logged = createMockHabit({ id: 'logged', scheduledDates: [date], isLoggedInRange: true })
    const general = createMockHabit({ id: 'general', isGeneral: true, scheduledDates: [date] })
    const bad = createMockHabit({ id: 'bad', isBadHabit: true, scheduledDates: [date] })
    const habits = [logged, general, bad]
    expect(getAllDoneOnDate(new Map(habits.map((habit) => [habit.id, habit])), new Map(), date))
      .toEqual({ allDone: true, count: 1 })
  })

  it('judges a parent that is not due through its due children', () => {
    const parent = createMockHabit({ id: 'parent', scheduledDates: ['2025-03-11'] })
    const first = createMockHabit({ id: 'first', parentId: 'parent', scheduledDates: [date], isLoggedInRange: true })
    const second = createMockHabit({ id: 'second', parentId: 'parent', scheduledDates: [date], isLoggedInRange: true })
    const habits = new Map([parent, first, second].map((habit) => [habit.id, habit]))
    const children = new Map([['parent', ['first', 'second']]])
    expect(getAllDoneOnDate(habits, children, date)).toEqual({ allDone: true, count: 2 })
    habits.set('second', { ...second, isLoggedInRange: false })
    expect(getAllDoneOnDate(habits, children, date)).toEqual({ allDone: false, count: 1 })
  })

  it('does not finish a day without a completed due item', () => {
    const habit = createMockHabit({ id: 'future', scheduledDates: ['2025-03-11'] })
    expect(getAllDoneOnDate(new Map([[habit.id, habit]]), new Map(), date))
      .toEqual({ allDone: false, count: 0 })
  })
})
