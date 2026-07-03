import { describe, it, expect } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { buildCommandHabitList } from '@/components/command/build-command-habit-list'

function buildInput(habits: NormalizedHabit[]) {
  const habitsById = new Map(habits.map((habit) => [habit.id, habit]))
  const childrenByParent = new Map<string, string[]>()
  for (const habit of habits) {
    if (habit.parentId === null) continue
    const siblings = childrenByParent.get(habit.parentId) ?? []
    siblings.push(habit.id)
    childrenByParent.set(habit.parentId, siblings)
  }
  return {
    habitsById,
    childrenByParent,
    topLevelHabits: habits.filter((habit) => habit.parentId === null),
  }
}

const parent = createMockHabit({
  id: 'p1',
  title: 'Morning',
  isOverdue: true,
  position: 0,
  hasSubHabits: true,
})
const child = createMockHabit({
  id: 'c1',
  title: 'Stretch',
  parentId: 'p1',
  isOverdue: true,
  position: 0,
})
const completedOneTime = createMockHabit({
  id: 'o1',
  title: 'Old task',
  frequencyUnit: null,
  isCompleted: true,
  dueDate: '2020-01-01',
  position: 1,
})
const allOnlyOneTime = createMockHabit({
  id: 'a1',
  title: 'Read',
  frequencyUnit: null,
  isCompleted: false,
  dueDate: '2020-01-01',
  position: 2,
})

describe('buildCommandHabitList', () => {
  it('lists Today-visible habits first, then the All remainder', () => {
    const entries = buildCommandHabitList(
      buildInput([parent, child, completedOneTime, allOnlyOneTime]),
    )
    expect(entries.map((entry) => entry.habit.id)).toEqual(['p1', 'c1', 'a1'])
  })

  it('excludes completed one-time tasks entirely', () => {
    const entries = buildCommandHabitList(
      buildInput([parent, child, completedOneTime, allOnlyOneTime]),
    )
    expect(entries.some((entry) => entry.habit.id === 'o1')).toBe(false)
  })

  it('includes sub-habits carrying their parent title', () => {
    const entries = buildCommandHabitList(buildInput([parent, child]))
    const stretch = entries.find((entry) => entry.habit.id === 'c1')
    expect(stretch?.parentTitle).toBe('Morning')
    expect(entries.find((entry) => entry.habit.id === 'p1')?.parentTitle).toBeNull()
  })

  it('does not repeat a habit that appears in both Today and All', () => {
    const entries = buildCommandHabitList(
      buildInput([parent, child, completedOneTime, allOnlyOneTime]),
    )
    const ids = entries.map((entry) => entry.habit.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
