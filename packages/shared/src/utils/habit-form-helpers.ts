import type { ChecklistItem, FrequencyUnit, HabitSetupSuggestion } from '../types/habit'
import type { HabitPhraseRead } from './habit-phrase-parser'
import type { HabitFormData } from '../validation/habit-form'
import {
  validateGoalSelection,
  validateHabitForm,
  validateReminderSelection,
  validateSubHabits,
  validateTagSelection,
} from '../validation/habit-form'

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
    emoji: values.emoji ?? '',
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

export interface HabitFormSuggestionPatch {
  mode: 'oneTime' | 'recurring' | 'flexible'
  emoji: string | null
  frequencyUnit: FrequencyUnit | null
  frequencyQuantity: number | null
  days: string[]
  dueTime: string | null
  subHabitTitles: string[]
  checklistItems: ChecklistItem[]
}

export interface HabitFormProposal {
  setup: boolean
  checklist: boolean
  subHabits: boolean
}

export const EMPTY_HABIT_FORM_PROPOSAL: HabitFormProposal = {
  setup: false,
  checklist: false,
  subHabits: false,
}

export function hasHabitFormProposal(proposal: HabitFormProposal): boolean {
  return proposal.setup || proposal.checklist || proposal.subHabits
}

type PhraseField = 'days' | 'dueTime' | 'emoji' | 'frequencyQuantity' | 'frequencyUnit'

interface HabitPhraseFormTarget {
  setOneTime: () => void
  setRecurring: () => void
  setFlexible: () => void
  setGeneral: () => void
  setField: (field: PhraseField, value: string | number | string[]) => void
}

export function applyHabitPhraseRead(
  enabled: boolean,
  read: HabitPhraseRead,
  emoji: string,
  lockedGeneral: boolean | null,
  target: HabitPhraseFormTarget,
): void {
  if (!enabled) return
  if (lockedGeneral === true) {
    target.setGeneral()
    return
  }

  target.setField('dueTime', read.dueTime ?? '')
  if (read.emoji && !emoji) target.setField('emoji', read.emoji)
  if (!read.cadence) {
    target.setOneTime()
    return
  }
  if (read.cadence === 'flexible') {
    target.setFlexible()
    target.setField('frequencyUnit', 'Week')
    target.setField('frequencyQuantity', read.frequencyQuantity!)
    target.setField('days', [])
    return
  }

  target.setRecurring()
  target.setField('frequencyUnit', 'Day')
  target.setField('frequencyQuantity', 1)
  target.setField('days', read.days)
}

type UnderstandingTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string

export function buildHabitUnderstandingSentence(
  days: string[],
  dayOptions: { value: string; label: string }[],
  isFlexible: boolean,
  frequencyUnit: FrequencyUnit | null | undefined,
  quantity: number,
  dueTime: string,
  translate: UnderstandingTranslator,
): string | null {
  let key: string
  let values: Record<string, string | number> = {}
  if (days.length > 0) {
    key = 'habits.form.understoodDays'
    values.days = dayOptions.filter((day) => days.includes(day.value)).map((day) => day.label).join(', ')
  } else if (!isFlexible && frequencyUnit === 'Day' && quantity === 1) {
    key = 'habits.form.understoodDaily'
  } else if (isFlexible || frequencyUnit) {
    key = 'habits.form.understoodCount'
    values.count = quantity
  } else if (dueTime) {
    return translate('habits.form.understoodTime', { time: dueTime })
  } else {
    return null
  }

  if (dueTime) {
    values = { ...values, time: dueTime }
    key = `${key}At`
  }
  return translate(key, values)
}

export function shouldShowHabitAstraFallback(
  title: string,
  sentence: string | null,
  action: unknown,
  proposal: HabitFormProposal,
): boolean {
  return title.trim().length > 0 && sentence === null && typeof action === 'function' && !hasHabitFormProposal(proposal)
}

export function isHabitAstraLimitReached(used: number, allowance: number): boolean {
  return used >= allowance
}

export function resolveHabitStartDate(
  startDate: string | null | undefined,
  dueDate: string,
): string | null {
  return startDate === undefined ? dueDate : startDate
}

export function formatHabitReminderLabel(
  minutes: number,
  translate: (key: string) => string,
): string {
  const preset = HABIT_REMINDER_PRESETS.find((item) => item.value === minutes)
  if (preset) return translate(preset.key)
  if (minutes < 60) return `${minutes} ${translate('habits.form.reminderMinutes')}`
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60)
    return `${hours} ${translate(hours === 1 ? 'habits.form.reminderHour' : 'habits.form.reminderHours')}`
  }
  const days = Math.floor(minutes / 1440)
  return `${days} ${translate(days === 1 ? 'habits.form.reminderDay' : 'habits.form.reminderDays')}`
}

/**
 * Translates an AI habit-setup suggestion into a platform-agnostic patch for the create-habit form.
 * Decides flexible vs recurring vs one-time from the suggestion; for a flexible cadence the form
 * quantity is the per-period target (`flexibleTarget`), since the suggestion's own quantity is the
 * interval. Keeps suggested weekdays only for a daily (Day, quantity 1) schedule, carries the due
 * time, surfaces the sub-habit titles, and maps the checklist strings to unchecked checklist items
 * (distinct from sub-habits). The per-app caller applies this to its form state.
 */
export function buildHabitFormPatchFromSuggestion(
  suggestion: HabitSetupSuggestion,
): HabitFormSuggestionPatch {
  const checklistItems: ChecklistItem[] = suggestion.checklistItems.map((text) => ({
    text,
    isChecked: false,
  }))

  if (suggestion.isFlexible) {
    return {
      mode: 'flexible',
      emoji: suggestion.emoji,
      frequencyUnit: suggestion.frequencyUnit,
      frequencyQuantity: suggestion.flexibleTarget ?? 1,
      days: [],
      dueTime: suggestion.dueTime,
      subHabitTitles: suggestion.subHabits,
      checklistItems,
    }
  }

  const isRecurring = suggestion.frequencyUnit !== null
  const frequencyQuantity = isRecurring ? (suggestion.frequencyQuantity ?? 1) : null
  const keepsDays =
    isRecurring && suggestion.frequencyUnit === 'Day' && frequencyQuantity === 1

  return {
    mode: isRecurring ? 'recurring' : 'oneTime',
    emoji: suggestion.emoji,
    frequencyUnit: suggestion.frequencyUnit,
    frequencyQuantity,
    days: keepsDays ? suggestion.days : [],
    dueTime: suggestion.dueTime,
    subHabitTitles: suggestion.subHabits,
    checklistItems,
  }
}

/**
 * Coalesces a react-hook-form text field to an empty string. `watch` / `useWatch`
 * / `getValues` type a required string field (e.g. the habit title) as `string`,
 * but return `undefined` before RHF applies `defaultValues`, so callers pass the
 * `string`-typed read into this honest `string | undefined` boundary rather than
 * guarding a value the type claims is always present.
 * https://github.com/thomasluizon/orbit-ui-mobile/issues/424
 */
export function coalesceFormText(value: string | undefined): string {
  return value ?? ''
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
