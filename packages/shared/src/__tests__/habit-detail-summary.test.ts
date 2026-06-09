import { describe, it, expect } from 'vitest'
import { formatHabitDetailSummary } from '../utils/habit-detail-summary'

const base = {
  currentStreak: 0,
  streakLabel: 'Current',
  hasLinkedGoal: false,
  linkedGoalLabel: 'Linked goal',
  checklistChecked: 0,
  checklistTotal: 0,
}

describe('formatHabitDetailSummary', () => {
  it('joins all present parts with a middot separator', () => {
    expect(
      formatHabitDetailSummary({
        ...base,
        currentStreak: 12,
        hasLinkedGoal: true,
        checklistChecked: 3,
        checklistTotal: 5,
      }),
    ).toBe('Current 12  ·  Linked goal  ·  3/5')
  })

  it('omits the streak when it is zero', () => {
    expect(
      formatHabitDetailSummary({ ...base, hasLinkedGoal: true }),
    ).toBe('Linked goal')
  })

  it('omits the linked goal when there is none', () => {
    expect(formatHabitDetailSummary({ ...base, currentStreak: 4 })).toBe('Current 4')
  })

  it('shows checklist progress only when the checklist has items', () => {
    expect(
      formatHabitDetailSummary({ ...base, checklistChecked: 1, checklistTotal: 4 }),
    ).toBe('1/4')
  })

  it('returns an empty string when there is nothing to summarize', () => {
    expect(formatHabitDetailSummary(base)).toBe('')
  })
})
