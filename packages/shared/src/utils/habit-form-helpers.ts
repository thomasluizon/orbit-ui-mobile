import type { ChecklistItem, FrequencyUnit, HabitSetupSuggestion } from '../types/habit'
import type { HabitPhraseRead, HabitPhraseToken } from './habit-phrase-parser'
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
  mondayLong: string
  tuesdayLong: string
  wednesdayLong: string
  thursdayLong: string
  fridayLong: string
  saturdayLong: string
  sundayLong: string
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
    intervalWeeks: values.intervalWeeks ?? 1,
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
): HabitDayOption[] {
  const mondayFirst = [
    { value: 'Monday', label: translations.monday, accessibleLabel: translations.mondayLong },
    { value: 'Tuesday', label: translations.tuesday, accessibleLabel: translations.tuesdayLong },
    { value: 'Wednesday', label: translations.wednesday, accessibleLabel: translations.wednesdayLong },
    { value: 'Thursday', label: translations.thursday, accessibleLabel: translations.thursdayLong },
    { value: 'Friday', label: translations.friday, accessibleLabel: translations.fridayLong },
    { value: 'Saturday', label: translations.saturday, accessibleLabel: translations.saturdayLong },
    { value: 'Sunday', label: translations.sunday, accessibleLabel: translations.sundayLong },
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

export interface HabitDayOption {
  value: string
  label: string
  accessibleLabel: string
}

export interface HabitFormProposal {
  setup: boolean
  checklist: boolean
  subHabits: boolean
  checklistItems: number
  subHabitItems: number
}

export interface HabitFormSuggestionRevision {
  advance: () => number
  isCurrent: (revision: number) => boolean
}

export function createHabitFormSuggestionRevision(): HabitFormSuggestionRevision {
  let currentRevision = 0
  return {
    advance: () => {
      currentRevision += 1
      return currentRevision
    },
    isCurrent: (revision) => revision === currentRevision,
  }
}

export interface HabitFormCommonProps<FormHelpers, TagState, ChildNode> {
  formHelpers: FormHelpers
  tags: TagState
  selectedGoalIds: string[]
  atGoalLimit: boolean
  onToggleGoal: (goalId: string) => void
  reminderTimes: number[]
  onReminderTimesChange: (times: number[]) => void
  onReminderEnabledChange?: (nextEnabled: boolean) => void
  onSlipAlertEnabledChange?: (nextEnabled: boolean) => void
  onSuggestionContextChange?: () => void
  onResolveSubHabitProposalReady?: (resolve: () => void) => void
  defaultExpanded?: boolean
  lockedGeneral?: boolean | null
  expandAdvancedSignal?: number
  onSuggestSetup?: () => HabitFormProposal | null | Promise<HabitFormProposal | null>
  isSuggesting?: boolean
  readPhraseLocally?: boolean
  startDate?: string | null
  children?: ChildNode | ((proposedItems: number) => ChildNode)
}

export interface HabitUnderstandingLabels {
  field: string
  placeholder: string
  understood: string
  understoodAstra: string
  unresolved: string
  days: string
  less: string
  more: string
  count: (count: number) => string
  scheduleMode: string
  setDays: string
  timesAWeek: string
  repeat: (count: number) => string
  repeatLess: string
  repeatMore: string
  proposed: string
}

export interface HabitUnderstandingProps {
  value: string
  error?: string
  emoji: string
  days: string[]
  dayOptions: HabitDayOption[]
  quantity: number
  mode: 'fixed' | 'flexible'
  intervalWeeks: number
  sentence: string | null
  consumed: readonly HabitPhraseToken[]
  proposed?: boolean
  onValueChange: (value: string) => void
  onEmojiSelect: (emoji: string) => void
  onToggleDay: (day: string) => void
  onQuantityChange: (quantity: number) => void
  onModeChange: (mode: 'fixed' | 'flexible') => void
  onIntervalWeeksChange: (intervalWeeks: number) => void
  labels: HabitUnderstandingLabels
}

export const EMPTY_HABIT_FORM_PROPOSAL: HabitFormProposal = {
  setup: false,
  checklist: false,
  subHabits: false,
  checklistItems: 0,
  subHabitItems: 0,
}

export function hasHabitFormProposal(proposal: HabitFormProposal): boolean {
  return proposal.setup || proposal.checklist || proposal.subHabits
}

export function clearHabitFormProposalSection(
  proposal: HabitFormProposal,
  section: 'setup' | 'checklist' | 'subHabits',
): HabitFormProposal {
  if (!proposal[section]) return proposal
  if (section === 'checklist') return { ...proposal, checklist: false, checklistItems: 0 }
  if (section === 'subHabits') return { ...proposal, subHabits: false, subHabitItems: 0 }
  return { ...proposal, setup: false }
}

export function habitFeaturePlan(hasProAccess: boolean): 'pro' | 'free' {
  return hasProAccess ? 'pro' : 'free'
}

export async function requestHabitFormProposal(
  action: HabitFormCommonProps<unknown, unknown, unknown>['onSuggestSetup'],
  atLimit: boolean,
): Promise<HabitFormProposal | null> {
  if (!action || atLimit) return EMPTY_HABIT_FORM_PROPOSAL
  return action()
}

type PhraseField = 'days' | 'dueTime' | 'emoji' | 'frequencyQuantity' | 'frequencyUnit' | 'intervalWeeks'

export interface HabitPhraseFormTarget {
  setOneTime: () => void
  setRecurring: () => void
  setFlexible: () => void
  setGeneral: () => void
  setField: (field: PhraseField, value: string | number | string[]) => void
}

export interface HabitPhraseFormOwnership {
  cadence: boolean
  dueTime: boolean
}

export function releaseHabitPhraseOwnership(
  ownership: HabitPhraseFormOwnership,
  field: keyof HabitPhraseFormOwnership,
): HabitPhraseFormOwnership {
  return ownership[field] ? { ...ownership, [field]: false } : ownership
}

interface HabitCadenceCorrectionTarget {
  setRecurring: () => void
  setFlexible: () => void
  setGeneral: () => void
  setField: <Field extends 'frequencyQuantity' | 'frequencyUnit'>(
    field: Field,
    value: HabitFormData[Field],
  ) => void
}

type HabitControllerField =
  | PhraseField
  | 'checklistItems'
  | 'dueEndTime'
  | 'reminderEnabled'
  | 'slipAlertEnabled'
  | 'title'

interface HabitFormControllerTarget {
  setOneTime: () => void
  setRecurring: () => void
  setFlexible: () => void
  setGeneral: () => void
  getOwnership: () => HabitPhraseFormOwnership
  setOwnership: (ownership: HabitPhraseFormOwnership) => void
  updateProposal: (update: (proposal: HabitFormProposal) => HabitFormProposal) => void
  setField: <Field extends HabitControllerField>(field: Field, value: HabitFormData[Field], validate?: boolean) => void
  toggleDay: (day: string) => void
}

export interface HabitFormControllerOptions {
  action: HabitFormCommonProps<unknown, unknown, unknown>['onSuggestSetup']
  atLimit: boolean
  lockedGeneral: boolean | null
  onReminderEnabledChange?: (enabled: boolean) => void
  onSlipAlertEnabledChange?: (enabled: boolean) => void
  onSuggestionContextChange?: () => void
  target: HabitFormControllerTarget
}

export interface HabitFormController {
  askAstra: () => Promise<void>
  clearProposal: () => void
  resolveChecklistProposal: () => void
  resolveSetupProposal: () => void
  resolveSubHabitProposal: () => void
  releaseDueTime: () => void
  readPhrase: (enabled: boolean, read: HabitPhraseRead, emoji: string) => void
  setDueTime: (dueTime: string) => void
  clearDueTime: () => void
  setChecklistItems: (items: ChecklistItem[]) => void
  setReminderEnabled: (enabled: boolean) => void
  setSlipAlertEnabled: (enabled: boolean) => void
  setTitle: (title: string) => void
  setEmoji: (emoji: string) => void
  setScheduleMode: (mode: 'fixed' | 'flexible') => void
  setIntervalWeeks: (intervalWeeks: number) => void
  toggleDay: (day: string) => void
  setQuantity: (quantity: number) => void
}

export function createHabitFormController({
  action,
  atLimit,
  lockedGeneral,
  onReminderEnabledChange,
  onSlipAlertEnabledChange,
  onSuggestionContextChange,
  target,
}: HabitFormControllerOptions): HabitFormController {
  const resolveSection = (section: 'setup' | 'checklist' | 'subHabits') => {
    target.updateProposal((proposal) => clearHabitFormProposalSection(proposal, section))
  }
  const releaseOwnership = (field: keyof HabitPhraseFormOwnership) => {
    target.setOwnership(releaseHabitPhraseOwnership(target.getOwnership(), field))
  }

  return {
    askAstra: async (): Promise<void> => {
      const proposal = await requestHabitFormProposal(action, atLimit)
      if (!proposal) return
      if (proposal.setup) target.setOwnership({ cadence: false, dueTime: false })
      target.updateProposal(() => proposal)
    },
    clearProposal: (): void => target.updateProposal(() => EMPTY_HABIT_FORM_PROPOSAL),
    resolveChecklistProposal: (): void => resolveSection('checklist'),
    resolveSetupProposal: (): void => resolveSection('setup'),
    resolveSubHabitProposal: (): void => resolveSection('subHabits'),
    releaseDueTime: (): void => releaseOwnership('dueTime'),
    readPhrase: (enabled: boolean, read: HabitPhraseRead, emoji: string): void => {
      target.setOwnership(applyHabitPhraseRead(
        enabled,
        read,
        emoji,
        lockedGeneral,
        target.getOwnership(),
        target,
      ))
    },
    setDueTime: (dueTime: string): void => {
      releaseOwnership('dueTime')
      target.setField('dueTime', dueTime)
      target.setField('dueEndTime', '')
    },
    clearDueTime: (): void => {
      releaseOwnership('dueTime')
      target.setField('dueTime', '')
      target.setField('dueEndTime', '')
    },
    setChecklistItems: (items: ChecklistItem[]): void => {
      resolveSection('checklist')
      target.setField('checklistItems', items)
    },
    setReminderEnabled: (enabled: boolean): void => {
      if (onReminderEnabledChange) onReminderEnabledChange(enabled)
      else target.setField('reminderEnabled', enabled)
    },
    setSlipAlertEnabled: (enabled: boolean): void => {
      if (onSlipAlertEnabledChange) onSlipAlertEnabledChange(enabled)
      else target.setField('slipAlertEnabled', enabled)
    },
    setTitle: (title: string): void => {
      onSuggestionContextChange?.()
      target.updateProposal(() => EMPTY_HABIT_FORM_PROPOSAL)
      target.setField('title', title, true)
    },
    setEmoji: (emoji: string): void => {
      resolveSection('setup')
      target.setField('emoji', emoji)
    },
    toggleDay: (day: string): void => {
      resolveSection('setup')
      releaseOwnership('cadence')
      if (applyHabitDayCorrection(lockedGeneral, target)) target.toggleDay(day)
    },
    setQuantity: (quantity: number): void => {
      resolveSection('setup')
      releaseOwnership('cadence')
      applyHabitQuantityCorrection(quantity, lockedGeneral, target)
    },
    setScheduleMode: (mode): void => {
      resolveSection('setup')
      releaseOwnership('cadence')
      if (mode === 'flexible') {
        applyHabitQuantityCorrection(3, lockedGeneral, target)
        return
      }
      applyHabitDayCorrection(lockedGeneral, target)
      target.setField('days', [])
    },
    setIntervalWeeks: (intervalWeeks): void => {
      resolveSection('setup')
      target.setField('intervalWeeks', intervalWeeks)
    },
  }
}

export function applyHabitDayCorrection(
  lockedGeneral: boolean | null,
  target: HabitCadenceCorrectionTarget,
): boolean {
  if (lockedGeneral === true) {
    target.setGeneral()
    return false
  }
  target.setRecurring()
  target.setField('frequencyUnit', 'Day')
  target.setField('frequencyQuantity', 1)
  return true
}

export function applyHabitQuantityCorrection(
  quantity: number,
  lockedGeneral: boolean | null,
  target: HabitCadenceCorrectionTarget,
): boolean {
  if (lockedGeneral === true) {
    target.setGeneral()
    return false
  }
  target.setFlexible()
  target.setField('frequencyUnit', 'Week')
  target.setField('frequencyQuantity', quantity)
  return true
}

export function applyHabitPhraseRead(
  enabled: boolean,
  read: HabitPhraseRead,
  emoji: string,
  lockedGeneral: boolean | null,
  ownership: HabitPhraseFormOwnership,
  target: HabitPhraseFormTarget,
): HabitPhraseFormOwnership {
  if (!enabled) return ownership
  if (lockedGeneral === true) {
    target.setGeneral()
    return { cadence: true, dueTime: true }
  }

  const nextOwnership = { ...ownership }
  if (read.dueTime) {
    target.setField('dueTime', read.dueTime)
    nextOwnership.dueTime = true
  } else if (ownership.dueTime) {
    target.setField('dueTime', '')
  }
  if (read.emoji && !emoji) target.setField('emoji', read.emoji)
  if (read.cadence) target.setField('intervalWeeks', read.intervalWeeks ?? 1)
  if (!read.cadence) {
    if (ownership.cadence) target.setOneTime()
    return nextOwnership
  }
  nextOwnership.cadence = true
  if (read.cadence === 'flexible') {
    target.setFlexible()
    target.setField('frequencyUnit', 'Week')
    target.setField('frequencyQuantity', read.frequencyQuantity!)
    target.setField('days', [])
    return nextOwnership
  }

  target.setRecurring()
  target.setField('frequencyUnit', 'Day')
  target.setField('frequencyQuantity', 1)
  target.setField('days', read.cadence === 'daily'
    ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    : read.days)
  return nextOwnership
}

type UnderstandingTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string

export function buildHabitUnderstandingLabels(
  translate: UnderstandingTranslator,
): HabitUnderstandingLabels {
  return {
    field: translate('habits.form.describe'),
    placeholder: translate('habits.form.describePlaceholder'),
    understood: translate('habits.form.understood'),
    understoodAstra: translate('habits.form.understoodAstra'),
    unresolved: translate('habits.form.unresolved'),
    days: translate('habits.form.activeDays'),
    less: translate('habits.form.lessOften'),
    more: translate('habits.form.moreOften'),
    count: (count) => translate('habits.form.timesAWeekCount', { count }),
    scheduleMode: translate('habits.form.scheduleMode'),
    setDays: translate('habits.form.setDays'),
    timesAWeek: translate('habits.form.timesAWeek'),
    repeat: (count) => translate('habits.form.repeatWeeks', { count }),
    repeatLess: translate('habits.form.repeatLess'),
    repeatMore: translate('habits.form.repeatMore'),
    proposed: translate('habits.form.proposedByAstra'),
  }
}

export function buildHabitAstraFallbackCopy(
  translate: UnderstandingTranslator,
  allowance: number,
): {
  unresolved: string
  limitMessage: string
  readingLabel: string
  askLabel: string
  costLabel: string
} {
  return {
    unresolved: translate('habits.form.unresolved'),
    limitMessage: translate('habits.form.localReadLimit', { allowance }),
    readingLabel: translate('habits.form.astraReading'),
    askLabel: translate('habits.form.askAstra'),
    costLabel: translate('habits.form.askAstraCost', { allowance }),
  }
}

function getHabitRecurringIntervalUnderstandingKey(
  frequencyUnit: FrequencyUnit | null | undefined,
  quantity: number,
): string | null {
  if (frequencyUnit === 'Month') {
    return quantity === 1 ? 'habits.form.understoodEveryMonth' : 'habits.form.understoodEveryNMonths'
  }
  if (frequencyUnit === 'Year') {
    return quantity === 1 ? 'habits.form.understoodEveryYear' : 'habits.form.understoodEveryNYears'
  }
  return null
}

function getHabitFlexibleIntervalUnderstandingKey(
  frequencyUnit: FrequencyUnit | null | undefined,
  quantity: number,
): string | null {
  if (frequencyUnit === 'Month') {
    return quantity === 1 ? 'habits.form.understoodMonthOnce' : 'habits.form.understoodMonth'
  }
  if (frequencyUnit === 'Year') {
    return quantity === 1 ? 'habits.form.understoodYearOnce' : 'habits.form.understoodYear'
  }
  return null
}

export function buildHabitUnderstandingSentence(
  days: string[],
  dayOptions: { value: string; label: string }[],
  isFlexible: boolean,
  frequencyUnit: FrequencyUnit | null | undefined,
  quantity: number,
  dueTime: string,
  locale: string,
  translate: UnderstandingTranslator,
  intervalWeeks = 1,
): string | null {
  let key: string
  let values: Record<string, string | number> = {}
  const intervalKey = isFlexible
    ? getHabitFlexibleIntervalUnderstandingKey(frequencyUnit, quantity)
    : getHabitRecurringIntervalUnderstandingKey(frequencyUnit, quantity)
  if (days.length > 0) {
    const labels = dayOptions.filter((day) => days.includes(day.value)).map((day) => day.label)
    const listLocale = locale === 'en' ? 'en-GB' : locale
    key = labels.length === 1 ? 'habits.form.understoodDay' : 'habits.form.understoodDays'
    values.days = new Intl.ListFormat(listLocale, {
      style: 'long',
      type: 'conjunction',
    }).format(labels)
  } else if (!isFlexible && frequencyUnit === 'Day' && quantity === 1) {
    key = 'habits.form.understoodDaily'
  } else if (intervalKey) {
    key = intervalKey
    values.count = quantity
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
  const sentence = translate(key, values)
  return intervalWeeks > 1
    ? `${sentence}, ${translate('habits.form.repeatWeeks', { count: intervalWeeks }).toLocaleLowerCase(locale)}`
    : sentence
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
