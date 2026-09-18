import type { CreateHabitRequest, FrequencyUnit, HabitSetupSuggestion } from '../types/habit'
import type { SupportedLocale } from '../types/profile'
import { buildHabitFormPatchFromSuggestion } from './habit-form-helpers'
import { readHabitPhrase } from './habit-phrase-parser'

export const ONBOARDING_TOTAL_STEPS = 3
export const ONBOARDING_WHAT_STEP = 0
export const ONBOARDING_WHEN_STEP = 1
export const ONBOARDING_REMIND_STEP = 2
export const ONBOARDING_DONE_STEP = 3
export const ONBOARDING_STARTERS = ['water', 'walk', 'read', 'tidy'] as const
export const ONBOARDING_REMINDER_MINUTES = 15
export function shouldRequestOnboardingSuggestion(input: { isLive: boolean; atLimit: boolean }): boolean {
  return input.isLive && !input.atLimit
}

export function getOnboardingDisplayTotal(): number {
  return ONBOARDING_TOTAL_STEPS
}

export function getOnboardingDisplayStep(currentStep: number): number {
  return Math.min(Math.max(currentStep + 1, 1), ONBOARDING_TOTAL_STEPS)
}

export function getOnboardingNextStep(currentStep: number): number {
  if (currentStep >= ONBOARDING_DONE_STEP) {
    return ONBOARDING_DONE_STEP
  }

  return currentStep + 1
}

export function getOnboardingPreviousStep(currentStep: number): number {
  if (currentStep <= 0) {
    return 0
  }

  return currentStep - 1
}

export function shouldHideOnboardingFooter(currentStep: number): boolean {
  return currentStep === ONBOARDING_DONE_STEP
}

export function getOnboardingHabitTitle(sentence: string, locale: SupportedLocale): string {
  const read = readHabitPhrase(sentence, locale)
  if (read.consumed.length === 0) return sentence.trim()

  const characters = sentence.split('')
  const removed = Array.from({ length: characters.length }, () => false)
  for (const token of read.consumed) {
    characters.fill(' ', token.start, token.end)
    removed.fill(true, token.start, token.end)
  }

  const glue = locale === 'pt-BR'
    ? /\b(?:toda|todo|todas|todos|as|os|e|por|na|no|nas|nos|a|em|cada)\b/giu
    : /\b(?:every|each|and|a|per|at|on|times?|week)\b/giu
  const removable = [...sentence.matchAll(glue)]
  const touchesRemoved = (start: number, direction: -1 | 1): boolean => {
    for (let index = start; index >= 0 && index < characters.length; index += direction) {
      if (removed[index]) return true
      if (!/[\s,;]/u.test(characters[index]!)) return false
    }
    return false
  }
  let changed = true
  while (changed) {
    changed = false
    for (const match of removable) {
      const start = match.index
      const end = start + match[0].length
      if (removed.slice(start, end).every(Boolean)) continue
      if (touchesRemoved(start - 1, -1) || touchesRemoved(end, 1)) {
        characters.fill(' ', start, end)
        removed.fill(true, start, end)
        changed = true
      }
    }
  }
  const title = characters.join('').replaceAll(/[\s,;]+/gu, ' ').trim()
  return title || sentence.trim()
}

export interface OnboardingSchedule {
  frequencyUnit: FrequencyUnit | null
  frequencyQuantity: number | null
  intervalWeeks: number
  days: string[]
  isGeneral: boolean
  isFlexible: boolean
  dueTime: string
}

export type OnboardingScheduleMode = 'fixed' | 'flexible' | 'interval' | 'oneTime'

export function getOnboardingScheduleMode(schedule: OnboardingSchedule): OnboardingScheduleMode {
  if (schedule.isFlexible) return 'flexible'
  if (schedule.frequencyUnit === null) return schedule.isGeneral ? 'fixed' : 'oneTime'
  if (schedule.days.length > 0 || (schedule.frequencyUnit === 'Day' && schedule.frequencyQuantity === 1)) return 'fixed'
  return 'interval'
}

function scheduleShapeCarriesRepeatWeeks(schedule: OnboardingSchedule): boolean {
  return schedule.days.length > 0 && getOnboardingScheduleMode(schedule) === 'fixed'
}

