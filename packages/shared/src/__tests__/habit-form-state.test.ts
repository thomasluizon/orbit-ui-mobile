import { describe, expect, it } from 'vitest'
import { createMockGoal } from './factories'
import {
  applyHabitFormMode,
  buildEditHabitFormState,
  buildEmptyHabitFormValues,
  buildParentHabitFormState,
  DEFAULT_REMINDER_TIMES,
  resolveAutoManagedReminderEnabled,
  resolveHabitFormMode,
  toggleSelectedId,
} from '../utils/habit-form-state'
import type { HabitDetail, NormalizedHabit } from '../types/habit'

function makeHabit(overrides: Partial<NormalizedHabit> = {}): NormalizedHabit {
  return {
    id: overrides.id ?? 'habit-1',
    title: overrides.title ?? 'Exercise',
    description: overrides.description ?? null,
    frequencyUnit: 'frequencyUnit' in overrides ? (overrides.frequencyUnit ?? null) : 'Day',
    frequencyQuantity: overrides.frequencyQuantity ?? 1,
    isBadHabit: overrides.isBadHabit ?? false,
    isCompleted: overrides.isCompleted ?? false,
    isGeneral: overrides.isGeneral ?? false,
    isFlexible: overrides.isFlexible ?? false,
    days: overrides.days ?? [],
    dueDate: overrides.dueDate ?? '2025-01-01',
    dueTime: overrides.dueTime ?? null,
    dueEndTime: overrides.dueEndTime ?? null,
    endDate: overrides.endDate ?? null,
    position: overrides.position ?? 0,
    checklistItems: overrides.checklistItems ?? [],
    createdAtUtc: overrides.createdAtUtc ?? '2025-01-01T00:00:00Z',
    parentId: overrides.parentId ?? null,
    scheduledDates: overrides.scheduledDates ?? ['2025-01-01'],
    isOverdue: overrides.isOverdue ?? false,
    reminderEnabled: overrides.reminderEnabled ?? false,
    reminderTimes: overrides.reminderTimes ?? [],
    scheduledReminders: overrides.scheduledReminders ?? [],
    slipAlertEnabled: overrides.slipAlertEnabled ?? false,
    tags: overrides.tags ?? [{ id: 'tag-1', name: 'Health', color: '#00ff00' }],
    hasSubHabits: overrides.hasSubHabits ?? false,
    flexibleTarget: overrides.flexibleTarget ?? null,
    flexibleCompleted: overrides.flexibleCompleted ?? null,
    isLoggedInRange: overrides.isLoggedInRange ?? false,
    linkedGoals: overrides.linkedGoals ?? [createMockGoal({ id: 'goal-1' })].map((goal) => ({
      id: goal.id,
      title: goal.title,
    })),
    instances: overrides.instances ?? [],
    searchMatches: overrides.searchMatches,
  }
}

function makeDetail(overrides: Partial<HabitDetail> = {}): HabitDetail {
  return {
    id: overrides.id ?? 'habit-1',
    title: overrides.title ?? 'Exercise',
    description: overrides.description ?? null,
    frequencyUnit: overrides.frequencyUnit ?? 'Day',
    frequencyQuantity: overrides.frequencyQuantity ?? 1,
    isBadHabit: overrides.isBadHabit ?? false,
    isCompleted: overrides.isCompleted ?? false,
    isGeneral: overrides.isGeneral ?? false,
    isFlexible: overrides.isFlexible ?? false,
    days: overrides.days ?? [],
    dueDate: overrides.dueDate ?? '2025-01-01',
    dueTime: overrides.dueTime ?? null,
    dueEndTime: overrides.dueEndTime ?? null,
    endDate: overrides.endDate ?? null,
    position: overrides.position ?? 0,
    checklistItems: overrides.checklistItems ?? [],
    createdAtUtc: overrides.createdAtUtc ?? '2025-01-01T00:00:00Z',
    reminderEnabled: overrides.reminderEnabled ?? false,
    reminderTimes: overrides.reminderTimes ?? [],
    scheduledReminders: overrides.scheduledReminders ?? [],
    children: overrides.children ?? [],
  }
}

