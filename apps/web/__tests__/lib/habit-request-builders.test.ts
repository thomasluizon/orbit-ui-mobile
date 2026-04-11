import { describe, it, expect } from 'vitest'
import {
  buildCreateHabitRequest,
  buildSubHabitRequest,
  buildUpdateHabitRequest,
  type HabitFormData,
} from '@/lib/habit-request-builders'

function makeFormData(overrides: Partial<HabitFormData> = {}): HabitFormData {
  return {
    title: 'Test Habit',
    description: '',
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
    icon: '',
    color: '',
    ...overrides,
  }
}

describe('buildCreateHabitRequest', () => {
  it('creates a basic one-time habit', () => {
    const data = makeFormData()
    const result = buildCreateHabitRequest(data, [], [], [], [])
    expect(result.title).toBe('Test Habit')
    expect(result.isBadHabit).toBe(false)
    expect(result.dueDate).toBe('2025-06-15')
  })

  it('includes description when provided', () => {
    const data = makeFormData({ description: 'My description' })
    const result = buildCreateHabitRequest(data, [], [], [], [])
    expect(result.description).toBe('My description')
  })

  it('sets isGeneral when general habit', () => {
    const data = makeFormData({ isGeneral: true })
    const result = buildCreateHabitRequest(data, [], [], [], [])
    expect(result.isGeneral).toBe(true)
  })

  it('includes frequency for recurring habits', () => {
    const data = makeFormData({
      frequencyUnit: 'Day',
      frequencyQuantity: 2,
    })
    const result = buildCreateHabitRequest(data, [], [], [], [])
    expect(result.frequencyUnit).toBe('Day')
    expect(result.frequencyQuantity).toBe(2)
  })

  it('includes days for weekly habits', () => {
    const data = makeFormData({
      frequencyUnit: 'Week',
      frequencyQuantity: 1,
      days: ['Monday', 'Wednesday'],
    })
    const result = buildCreateHabitRequest(data, [], [], [], [])
    expect(result.days).toEqual(['Monday', 'Wednesday'])
  })

  it('includes tags and goals when provided', () => {
    const data = makeFormData()
    const result = buildCreateHabitRequest(data, [], ['tag1'], ['goal1'], [])
    expect(result.tagIds).toEqual(['tag1'])
    expect(result.goalIds).toEqual(['goal1'])
  })

  it('includes sub-habits (filtered for non-empty)', () => {
    const data = makeFormData()
    const result = buildCreateHabitRequest(data, [], [], [], ['Sub 1', '', 'Sub 2'])
    expect(result.subHabits).toEqual(['Sub 1', 'Sub 2'])
  })

  it('handles bad habit with slip alert', () => {
    const data = makeFormData({ isBadHabit: true, slipAlertEnabled: true })
    const result = buildCreateHabitRequest(data, [], [], [], [])
    expect(result.isBadHabit).toBe(true)
    expect(result.slipAlertEnabled).toBe(true)
  })

  it('includes checklist items when present', () => {
    const data = makeFormData({
      checklistItems: [{ text: 'Step 1', isChecked: false }],
    })
    const result = buildCreateHabitRequest(data, [], [], [], [])
    expect(result.checklistItems).toEqual([{ text: 'Step 1', isChecked: false }])
  })

  it('includes dueTime and reminder fields when time is set', () => {
    const data = makeFormData({
      dueTime: '09:00',
      dueEndTime: '10:00',
      reminderEnabled: true,
    })
    const result = buildCreateHabitRequest(data, [15, 30], [], [], [])
    expect(result.dueTime).toBe('09:00')
    expect(result.dueEndTime).toBe('10:00')
    expect(result.reminderEnabled).toBe(true)
    expect(result.reminderTimes).toEqual([15, 30])
  })

  it('includes scheduled reminders when no dueTime but reminders enabled', () => {
    const data = makeFormData({
      reminderEnabled: true,
      scheduledReminders: [{ when: 'same_day' as const, time: '08:00' }],
    })
    const result = buildCreateHabitRequest(data, [], [], [], [])
    expect(result.reminderEnabled).toBe(true)
    expect(result.scheduledReminders).toEqual([{ when: 'same_day', time: '08:00' }])
  })

  it('includes endDate for recurring habits', () => {
    const data = makeFormData({
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      endDate: '2025-12-31',
    })
    const result = buildCreateHabitRequest(data, [], [], [], [])
    expect(result.endDate).toBe('2025-12-31')
  })

  it('includes isFlexible for flexible habits', () => {
    const data = makeFormData({
      isFlexible: true,
      frequencyUnit: 'Week',
      frequencyQuantity: 3,
    })
    const result = buildCreateHabitRequest(data, [], [], [], [])
    expect(result.isFlexible).toBe(true)
  })
})