/**
 * Whether this run can show and save a repeat interval of more than one week. Two conditions, and
 * both have to hold. The shape has to carry it: only a weekday schedule does, because the API reads
 * `IntervalWeeks` for a habit with weekdays and ignores it for a general habit. The transport has to
 * carry it too: a signed-out draft flushes through `POST /api/profile/onboarding/apply`, whose
 * `ApplyHabitInput` has no `IntervalWeeks` field (see `applyOnboardingHabitSchema`), so the server
 * drops the number and the habit comes back as "every Monday". Ticket #596 adds the field to the
 * API; until it deploys, a signed-out run hides the stepper rather than write nothing.
 */
export function canRepeatOnboardingScheduleWeeks(
  schedule: OnboardingSchedule,
  canSaveRepeatWeeks: boolean,
): boolean {
  return canSaveRepeatWeeks && scheduleShapeCarriesRepeatWeeks(schedule)
}

/**
 * Pins the repeat interval to one week whenever {@link canRepeatOnboardingScheduleWeeks} is false,
 * so no screen shows and no request sends a number the saved habit drops.
 */
export function clampOnboardingRepeatWeeks(
  schedule: OnboardingSchedule,
  canSaveRepeatWeeks: boolean,
): OnboardingSchedule {
  if (canRepeatOnboardingScheduleWeeks(schedule, canSaveRepeatWeeks)) return schedule
  return schedule.intervalWeeks === 1 ? schedule : { ...schedule, intervalWeeks: 1 }
}

function pinRepeatInterval(schedule: OnboardingSchedule): OnboardingSchedule {
  return clampOnboardingRepeatWeeks(schedule, true)
}

export function toggleOnboardingScheduleDay(
  schedule: OnboardingSchedule,
  day: string,
): OnboardingSchedule {
  const days = schedule.days.includes(day)
    ? schedule.days.filter((value) => value !== day)
    : [...schedule.days, day]
  return pinRepeatInterval({
    ...schedule,
    days,
    frequencyUnit: days.length > 0 ? 'Day' : null,
    frequencyQuantity: days.length > 0 ? 1 : null,
    isGeneral: days.length === 0,
    isFlexible: false,
  })
}

export function changeOnboardingScheduleMode(
  schedule: OnboardingSchedule,
  mode: OnboardingScheduleMode,
): OnboardingSchedule {
  if (mode === 'oneTime') {
    return { ...schedule, frequencyUnit: null, frequencyQuantity: null, intervalWeeks: 1, days: [], isGeneral: false, isFlexible: false }
  }
  if (mode === 'flexible') {
    return { ...schedule, frequencyUnit: 'Week', frequencyQuantity: schedule.isFlexible ? schedule.frequencyQuantity ?? 3 : 3, intervalWeeks: 1, days: [], isGeneral: false, isFlexible: true }
  }
  if (mode === 'interval') {
    const alreadyInterval = schedule.frequencyUnit !== null && schedule.days.length === 0 && !schedule.isFlexible && !(schedule.frequencyUnit === 'Day' && schedule.frequencyQuantity === 1)
    return { ...schedule, frequencyUnit: alreadyInterval ? schedule.frequencyUnit : 'Week', frequencyQuantity: alreadyInterval ? schedule.frequencyQuantity ?? 1 : 2, intervalWeeks: 1, days: [], isGeneral: false, isFlexible: false }
  }
  const isGeneral = schedule.days.length === 0
  return pinRepeatInterval({ ...schedule, frequencyUnit: isGeneral ? null : 'Day', frequencyQuantity: isGeneral ? null : 1, isGeneral, isFlexible: false })
}

const EVERY_DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const WEEKDAY_BY_INDEX = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * Whether the habit onboarding just created lands in today's list. A general habit never does:
 * `GetHabitScheduleQuery` loads the day with `!h.IsGeneral` and appends general habits only when
 * `IncludeGeneral` is set, and both clients default that preference to false, so a new account never
 * sees one on Today. A weekday habit lands there only on a day it names, because the API moves its
 * `DueDate` forward to the first matching weekday (`CreateHabitCommand.HandleLockedAsync`) and then
 * reports every earlier date as not scheduled (`HabitScheduleService.IsHabitDueOnDate`, `if (target
 * < anchor) return false`). A signed-out draft flushes through
 * `ApplyOnboardingCommand.CreateHabitsAsync`, which anchors on today rather than advancing, and the
 * same absence falls out of `HabitScheduleService.MatchesFrequency` rejecting a target whose weekday
 * is not in `habit.Days`. Every other shape anchors on today and matches it.
 */
