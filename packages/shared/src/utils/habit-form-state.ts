import type { HabitDetail, NormalizedHabit } from '../types/habit'
import type { HabitFormData } from '../validation'
import { formatAPIDate } from './dates'

export const DEFAULT_REMINDER_TIMES = [0, 15] as const

export type HabitFormMode = 'oneTime' | 'recurring' | 'flexible' | 'general'

export interface HabitFormModeActions {
  setOneTime: () => void
  setRecurring: () => void
  setFlexible: () => void
  setGeneral: () => void
}

export interface HabitFormStateSnapshot {
  formValues: HabitFormData
  mode: HabitFormMode
  reminderTimes: number[]
  selectedGoalIds: string[]
  selectedTagIds: string[]
}

export interface EditHabitFormStateSnapshot extends HabitFormStateSnapshot {
  originalEndDate: string
}

export interface AutoManagedReminderEnabledInput {
  dueTime: string
  scheduledReminderCount: number
  reminderEnabled: boolean
  reminderWasManuallyToggled: boolean
}

export function buildEmptyHabitFormValues(initialDate?: string | null): HabitFormData {
  return {
    title: '',
    description: '',
    icon: null,
    frequencyUnit: null,
    frequencyQuantity: null,
    days: [],
    isBadHabit: false,
    isGeneral: false,
    isFlexible: false,
    dueDate: initialDate ?? formatAPIDate(new Date()),
    dueTime: '',
    dueEndTime: '',
    endDate: '',
    reminderEnabled: false,
    scheduledReminders: [],
    slipAlertEnabled: false,
    checklistItems: [],
  }
}

export function resolveAutoManagedReminderEnabled({
  dueTime,
  scheduledReminderCount,
  reminderEnabled,
  reminderWasManuallyToggled,
}: AutoManagedReminderEnabledInput): boolean | null {
  if (reminderWasManuallyToggled) return null

  if (dueTime) {
    return reminderEnabled ? null : true
  }

  if (scheduledReminderCount === 0) {
    return reminderEnabled ? false : null
  }

  return null
}

export function resolveHabitFormMode(habit: Pick<NormalizedHabit, 'isGeneral' | 'isFlexible' | 'frequencyUnit'>): HabitFormMode {
  if (habit.isGeneral) return 'general'
  if (habit.isFlexible) return 'flexible'
  if (habit.frequencyUnit) return 'recurring'
  return 'oneTime'
}

export function applyHabitFormMode(
  mode: HabitFormMode,
  actions: HabitFormModeActions,
): void {
  switch (mode) {
    case 'general':
      actions.setGeneral()
      return
    case 'flexible':
      actions.setFlexible()
      return
    case 'recurring':
      actions.setRecurring()
      return
    case 'oneTime':
      actions.setOneTime()
      return
  }
}

export function toggleSelectedId(
  selectedIds: readonly string[],
  id: string,
): string[] {
  const index = selectedIds.indexOf(id)
  if (index >= 0) {
    return selectedIds.filter((selectedId) => selectedId !== id)
  }

  return [...selectedIds, id]
}

export function buildParentHabitFormState(
  parent: NormalizedHabit,
  initialDate?: string | null,
): HabitFormStateSnapshot {
  const fallbackDate = initialDate ?? parent.dueDate ?? ''

  return {
    formValues: {
      title: '',
      description: '',
      icon: null,
      frequencyUnit: parent.frequencyUnit,
      frequencyQuantity: parent.frequencyQuantity,
      days: [...(parent.days ?? [])],
      isBadHabit: parent.isBadHabit,
      isGeneral: parent.isGeneral ?? false,
      isFlexible: parent.isFlexible ?? false,
      dueDate: parent.dueDate ?? fallbackDate,
      dueTime: parent.dueTime?.slice(0, 5) ?? '',
      dueEndTime: parent.dueEndTime?.slice(0, 5) ?? '',
      endDate: parent.endDate ?? '',
      reminderEnabled: parent.reminderEnabled ?? false,
      scheduledReminders: parent.scheduledReminders?.map((sr) => ({ ...sr })) ?? [],
      slipAlertEnabled: parent.slipAlertEnabled ?? false,
      checklistItems: [],
    },
    mode: resolveHabitFormMode(parent),
    reminderTimes: parent.reminderTimes?.length ? [...parent.reminderTimes] : [...DEFAULT_REMINDER_TIMES],
    selectedGoalIds: parent.linkedGoals?.map((goal) => goal.id) ?? [],
    selectedTagIds: parent.tags?.map((tag) => tag.id) ?? [],
  }
}

export function buildEditHabitFormState(
  habit: NormalizedHabit,
  detail?: HabitDetail | null,
): EditHabitFormStateSnapshot {
  return {
    formValues: {
      title: habit.title,
      description: habit.description ?? '',
      icon: detail?.icon ?? habit.icon ?? null,
      frequencyUnit: habit.frequencyUnit,
      frequencyQuantity: habit.frequencyQuantity,
      days: [...(habit.days ?? [])],
      isBadHabit: habit.isBadHabit,
      isGeneral: habit.isGeneral ?? false,
      isFlexible: habit.isFlexible ?? false,
      dueDate: detail?.dueDate ?? habit.dueDate ?? '',
      dueTime: detail?.dueTime?.slice(0, 5) ?? habit.dueTime?.slice(0, 5) ?? '',
      dueEndTime: detail?.dueEndTime?.slice(0, 5) ?? habit.dueEndTime?.slice(0, 5) ?? '',
      endDate: detail?.endDate ?? '',
      reminderEnabled: habit.reminderEnabled ?? false,
      scheduledReminders: habit.scheduledReminders?.map((sr) => ({ ...sr })) ?? [],
      slipAlertEnabled: habit.slipAlertEnabled ?? false,
      checklistItems: habit.checklistItems ? [...habit.checklistItems] : [],
    },
    mode: resolveHabitFormMode(habit),
    originalEndDate: detail?.endDate ?? '',
    reminderTimes: habit.reminderTimes?.length ? [...habit.reminderTimes] : [...DEFAULT_REMINDER_TIMES],
    selectedGoalIds: habit.linkedGoals?.map((goal) => goal.id) ?? [],
    selectedTagIds: habit.tags?.map((tag) => tag.id) ?? [],
  }
}