describe('buildSubHabitRequest', () => {
  it('creates a minimal sub-habit', () => {
    const data = makeFormData()
    const result = buildSubHabitRequest(data, [], [])
    expect(result.title).toBe('Test Habit')
  })

  it('includes schedule fields for non-general sub-habits', () => {
    const data = makeFormData({
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
    })
    const result = buildSubHabitRequest(data, [], [])
    expect(result.frequencyUnit).toBe('Day')
  })

  it('omits schedule fields for general sub-habits', () => {
    const data = makeFormData({ isGeneral: true })
    const result = buildSubHabitRequest(data, [], [])
    expect(result.frequencyUnit).toBeUndefined()
  })

  it('includes tags', () => {
    const data = makeFormData()
    const result = buildSubHabitRequest(data, [], ['tag1'])
    expect(result.tagIds).toEqual(['tag1'])
  })
})

describe('buildUpdateHabitRequest', () => {
  it('creates a basic update request', () => {
    const data = makeFormData()
    const result = buildUpdateHabitRequest(data, true, '', [], [])
    expect(result.title).toBe('Test Habit')
    expect(result.isGeneral).toBe(false)
  })

  it('sets clearEndDate when original had endDate but new does not', () => {
    const data = makeFormData({
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      endDate: '',
    })
    const result = buildUpdateHabitRequest(data, false, '2025-06-01', [], [])
    expect(result.clearEndDate).toBe(true)
  })

  it('does not set clearEndDate when endDate remains', () => {
    const data = makeFormData({
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      endDate: '2025-12-31',
    })
    const result = buildUpdateHabitRequest(data, false, '2025-06-01', [], [])
    expect(result.endDate).toBe('2025-12-31')
    expect(result.clearEndDate).toBeUndefined()
  })

  it('includes goalIds', () => {
    const data = makeFormData()
    const result = buildUpdateHabitRequest(data, true, '', [], ['goal1', 'goal2'])
    expect(result.goalIds).toEqual(['goal1', 'goal2'])
  })

  it('disables slipAlertEnabled when not a bad habit', () => {
    const data = makeFormData({ isBadHabit: false, slipAlertEnabled: true })
    const result = buildUpdateHabitRequest(data, true, '', [], [])
    expect(result.slipAlertEnabled).toBe(false)
  })

  it('enables slipAlertEnabled for bad habits', () => {
    const data = makeFormData({ isBadHabit: true, slipAlertEnabled: true })
    const result = buildUpdateHabitRequest(data, true, '', [], [])
    expect(result.slipAlertEnabled).toBe(true)
  })

  it('disables reminder when no time and no scheduled reminders', () => {
    const data = makeFormData({ reminderEnabled: false })
    const result = buildUpdateHabitRequest(data, true, '', [], [])
    expect(result.reminderEnabled).toBe(false)
  })

  it('includes scheduled reminders when enabled without dueTime', () => {
    const data = makeFormData({
      reminderEnabled: true,
      scheduledReminders: [{ when: 'same_day' as const, time: '08:00' }],
    })
    const result = buildUpdateHabitRequest(data, true, '', [], [])
    expect(result.reminderEnabled).toBe(true)
    expect(result.scheduledReminders).toEqual([{ when: 'same_day', time: '08:00' }])
  })
})
