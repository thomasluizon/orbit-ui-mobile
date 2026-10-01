import { describe, expect, it, vi } from 'vitest'
import {
  getHabitReminderPatch,
  mergeHabitReminderChanges,
  saveHabitDetailTag,
  toggleHabitDetailField,
  toggleHabitDetailGoal,
} from '../hooks/habit-detail-fields-core'
import { TAG_COLORS } from '../hooks/tag-selection-core'
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

  it('creates and assigns a trimmed tag while retaining existing selections', async () => {
    const writes = { create: vi.fn().mockResolvedValue({ id: 'tag-new' }), update: vi.fn(), assign: vi.fn() }
    expect(await saveHabitDetailTag('new', '  Focus  ', ['tag-1'], writes)).toBeNull()
    expect(writes.create).toHaveBeenCalledWith({ name: 'Focus', color: TAG_COLORS[0] })
    expect(writes.assign).toHaveBeenCalledWith(['tag-1', 'tag-new'])
    expect(writes.update).not.toHaveBeenCalled()
  })

  it('updates an existing tag without changing its color or assigning it again', async () => {
    const writes = { create: vi.fn(), update: vi.fn(), assign: vi.fn() }
    expect(await saveHabitDetailTag({ id: 'tag-1', name: 'Old', color: TAG_COLORS[1] }, '  New  ', [], writes)).toBeNull()
    expect(writes.update).toHaveBeenCalledWith({ tagId: 'tag-1', name: 'New', color: TAG_COLORS[1] })
    expect(writes.create).not.toHaveBeenCalled()
    expect(writes.assign).not.toHaveBeenCalled()
  })

  it('returns validation errors without writes and propagates assignment failure', async () => {
    const writes = { create: vi.fn().mockResolvedValue({ id: 'tag-new' }), update: vi.fn(), assign: vi.fn().mockRejectedValue(new Error('Assignment failed')) }
    expect(await saveHabitDetailTag('new', ' ', [], writes)).toBe('habits.form.tagNameRequired')
    expect(writes.create).not.toHaveBeenCalled()
    await expect(saveHabitDetailTag('new', 'Focus', [], writes)).rejects.toThrow('Assignment failed')
  })
})
