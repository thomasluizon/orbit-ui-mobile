export const ONBOARDING_TOTAL_STEPS = 6
export const ONBOARDING_CREATE_HABIT_STEP = 1
export const ONBOARDING_COMPLETE_HABIT_STEP = 2
export const ONBOARDING_CREATE_GOAL_STEP = 3
export const ONBOARDING_FEATURES_STEP = 4
export const ONBOARDING_COMPLETE_STEP = 5

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

export const ONBOARDING_GOAL_SUGGESTIONS = [
  {
    key: 'run',
    titleKey: 'onboarding.flow.createGoal.suggestions.run',
    target: 100,
    unit: 'km',
    unitKey: null,
  },
  {
    key: 'books',
    titleKey: 'onboarding.flow.createGoal.suggestions.books',
    target: 12,
    unitKey: 'onboarding.flow.createGoal.suggestions.booksUnit',
    unit: 'books',
  },
  {
    key: 'save',
    titleKey: 'onboarding.flow.createGoal.suggestions.save',
    target: 5000,
    unit: '$',
    unitKey: null,
  },
] as const

export const ONBOARDING_WEEK_START_OPTIONS = [
  { value: 1, labelKey: 'settings.weekStartDay.monday' },
  { value: 0, labelKey: 'settings.weekStartDay.sunday' },
] as const

export function getOnboardingDisplayTotal(hasProAccess: boolean): number {
  return hasProAccess ? ONBOARDING_TOTAL_STEPS : ONBOARDING_TOTAL_STEPS - 1
}

export function getOnboardingDisplayStep(currentStep: number, hasProAccess: boolean): number {
  const rawStep = currentStep + 1
  if (!hasProAccess && currentStep >= ONBOARDING_FEATURES_STEP) {
    return rawStep - 1
  }
  return rawStep
}

export function getOnboardingNextStep(currentStep: number, hasProAccess: boolean): number {
  if (currentStep >= ONBOARDING_COMPLETE_STEP) {
    return ONBOARDING_COMPLETE_STEP
  }

  let nextStep = currentStep + 1

  if (!hasProAccess && nextStep === ONBOARDING_CREATE_GOAL_STEP) {
    nextStep += 1
  }

  return nextStep
}

export function getOnboardingPreviousStep(currentStep: number, hasProAccess: boolean): number {
  if (currentStep <= 0) {
    return 0
  }

  let previousStep = currentStep - 1

  if (!hasProAccess && previousStep === ONBOARDING_CREATE_GOAL_STEP) {
    previousStep -= 1
  }

  return previousStep
}

export function shouldHideOnboardingFooter(currentStep: number): boolean {
  return [
    ONBOARDING_CREATE_HABIT_STEP,
    ONBOARDING_COMPLETE_HABIT_STEP,
    ONBOARDING_CREATE_GOAL_STEP,
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
