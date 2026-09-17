import type { CreateHabitRequest } from '../types/habit'
import type { SupportedLocale } from '../types/profile'
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
  const characters = sentence.split('')
  for (const token of read.consumed) {
    characters.fill(' ', token.start, token.end)
  }
  const glue = locale === 'pt-BR'
    ? /\b(?:toda|todo|todos|as|os|e|por|na|no|a|em)\b/giu
    : /\b(?:every|each|and|a|per|at|on|times?|week)\b/giu
  const title = characters.join('').replace(glue, ' ').replaceAll(/[\s,]+/gu, ' ').trim()
  return title || sentence.trim()
}

export function buildOnboardingHabitInput(input: {
  sentence: string
  locale: SupportedLocale
  emoji: string
  days: string[]
  dueTime: string
}): CreateHabitRequest {
  const scheduled = input.days.length > 0
  return {
    title: getOnboardingHabitTitle(input.sentence, input.locale),
    emoji: input.emoji || null,
    ...(scheduled
      ? { frequencyUnit: 'Day' as const, frequencyQuantity: 1, days: input.days }
      : { isGeneral: true }),
    ...(input.dueTime ? { dueTime: input.dueTime } : {}),
    reminderEnabled: input.dueTime.length > 0,
    reminderTimes: input.dueTime ? [ONBOARDING_REMINDER_MINUTES] : [],
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
