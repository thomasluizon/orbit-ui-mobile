export const ONBOARDING_TOTAL_STEPS = 3
export const ONBOARDING_CREATE_HABIT_STEP = 1
export const ONBOARDING_COMPLETE_STEP = 2

export const ONBOARDING_HABIT_SUGGESTIONS = [
  { key: 'water', frequency: 'Day' },
  { key: 'read', frequency: 'Day' },
  { key: 'exercise', frequency: 'Week' },
  { key: 'meditate', frequency: 'Day' },
] as const

export const ONBOARDING_HABIT_FREQUENCIES = [
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
  frequencyUnit: 'Day' | 'Week' | 'Month' | 'Year' | undefined,
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
