import { describe, expect, it } from 'vitest'
import {
  getHabitReminderPatch,
  mergeHabitReminderChanges,
  toggleHabitDetailField,
  toggleHabitDetailGoal,
} from '../hooks/habit-detail-fields-core'
import { makeHabitDetailScopedParent } from '../test-support/habit-detail-fixtures'

describe('habit detail fields core', () => {
  it('toggles goals and keeps a single editor open', () => {
    expect(toggleHabitDetailGoal(['goal-1'], 'goal-1')).toEqual([])
    expect(toggleHabitDetailGoal(['goal-1'], 'goal-2')).toEqual(['goal-1', 'goal-2'])
    expect(toggleHabitDetailField('goals', 'goals')).toBeNull()
    expect(toggleHabitDetailField('goals', 'reminders')).toBe('reminders')
  })

  it('merges partial reminder drafts and validates them before saving', () => {
    const habit = { ...makeHabitDetailScopedParent(), dueTime: '09:00' }
    const scheduled = [{ when: 'same_day' as const, time: '08:00' }]
    expect(mergeHabitReminderChanges(true, [30], scheduled, {})).toEqual({
      reminderEnabled: true, reminderTimes: [30], scheduledReminders: scheduled,
    })
    expect(mergeHabitReminderChanges(true, [30], scheduled, { enabled: false, offsets: [], scheduled: [] })).toEqual({
      reminderEnabled: false, reminderTimes: [], scheduledReminders: [],
    })
    expect(getHabitReminderPatch(habit, true, [], [])).toEqual({ error: 'habits.form.reminderMinimumOne' })
    expect(getHabitReminderPatch(habit, true, [30], scheduled)).toEqual({
      error: null, patch: { reminderEnabled: true, reminderTimes: [30], scheduledReminders: scheduled },
    })
  })

})
