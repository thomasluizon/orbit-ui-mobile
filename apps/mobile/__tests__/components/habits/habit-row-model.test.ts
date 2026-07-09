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
    expect(resolveHabitRowDotState(true, true, true)).toBe('done')
    expect(resolveHabitRowDotState(false, true, true)).toBe('bad')
    expect(resolveHabitRowDotState(false, false, true)).toBe('overdue')
    expect(resolveHabitRowDotState(false, false, false)).toBe('empty')
  })
})

describe('buildHabitRowMetaParts', () => {
  const base = {
    frequencyLabel: 'Every day',
    isOverdue: false,
    selectedDateStr: '2025-01-01',
    todayStr: '2025-01-01',
    displayTime,
    t,
    locale: 'en',
  }

  it('includes the frequency label for a scheduled habit', () => {
    const parts = buildHabitRowMetaParts({ ...base, habit: createMockHabit() })
    expect(parts).toContain('Every day')
  })

  it('omits the frequency label for a general habit', () => {
    const parts = buildHabitRowMetaParts({ ...base, habit: createMockHabit({ isGeneral: true }) })
    expect(parts).not.toContain('Every day')
  })

  it('formats a due-time range', () => {
    const parts = buildHabitRowMetaParts({
      ...base,
      habit: createMockHabit({ dueTime: '08:00', dueEndTime: '09:00' }),
    })
    expect(parts).toContain('08:00 - 09:00')
  })

  it('shows checklist progress', () => {
    const parts = buildHabitRowMetaParts({
      ...base,
      habit: createMockHabit({
        checklistItems: [
          { text: 'A', isChecked: true },
          { text: 'B', isChecked: false },
        ],
      }),
    })
    expect(parts).toContain('1/2')
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
