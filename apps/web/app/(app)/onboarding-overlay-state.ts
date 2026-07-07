import type { Profile } from '@orbit/shared/types/profile'

/** Whether the post-onboarding calendar-import prompt is eligible to show for the given profile and route. */
export function isCalendarPromptCriteriaMet(
  profile: Profile | null | undefined,
  pathname: string | null,
): boolean {
  return !!(
    profile &&
    profile.hasCompletedOnboarding &&
    profile.hasCompletedTour &&
    !profile.hasImportedCalendar &&
    pathname !== '/calendar-sync'
  )
}

/** Whether the Astra import prompt is eligible, deferring to the calendar prompt and to any unflushed onboarding draft. */
export function isImportPromptCriteriaMet(
  profile: Profile | null | undefined,
  context: Readonly<{
    calendarPromptCriteriaMet: boolean
    showCalendarPrompt: boolean
    hasPendingOnboardingAnswers: boolean
  }>,
): boolean {
  return !!(
    profile &&
    profile.hasCompletedOnboarding &&
    profile.hasCompletedTour &&
    !profile.hasSeenImportPrompt &&
    !context.calendarPromptCriteriaMet &&
    !context.showCalendarPrompt &&
    !context.hasPendingOnboardingAnswers
  )
}

/** The retained onboarding overlay is suppressed until the draft store has hydrated and any buffered answers have flushed. */
export function shouldSuppressOnboardingOverlay(
  input: Readonly<{ draftHydrated: boolean; hasPendingOnboardingAnswers: boolean }>,
): boolean {
  return !input.draftHydrated || input.hasPendingOnboardingAnswers
}

/** Whether to mount the retained (post-auth) onboarding overlay for a profile that has not finished onboarding. */
export function shouldShowRetainedOnboardingOverlay(
  profile: Profile | null | undefined,
  suppressOnboardingOverlay: boolean,
): boolean {
  return !!(profile && !profile.hasCompletedOnboarding && !suppressOnboardingOverlay)
}
