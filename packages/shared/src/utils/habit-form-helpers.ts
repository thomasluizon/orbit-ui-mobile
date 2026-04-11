import type { FrequencyUnit } from '../types/habit'
import type { HabitFormData } from '../validation'
import {
  validateGoalSelection,
  validateHabitForm,
  validateReminderSelection,
  validateSubHabits,
  validateTagSelection,
} from '../validation'

export interface HabitFormTranslationAdapter {
  monday: string
  tuesday: string
  wednesday: string
  thursday: string
  friday: string
  saturday: string
  sunday: string
  unitDay: string
  unitWeek: string
  unitMonth: string
  unitYear: string
}

export interface HabitFormValidationContext {
  reminderTimes?: number[]
  selectedGoalIds?: string[]
  selectedTagIds?: string[]
  subHabits?: string[]
}

export const HABIT_REMINDER_PRESETS = [
  { value: 0, key: 'habits.form.reminderAtTime' },
  { value: 5, key: 'habits.form.reminder5min' },
  { value: 10, key: 'habits.form.reminder10min' },
  { value: 15, key: 'habits.form.reminder15min' },
  { value: 30, key: 'habits.form.reminder30min' },
  { value: 60, key: 'habits.form.reminder1hour' },
  { value: 120, key: 'habits.form.reminder2hours' },
  { value: 360, key: 'habits.form.reminder6hours' },
  { value: 720, key: 'habits.form.reminder12hours' },
  { value: 1440, key: 'habits.form.reminder1day' },
] as const

export function normalizeHabitFormData(values: Partial<HabitFormData>): HabitFormData {
  return {
    title: values.title ?? '',
    description: values.description ?? '',
    frequencyUnit: values.frequencyUnit ?? null,
    frequencyQuantity: values.frequencyQuantity ?? null,
    days: values.days ?? [],
    isBadHabit: values.isBadHabit ?? false,
    isGeneral: values.isGeneral ?? false,
    isFlexible: values.isFlexible ?? false,
    dueDate: values.dueDate ?? '',
    dueTime: values.dueTime ?? '',
    dueEndTime: values.dueEndTime ?? '',
    endDate: values.endDate ?? '',
    reminderEnabled: values.reminderEnabled ?? false,
    scheduledReminders: values.scheduledReminders ?? [],
    slipAlertEnabled: values.slipAlertEnabled ?? false,
    checklistItems: values.checklistItems ?? [],
    icon: values.icon ?? '',
    color: values.color ?? '',
  }
}

export function getHabitFormFlags(values: HabitFormData) {
  const isGeneral = values.isGeneral
  const isFlexible = values.isFlexible
  const frequencyUnit = values.frequencyUnit
  const frequencyQuantity = values.frequencyQuantity
  const isOneTime = !frequencyUnit && !isGeneral && !isFlexible
  const isRecurring = !!frequencyUnit && !isGeneral && !isFlexible
  const showDayPicker = !isFlexible && frequencyUnit === 'Day' && frequencyQuantity === 1
  const showEndDate = !!frequencyUnit && !isGeneral

  return {
    isOneTime,
    isGeneral,
    isFlexible,
    isRecurring,
    showDayPicker,
    showEndDate,
  }
}

export function buildHabitDaysList(
  translations: HabitFormTranslationAdapter,
  weekStartDay = 1,
): Array<{ value: string; label: string }> {
  const mondayFirst = [
    { value: 'Monday', label: translations.monday },
    { value: 'Tuesday', label: translations.tuesday },
    { value: 'Wednesday', label: translations.wednesday },
    { value: 'Thursday', label: translations.thursday },
    { value: 'Friday', label: translations.friday },
    { value: 'Saturday', label: translations.saturday },
    { value: 'Sunday', label: translations.sunday },
  ]

  if (weekStartDay === 0) {
    return [mondayFirst[6]!, ...mondayFirst.slice(0, 6)]
  }

  return mondayFirst
}

export function buildHabitFrequencyUnits(
  translations: Pick<HabitFormTranslationAdapter, 'unitDay' | 'unitWeek' | 'unitMonth' | 'unitYear'>,
): Array<{ value: FrequencyUnit; label: string }> {
  return [
    { value: 'Day', label: translations.unitDay },
    { value: 'Week', label: translations.unitWeek },
    { value: 'Month', label: translations.unitMonth },
    { value: 'Year', label: translations.unitYear },
  ]
}

export function formatHabitTimeInput(value: string): string {
  let nextValue = value.replaceAll(/\D/g, '')
  if (nextValue.length > 4) nextValue = nextValue.slice(0, 4)
  if (nextValue.length >= 3) nextValue = nextValue.slice(0, 2) + ':' + nextValue.slice(2)
  return nextValue
}

export function isValidHabitTimeInput(time: string): boolean {
  if (!time) return true
  if (time.length !== 5) return false
  const [hStr, mStr] = time.split(':')
  const hours = Number.parseInt(hStr ?? '', 10)
  const minutes = Number.parseInt(mStr ?? '', 10)
  return (
    !Number.isNaN(hours) &&
    !Number.isNaN(minutes) &&
    hours >= 0 &&
    hours <= 23 &&
    minutes >= 0 &&
    minutes <= 59
  )
}

export function validateHabitFormInput(
  values: Partial<HabitFormData>,
  context: HabitFormValidationContext = {},
): string | null {
  const normalizedValues = normalizeHabitFormData(values)

  const habitError = validateHabitForm(normalizedValues)
  if (habitError) return habitError

  const reminderError = validateReminderSelection(
    normalizedValues.reminderEnabled,
    normalizedValues.dueTime,
    context.reminderTimes ?? [],
    normalizedValues.scheduledReminders,
  )
  if (reminderError) return reminderError

  const goalError = validateGoalSelection(context.selectedGoalIds ?? [])
  if (goalError) return goalError

  const tagError = validateTagSelection(context.selectedTagIds ?? [])
  if (tagError) return tagError

  const subHabitError = validateSubHabits(context.subHabits ?? [])
  if (subHabitError) return subHabitError

  return null
}