export function isOnboardingHabitDueToday(schedule: OnboardingSchedule, today: Date): boolean {
  if (schedule.isGeneral) return false
  if (schedule.days.length === 0) return true
  return schedule.days.includes(WEEKDAY_BY_INDEX[today.getDay()]!)
}

/**
 * Reads a typed sentence into the schedule the when screen shows. A bare "every 2 weeks" becomes the
 * week unit with quantity 2, not `intervalWeeks`, because the interval stepper binds the quantity and
 * the API fires a weekly habit on every `frequencyQuantity`-th week. `intervalWeeks` stays 1 unless
 * the sentence also names weekdays, the one shape that shows and corrects it.
 */
export function buildOnboardingScheduleFromPhrase(
  sentence: string,
  locale: SupportedLocale,
): OnboardingSchedule {
  const read = readHabitPhrase(sentence, locale)
  if (read.cadence === 'flexible') {
    return {
      frequencyUnit: 'Week', frequencyQuantity: read.frequencyQuantity ?? 1,
      intervalWeeks: 1, days: [], isGeneral: false, isFlexible: true, dueTime: read.dueTime ?? '',
    }
  }
  if (read.cadence === 'fixed' || read.cadence === 'daily') {
    return {
      frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: read.intervalWeeks ?? 1,
      days: read.cadence === 'daily' ? EVERY_DAY : read.days,
      isGeneral: false, isFlexible: false, dueTime: read.dueTime ?? '',
    }
  }
  if (read.intervalWeeks) {
    return {
      frequencyUnit: 'Week', frequencyQuantity: read.intervalWeeks, intervalWeeks: 1,
      days: [], isGeneral: false, isFlexible: false, dueTime: read.dueTime ?? '',
    }
  }
  return {
    frequencyUnit: null, frequencyQuantity: null, intervalWeeks: 1,
    days: [], isGeneral: true, isFlexible: false, dueTime: read.dueTime ?? '',
  }
}

/**
 * Reads an Astra proposal into the schedule the when screen shows. The suggestion is an LLM response,
 * so a flexible one may arrive with no period at all; both screens read a flexible period as the week,
 * and so does {@link changeOnboardingScheduleMode}, so this boundary settles it rather than sending a
 * flexible habit with no unit, which the API never makes due.
 */
export function buildOnboardingScheduleFromSuggestion(
  suggestion: HabitSetupSuggestion,
): OnboardingSchedule {
  const patch = buildHabitFormPatchFromSuggestion(suggestion)
  const isFlexible = patch.mode === 'flexible'
  return {
    frequencyUnit: isFlexible ? patch.frequencyUnit ?? 'Week' : patch.frequencyUnit,
    frequencyQuantity: patch.frequencyQuantity,
    intervalWeeks: 1,
    days: patch.days,
    isGeneral: false,
    isFlexible,
    dueTime: patch.dueTime ?? '',
  }
}

export function buildOnboardingHabitInput(input: {
  sentence: string
  locale: SupportedLocale
  emoji: string
  reminderEnabled: boolean
  schedule: OnboardingSchedule
}): CreateHabitRequest {
  const { schedule } = input
  const reminderEnabled = input.reminderEnabled && Boolean(schedule.dueTime)
  return {
    title: getOnboardingHabitTitle(input.sentence, input.locale),
    emoji: input.emoji || null,
    ...(!schedule.isGeneral && schedule.frequencyUnit ? { frequencyUnit: schedule.frequencyUnit } : {}),
    ...(!schedule.isGeneral && schedule.frequencyQuantity ? { frequencyQuantity: schedule.frequencyQuantity } : {}),
    intervalWeeks: schedule.intervalWeeks,
    ...(schedule.days.length > 0 ? { days: schedule.days } : {}),
    ...(schedule.isGeneral ? { isGeneral: true } : {}),
    ...(schedule.isFlexible ? { isFlexible: true } : {}),
    ...(schedule.dueTime ? { dueTime: schedule.dueTime } : {}),
    reminderEnabled,
    reminderTimes: reminderEnabled ? [ONBOARDING_REMINDER_MINUTES] : [],
  }
}

export interface OnboardingCompleteState {
  skipped: boolean
  signedOut: boolean
  remindersOff: boolean
  dueToday: boolean
  general: boolean
}

export interface OnboardingCompleteCopy {
  titleKey: string
  bodyKey: string
  pendingKey: string
  actionKey: string
}