describe('habit-form-state', () => {
  it('builds empty create values', () => {
    expect(buildEmptyHabitFormValues('2025-01-02')).toEqual({
      title: '',
      description: '',
      icon: null,
      frequencyUnit: null,
      frequencyQuantity: null,
      days: [],
      isBadHabit: false,
      isGeneral: false,
      isFlexible: false,
      dueDate: '2025-01-02',
      dueTime: '',
      dueEndTime: '',
      endDate: '',
      reminderEnabled: false,
      scheduledReminders: [],
      slipAlertEnabled: false,
      checklistItems: [],
    })
  })

  it('defaults create values to today when no date is provided', () => {
    expect(buildEmptyHabitFormValues().dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('builds parent prefill state', () => {
    const state = buildParentHabitFormState(
      makeHabit({
        isFlexible: true,
        frequencyUnit: 'Week',
        frequencyQuantity: 3,
        reminderTimes: [30],
      }),
      '2025-01-05',
    )

    expect(state.mode).toBe('flexible')
    expect(state.formValues.frequencyUnit).toBe('Week')
    expect(state.reminderTimes).toEqual([30])
    expect(state.selectedTagIds).toEqual(['tag-1'])
    expect(state.selectedGoalIds).toEqual(['goal-1'])
  })

  it('falls back to default reminder times when parent has none', () => {
    const state = buildParentHabitFormState(makeHabit({ reminderTimes: [] }))
    expect(state.reminderTimes).toEqual([...DEFAULT_REMINDER_TIMES])
  })

  it('builds edit state from habit and detail', () => {
    const state = buildEditHabitFormState(
      makeHabit({ dueTime: '08:30:00', dueEndTime: '09:00:00' }),
      makeDetail({ dueDate: '2025-02-01', endDate: '2025-02-10' }),
    )

    expect(state.formValues.dueDate).toBe('2025-02-01')
    expect(state.formValues.dueTime).toBe('08:30')
    expect(state.formValues.dueEndTime).toBe('09:00')
    expect(state.originalEndDate).toBe('2025-02-10')
  })

  it('resolves and applies modes', () => {
    expect(resolveHabitFormMode(makeHabit({ isGeneral: true, frequencyUnit: null }))).toBe('general')
    expect(resolveHabitFormMode(makeHabit({ isFlexible: true }))).toBe('flexible')
    expect(resolveHabitFormMode(makeHabit({ frequencyUnit: 'Week' }))).toBe('recurring')
    expect(resolveHabitFormMode(makeHabit({ frequencyUnit: null, isGeneral: false, isFlexible: false }))).toBe('oneTime')

    const calls: string[] = []
    applyHabitFormMode('general', {
      setOneTime: () => calls.push('oneTime'),
      setRecurring: () => calls.push('recurring'),
      setFlexible: () => calls.push('flexible'),
      setGeneral: () => calls.push('general'),
    })

    expect(calls).toEqual(['general'])
  })

  it('toggles selected ids', () => {
    expect(toggleSelectedId(['a', 'b'], 'a')).toEqual(['b'])
    expect(toggleSelectedId(['a'], 'b')).toEqual(['a', 'b'])
  })

  it('auto-enables reminders for timed habits while the toggle is still auto-managed', () => {
    expect(
      resolveAutoManagedReminderEnabled({
        dueTime: '09:00',
        scheduledReminderCount: 0,
        reminderEnabled: false,
        reminderWasManuallyToggled: false,
      }),
    ).toBe(true)
  })

  it('does not auto-reenable reminders after the user manually changed the toggle', () => {
    expect(
      resolveAutoManagedReminderEnabled({
        dueTime: '09:00',
        scheduledReminderCount: 0,
        reminderEnabled: false,
        reminderWasManuallyToggled: true,
      }),
    ).toBeNull()
  })

  it('auto-disables reminders when due time is cleared and no scheduled reminders exist', () => {
    expect(
      resolveAutoManagedReminderEnabled({
        dueTime: '',
        scheduledReminderCount: 0,
        reminderEnabled: true,
        reminderWasManuallyToggled: false,
      }),
    ).toBe(false)
  })

  it('does not auto-disable reminders when scheduled reminders exist', () => {
    expect(
      resolveAutoManagedReminderEnabled({
        dueTime: '',
        scheduledReminderCount: 1,
        reminderEnabled: true,
        reminderWasManuallyToggled: false,
      }),
    ).toBeNull()
  })
})
