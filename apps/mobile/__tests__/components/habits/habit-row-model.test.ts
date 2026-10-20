import { describe, expect, it } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import {
  buildHabitRowAccessibilityLabel,
  buildHabitRowMetaParts,
  resolveHabitRowDotState,
} from '@/components/habits/habit-row-model'

const t = (key: string) => key
const displayTime = (time: string) => time

describe('resolveHabitRowDotState', () => {
  it('prioritizes done, then bad, then overdue, otherwise empty', () => {
    expect(resolveHabitRowDotState(true, true, true)).toBe('bad')
    expect(resolveHabitRowDotState(false, true, true)).toBe('bad')
    expect(resolveHabitRowDotState(false, false, true)).toBe('overdue')
    expect(resolveHabitRowDotState(false, false, false)).toBe('empty')
  })
})

describe('buildHabitRowMetaParts', () => {
  const base = {
    isOverdue: false,
    selectedDateStr: '2025-01-01',
    todayStr: '2025-01-01',
    displayTime,
    t,
    locale: 'en',
  }

  it.each([{}, { isGeneral: true }])('omits routine meta on an untimed habit', (overrides) => {
    expect(buildHabitRowMetaParts({ ...base, habit: createMockHabit(overrides) })).toEqual([])
  })

  it('shows child completion instead of parent timing', () => {
    expect(buildHabitRowMetaParts({ ...base, childProgress: { done: 1, total: 2 },
      habit: createMockHabit({ dueTime: '08:00' }) })).toEqual(['habits.rowProgress'])
  })

  it.each([
    { label: 'overdue', isOverdue: true, isBadHabit: false, isCompleted: false, isLoggedInRange: false,
      states: [{ kind: 'overdue' }] },
    { label: 'completed slip', isOverdue: false, isBadHabit: true, isCompleted: true, isLoggedInRange: false,
      states: [{ kind: 'bad' }] },
    { label: 'recorded slip', isOverdue: true, isBadHabit: true, isCompleted: false, isLoggedInRange: true,
      states: [{ kind: 'overdue' }, { kind: 'bad' }] },
    { label: 'unrecorded bad habit', isOverdue: false, isBadHabit: true, isCompleted: false, isLoggedInRange: false,
      states: [] },
    { label: 'completed overdue habit', isOverdue: true, isBadHabit: false, isCompleted: true, isLoggedInRange: false,
      states: [] },
  ])('preserves parent progress and applicable state words for $label', ({ isOverdue, states, ...flags }) => {
    const habit = createMockHabit({ dueTime: '08:00', dueEndTime: '09:00', hasSubHabits: true, ...flags })
    expect(buildHabitRowMetaParts({ ...base, habit, isOverdue,
      childProgress: { done: 1, total: 2 } })).toEqual(['habits.rowProgress', ...states])
  })

  it('formats a due-time range', () => {
    const parts = buildHabitRowMetaParts({
      ...base,
      habit: createMockHabit({ dueTime: '08:00', dueEndTime: '09:00' }),
    })
    expect(parts).toContain('08:00 - 09:00')
  })

  it('keeps checklist progress out of the row', () => {
    const parts = buildHabitRowMetaParts({
      ...base,
      habit: createMockHabit({
        checklistItems: [
          { text: 'A', isChecked: true },
          { text: 'B', isChecked: false },
        ],
      }),
    })
    expect(parts).toEqual([])
  })

  it('pushes an overdue token when overdue', () => {
    const parts = buildHabitRowMetaParts({ ...base, isOverdue: true, habit: createMockHabit() })
    expect(parts).toContainEqual({ kind: 'overdue' })
  })

  it('adds a future hint when the habit is scheduled ahead of today', () => {
    const parts = buildHabitRowMetaParts({
      ...base,
      habit: createMockHabit({ dueDate: '2025-01-05' }),
    })
    expect(parts).toContainEqual({ kind: 'future', label: 'habits.schedule.dueInDays' })
  })
})

describe('buildHabitRowAccessibilityLabel', () => {
  it('joins title, status, linked-goal and streak', () => {
    const label = buildHabitRowAccessibilityLabel({
      title: 'Run',
      dotState: 'done',
      linkedGoal: true,
      showStreak: true,
      streak: 5,
      t,
    })
    expect(label).toBe('Run, habits.statusDot.done, habits.detail.linkedGoal, 🔥 5')
  })

  it('omits linked-goal and streak when not applicable', () => {
    const label = buildHabitRowAccessibilityLabel({
      title: 'Run',
      dotState: 'empty',
      linkedGoal: false,
      showStreak: false,
      streak: 0,
      t,
    })
    expect(label).toBe('Run, habits.statusDot.empty')
  })
})
