export type OnboardingFrequencyUnit = 'Day' | 'Week' | 'Month' | 'Year'

export const ONBOARDING_TOTAL_STEPS = 3
export const ONBOARDING_CREATE_HABIT_STEP = 1
export const ONBOARDING_COMPLETE_STEP = 2

export const ONBOARDING_HABIT_SUGGESTIONS: ReadonlyArray<{
  key: string
  frequency: OnboardingFrequencyUnit
}> = [
  { key: 'water', frequency: 'Day' },
  { key: 'read', frequency: 'Day' },
  { key: 'exercise', frequency: 'Week' },
  { key: 'meditate', frequency: 'Day' },
] as const

export const ONBOARDING_HABIT_FREQUENCIES: ReadonlyArray<{
  value: OnboardingFrequencyUnit | 'one-time'
  labelKey: string
}> = [
  { value: 'Day', labelKey: 'onboarding.flow.createHabit.frequency.daily' },
  { value: 'Week', labelKey: 'onboarding.flow.createHabit.frequency.weekly' },
  { value: 'one-time', labelKey: 'onboarding.flow.createHabit.frequency.oneTime' },
] as const

export const ONBOARDING_WEEK_START_OPTIONS = [
  { value: 1, labelKey: 'settings.weekStartDay.monday' },
  { value: 0, labelKey: 'settings.weekStartDay.sunday' },
] as const

export function getOnboardingDisplayTotal(): number {
  return ONBOARDING_TOTAL_STEPS
}

export function getOnboardingDisplayStep(currentStep: number): number {
  return currentStep + 1
}

export function getOnboardingNextStep(currentStep: number): number {
  if (currentStep >= ONBOARDING_COMPLETE_STEP) {
    return ONBOARDING_COMPLETE_STEP
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
  return [
    ONBOARDING_CREATE_HABIT_STEP,
    ONBOARDING_COMPLETE_STEP,
  ].includes(currentStep)
}

export function getOnboardingHabitFrequencyLabelKey(
  frequencyUnit: OnboardingFrequencyUnit | undefined,
): string {
  if (!frequencyUnit) {
    return 'onboarding.flow.createHabit.frequency.oneTime'
  }

  if (frequencyUnit === 'Day') {
    return 'onboarding.flow.createHabit.frequency.daily'
  }

  if (frequencyUnit === 'Week') {
    return 'onboarding.flow.createHabit.frequency.weekly'
  }

  return 'onboarding.flow.createHabit.frequency.oneTime'
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
