import { describe, expect, it } from 'vitest'
import { createMockHabit } from './factories'
import {
  applyHabitFormMode,
  buildEditHabitFormState,
  buildParentHabitFormState,
  type HabitFormMode,
} from '../utils/habit-form-state'

function recordModeCall(mode: HabitFormMode): string[] {
  const calls: string[] = []
  applyHabitFormMode(mode, {
    setOneTime: () => calls.push('oneTime'),
    setRecurring: () => calls.push('recurring'),
    setFlexible: () => calls.push('flexible'),
    setGeneral: () => calls.push('general'),
  })
  return calls
}

describe('applyHabitFormMode', () => {
  it('dispatches each mode to its matching action', () => {
    expect(recordModeCall('flexible')).toEqual(['flexible'])
    expect(recordModeCall('recurring')).toEqual(['recurring'])
    expect(recordModeCall('oneTime')).toEqual(['oneTime'])
    expect(recordModeCall('general')).toEqual(['general'])
  })
})

describe('scheduled reminder cloning', () => {
  it('deep-copies scheduled reminders into parent prefill state', () => {
    const reminders = [{ when: 'day_before' as const, time: '08:00' }]
    const state = buildParentHabitFormState(createMockHabit({ scheduledReminders: reminders }))

    expect(state.formValues.scheduledReminders).toEqual(reminders)
    expect(state.formValues.scheduledReminders[0]).not.toBe(reminders[0])
  })

  it('deep-copies scheduled reminders into edit state', () => {
    const reminders = [{ when: 'same_day' as const, time: '21:30' }]
    const state = buildEditHabitFormState(createMockHabit({ scheduledReminders: reminders }))

    expect(state.formValues.scheduledReminders).toEqual(reminders)
    expect(state.formValues.scheduledReminders[0]).not.toBe(reminders[0])
  })
})
