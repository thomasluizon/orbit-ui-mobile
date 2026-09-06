import { describe, expect, it } from 'vitest'
import type { NormalizedHabit } from '../types/habit'
import { buildCommandHabitList } from '../utils/command-habit-list'
import { formatAPIDate } from '../utils/dates'
import { createMockHabit } from './factories'

function buildInput(habits: NormalizedHabit[]) {
  const childrenByParent = new Map<string, string[]>()
  for (const habit of habits) {
    if (habit.parentId === null) continue
    const siblings = childrenByParent.get(habit.parentId) ?? []
    siblings.push(habit.id)
    childrenByParent.set(habit.parentId, siblings)
  }
  return {
    habitsById: new Map(habits.map((habit) => [habit.id, habit])),
    childrenByParent,
    topLevelHabits: habits.filter((habit) => habit.parentId === null),
  }
}

function scheduledHabit(id: string, overrides: Partial<NormalizedHabit> = {}) {
  return createMockHabit({
    id,
    title: id,
    dueDate: '2099-01-01',
    scheduledDates: ['2099-01-01'],
    ...overrides,
  })
}

describe('buildCommandHabitList', () => {
  it('returns no choices for an empty collection', () => {
    expect(buildCommandHabitList(buildInput([]))).toEqual([])
  })

  it('puts Today choices before the All remainder without repeating either', () => {
    const today = formatAPIDate(new Date())
    const later = scheduledHabit('later')
    const due = scheduledHabit('due', { dueDate: today, scheduledDates: [today] })
    const overdue = scheduledHabit('overdue', { isOverdue: true })
    const general = scheduledHabit('general', { isGeneral: true })

    expect(buildCommandHabitList(buildInput([later, due, overdue, general]))).toEqual([
      { habit: due, parentTitle: null },
      { habit: overdue, parentTitle: null },
      { habit: general, parentTitle: null },
      { habit: later, parentTitle: null },
    ])
  })

  it('omits finished one-time choices but keeps completed recurring habits for later use', () => {
    const finished = scheduledHabit('finished', { frequencyUnit: null, isCompleted: true })
    const recurring = scheduledHabit('recurring', { isCompleted: true, isLoggedInRange: true })

    expect(buildCommandHabitList(buildInput([finished, recurring]))).toEqual([
      { habit: recurring, parentTitle: null },
    ])
  })

  it('walks nested choices in position order and names each immediate parent', () => {
    const parent = scheduledHabit('parent', { hasSubHabits: true })
    const last = scheduledHabit('last', { parentId: parent.id, position: 2 })
    const first = scheduledHabit('first', { parentId: parent.id, position: 1, hasSubHabits: true })
    const grandchild = scheduledHabit('grandchild', { parentId: first.id })
    const finished = scheduledHabit('finished', { parentId: parent.id, frequencyUnit: null, isCompleted: true })

    expect(buildCommandHabitList(buildInput([parent, last, first, grandchild, finished]))).toEqual([
      { habit: parent, parentTitle: null },
      { habit: first, parentTitle: parent.title },
      { habit: grandchild, parentTitle: first.title },
      { habit: last, parentTitle: parent.title },
    ])
  })

  it('adds future children after Today choices without repeating the parent or active child', () => {
    const parent = scheduledHabit('parent', { hasSubHabits: true })
    const future = scheduledHabit('future', { parentId: parent.id, position: 0 })
    const active = scheduledHabit('active', { parentId: parent.id, isOverdue: true, position: 1 })

    expect(buildCommandHabitList(buildInput([parent, future, active]))).toEqual([
      { habit: parent, parentTitle: null },
      { habit: active, parentTitle: parent.title },
      { habit: future, parentTitle: parent.title },
    ])
  })
})
