import { describe, expect, it } from 'vitest'
import {
  buildCreateHabitRequest,
  buildSubHabitRequest,
  buildUpdateHabitRequest,
  type HabitFormData,
} from '@/lib/habit-request-builders'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { buildEditHabitFormState } from '@orbit/shared/utils'

function makeFormData(overrides: Partial<HabitFormData> = {}): HabitFormData {
  return {
    title: 'Test Habit',
    description: '',
    emoji: '',
    isGeneral: false,
    isFlexible: false,
    frequencyUnit: null,
    frequencyQuantity: null,
    days: [],
    dueDate: '2025-06-15',
    dueTime: '',
    dueEndTime: '',
    endDate: '',
    isBadHabit: false,
    slipAlertEnabled: false,
    reminderEnabled: false,
    scheduledReminders: [],
    checklistItems: [],
    ...overrides,
  }
}

describe('mobile habit request builders', () => {
  it('clears removed timed offsets when saving selected untimed reminders', () => {
    const habit = createMockHabit({
      dueTime: '09:00',
      reminderEnabled: true,
      reminderTimes: [15],
      relativeReminders: [{ minutesBefore: 15 }],
    })
    const editor = buildEditHabitFormState(habit)
    const selectedReminders = [{ when: 'same_day' as const, time: '08:00' }]
    const request = buildUpdateHabitRequest(
      { ...editor.formValues, dueTime: '', scheduledReminders: selectedReminders },
      false,
      editor.originalEndDate,
      [],
      [],
    )

    expect(request.relativeReminders).toEqual([])
    expect(request.scheduledReminders).toEqual(selectedReminders)
  })

  it('clears a removed legacy offset while retaining the edited timed reminders', () => {
    const habit = createMockHabit({
      dueTime: '09:00',
      reminderEnabled: true,
      reminderTimes: [15],
      relativeReminders: [{ when: 'day_before', time: '18:00' }],
    })
    const editor = buildEditHabitFormState(habit)
    expect(editor.reminderTimes).toEqual([15])

    const remainingOffsets = editor.reminderTimes.filter((offset) => offset !== 15)
    const request = buildUpdateHabitRequest(editor.formValues, false, editor.originalEndDate, remainingOffsets, [])

    expect(request.reminderTimes).toEqual([])
    expect(request.relativeReminders).toEqual([{ when: 'day_before', time: '18:00' }])
    expect(request).not.toHaveProperty('scheduledReminders')
  })

  it('builds create payloads with recurring fields, reminders, tags, goals, and sub-habits', () => {
    const data = makeFormData({
      description: 'Description',
      emoji: '🌱',
      frequencyUnit: 'Week',
      frequencyQuantity: 1,
      days: ['Monday', 'Wednesday'],
      dueTime: '09:00',
      dueEndTime: '10:00',
      reminderEnabled: true,
      checklistItems: [{ text: 'Step 1', isChecked: false }],
    })

    const result = buildCreateHabitRequest(data, [15, 30], ['tag-1'], ['goal-1'], ['Sub 1', '', 'Sub 2'])

    expect(result).toMatchObject({
      title: 'Test Habit',
      description: 'Description',
      emoji: '🌱',
      frequencyUnit: 'Week',
      frequencyQuantity: 1,
      days: ['Monday', 'Wednesday'],
      dueTime: '09:00',
      dueEndTime: '10:00',
      reminderEnabled: true,
      relativeReminders: [{ minutesBefore: 15 }, { minutesBefore: 30 }],
      tagIds: ['tag-1'],
      goalIds: ['goal-1'],
      subHabits: ['Sub 1', 'Sub 2'],
      checklistItems: [{ text: 'Step 1', isChecked: false }],
    })
  })

  it('builds general create payloads without schedule fields', () => {
    const result = buildCreateHabitRequest(makeFormData({ isGeneral: true }), [], [], [], [])
    expect(result.isGeneral).toBe(true)
    expect(result.frequencyUnit).toBeUndefined()
  })

  it('builds sub-habit payloads with schedule and tags', () => {
    const result = buildSubHabitRequest(
      makeFormData({ frequencyUnit: 'Day', frequencyQuantity: 2 }),
      [10],
      ['tag-1'],
    )

    expect(result).toMatchObject({
      title: 'Test Habit',
      frequencyUnit: 'Day',
      frequencyQuantity: 2,
      tagIds: ['tag-1'],
    })
  })

  it('builds emoji fields for sub-habit and update payloads', () => {
    expect(buildSubHabitRequest(makeFormData({ emoji: '💧' }), [], [])).toMatchObject({
      emoji: '💧',
    })
    expect(buildUpdateHabitRequest(makeFormData({ emoji: '📚' }), true, '', [], [])).toMatchObject({
      emoji: '📚',
    })
  })

  it('builds update payloads including clearEndDate and scheduled reminders', () => {
    const result = buildUpdateHabitRequest(
      makeFormData({
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        reminderEnabled: true,
        scheduledReminders: [{ when: 'same_day', time: '08:00' }],
      }),
      false,
      '2025-06-01',
      [],
      ['goal-1', 'goal-2'],
    )

    expect(result).toMatchObject({
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      clearEndDate: true,
      reminderEnabled: true,
      scheduledReminders: [{ when: 'same_day', time: '08:00' }],
      goalIds: ['goal-1', 'goal-2'],
    })
  })
})
