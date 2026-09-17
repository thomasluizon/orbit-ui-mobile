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
export const ONBOARDING_STATE_AXIS = [
  'what',
  'what typed',
  'what signed out',
  'when',
  'when corrected',
  'at limit',
  'create failed',
  'remind',
  'remind already refused',
  'remind enable failed',
  'remind no time',
  'done',
  'done no reminders',
  'done signed out',
] as const

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
  if (read.consumed.length === 0) return sentence

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

export function changeOnboardingScheduleMode(
  schedule: OnboardingSchedule,
  mode: OnboardingScheduleMode,
): OnboardingSchedule {
  if (mode === 'oneTime') {
    return { ...schedule, frequencyUnit: null, frequencyQuantity: null, intervalWeeks: 1, days: [], isGeneral: false, isFlexible: false }
  }
  if (mode === 'flexible') {
    return { ...schedule, frequencyUnit: 'Week', frequencyQuantity: schedule.isFlexible ? schedule.frequencyQuantity ?? 3 : 3, days: [], isGeneral: false, isFlexible: true }
  }
  if (mode === 'interval') {
    const alreadyInterval = schedule.frequencyUnit !== null && schedule.days.length === 0 && !schedule.isFlexible && !(schedule.frequencyUnit === 'Day' && schedule.frequencyQuantity === 1)
    return { ...schedule, frequencyUnit: alreadyInterval ? schedule.frequencyUnit : 'Week', frequencyQuantity: alreadyInterval ? schedule.frequencyQuantity ?? 1 : 2, intervalWeeks: 1, days: [], isGeneral: false, isFlexible: false }
  }
  return { ...schedule, frequencyUnit: 'Day', frequencyQuantity: 1, isGeneral: schedule.days.length === 0, isFlexible: false }
}

const EVERY_DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function buildOnboardingScheduleFromPhrase(
  sentence: string,
  locale: SupportedLocale,
): OnboardingSchedule {
  const read = readHabitPhrase(sentence, locale)
  const intervalWeeks = read.intervalWeeks ?? 1
  if (read.cadence === 'flexible') {
    return {
      frequencyUnit: 'Week', frequencyQuantity: read.frequencyQuantity ?? 1,
      intervalWeeks, days: [], isGeneral: false, isFlexible: true, dueTime: read.dueTime ?? '',
    }
  }
  if (read.cadence === 'fixed' || read.cadence === 'daily') {
    return {
      frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks,
      days: read.cadence === 'daily' ? EVERY_DAY : read.days,
      isGeneral: false, isFlexible: false, dueTime: read.dueTime ?? '',
    }
  }
  if (read.intervalWeeks) {
    return {
      frequencyUnit: 'Week', frequencyQuantity: 1, intervalWeeks,
      days: [], isGeneral: false, isFlexible: false, dueTime: read.dueTime ?? '',
    }
  }
  return {
    frequencyUnit: null, frequencyQuantity: null, intervalWeeks: 1,
    days: [], isGeneral: true, isFlexible: false, dueTime: read.dueTime ?? '',
  }
}

export function buildOnboardingScheduleFromSuggestion(
  suggestion: HabitSetupSuggestion,
): OnboardingSchedule {
  const patch = buildHabitFormPatchFromSuggestion(suggestion)
  return {
    frequencyUnit: patch.frequencyUnit,
    frequencyQuantity: patch.frequencyQuantity,
    intervalWeeks: 1,
    days: patch.days,
    isGeneral: false,
    isFlexible: patch.mode === 'flexible',
    dueTime: patch.dueTime ?? '',
  }
}

export function buildOnboardingHabitInput(input: {
  sentence: string
  locale: SupportedLocale
  emoji: string
  days: string[]
  dueTime: string
  schedule?: OnboardingSchedule
}): CreateHabitRequest {
  const schedule = input.schedule ?? buildOnboardingScheduleFromPhrase(input.sentence, input.locale)
  return {
    title: getOnboardingHabitTitle(input.sentence, input.locale),
    emoji: input.emoji || null,
    ...(schedule.frequencyUnit ? { frequencyUnit: schedule.frequencyUnit } : {}),
    ...(schedule.frequencyQuantity ? { frequencyQuantity: schedule.frequencyQuantity } : {}),
    ...(schedule.isFlexible || schedule.frequencyUnit ? { intervalWeeks: schedule.intervalWeeks } : {}),
    ...(schedule.days.length > 0 ? { days: schedule.days } : {}),
    ...(schedule.isGeneral ? { isGeneral: true } : {}),
    ...(schedule.isFlexible ? { isFlexible: true } : {}),
    ...(schedule.dueTime ? { dueTime: schedule.dueTime } : {}),
    reminderEnabled: false,
    reminderTimes: schedule.dueTime ? [ONBOARDING_REMINDER_MINUTES] : [],
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