function getOnboardingCompleteBodyKey(state: OnboardingCompleteState): string {
  if (state.skipped) return state.signedOut ? 'skippedSignedOutBody' : 'skippedBody'
  if (state.signedOut) return 'signedOutBody'
  if (state.general) return 'generalBody'
  if (!state.dueToday) return state.remindersOff ? 'notTodayRemindersOffBody' : 'notTodayBody'
  return state.remindersOff ? 'remindersOffBody' : 'body'
}

function getOnboardingCompleteTitleKey(state: OnboardingCompleteState): string {
  if (state.skipped) return state.signedOut ? 'skippedSignedOutTitle' : 'skippedTitle'
  if (state.signedOut) return 'signedOutTitle'
  if (state.general) return 'generalTitle'
  return state.dueToday ? 'title' : 'notTodayTitle'
}

/**
 * Which `onboarding.flow.done` strings the last screen may truthfully show, button included, so the
 * copy can never name a destination the button does not go to. The order of the four states is what
 * keeps every sentence true.
 *
 * Skip outranks everything, because a run can only skip before a habit exists, so a skipped run has
 * no plan to report; a skipped signed-out run then takes its own pair, because the button leaves for
 * the login screen rather than Today, which is the only place the canvas-drawn skip copy can send
 * anyone.
 *
 * Signing out outranks the general shape on purpose. A signed-out run holds a local draft rather
 * than a saved habit, so the fact that matters is that nothing joins an account until the person
 * signs in, and `generalBody`'s instruction to add days from the habit names a habit that does not
 * exist yet. The general body may not offer a reminder, and `signedOutBody` offers none either, so
 * the precedence costs detail rather than truth.
 *
 * A signed-in general habit then takes its own pair, because it is due on no day, it reaches neither
 * Today nor the reminder scheduler, and no other body may offer it a reminder. Its badge takes
 * `generalPending` rather than `notTodayPending`, which would claim a day it does not have.
 *
 * "It is in your day" holds only when the habit is due today, see {@link isOnboardingHabitDueToday}.
 */
export function getOnboardingCompleteCopy(state: OnboardingCompleteState): OnboardingCompleteCopy {
  return {
    titleKey: getOnboardingCompleteTitleKey(state),
    bodyKey: getOnboardingCompleteBodyKey(state),
    pendingKey: state.general ? 'generalPending' : state.dueToday ? 'pending' : 'notTodayPending',
    actionKey: state.signedOut ? 'signIn' : 'seeDay',
  }
}

export function getOnboardingReminderPreviewTime(dueTime: string): string | null {
  const match = /^(\d{2}):(\d{2})$/u.exec(dueTime)
  if (!match) return null
  const minutes = (Number(match[1]) * 60 + Number(match[2]) - ONBOARDING_REMINDER_MINUTES + 1440) % 1440
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export type RetainedOnboardingAction = 'show' | 'autocomplete' | 'none'

/**
 * Whether the entry habit-count snapshot for the retained onboarding overlay can be taken yet: the
 * profile has loaded and onboarding is not complete, the overlay is not suppressed (draft hydrating
 * or buffered answers flushing), and the habit-count query has settled.
 */
export function canSnapshotOnboardingEntry(input: {
  hasCompletedOnboarding: boolean | null | undefined
  suppressed: boolean
  habitCountLoaded: boolean
}): boolean {
  return (
    input.hasCompletedOnboarding === false &&
    !input.suppressed &&
    input.habitCountLoaded
  )
}

/**
 * Resolves what the post-auth retained onboarding overlay should do for an account that has not
 * completed onboarding, given a frozen snapshot of whether the account already had habits at app
 * entry. `hadHabitsAtEntry` must be captured once (see {@link canSnapshotOnboardingEntry}) and never
 * recomputed, because the overlay itself creates habits mid-flow. An account that already had habits
 * (a pre-migration user, or one that abandoned onboarding after creating habits) is auto-completed
 * instead of re-onboarded.
 */
export function resolveRetainedOnboarding(input: {
  hasCompletedOnboarding: boolean | null | undefined
  hadHabitsAtEntry: boolean | null
}): RetainedOnboardingAction {
  if (input.hasCompletedOnboarding !== false) return 'none'
  if (input.hadHabitsAtEntry === null) return 'none'
  return input.hadHabitsAtEntry ? 'autocomplete' : 'show'
}
