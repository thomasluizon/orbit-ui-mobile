import { describe, it, expect } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import {
  isCalendarPromptCriteriaMet,
  isImportPromptCriteriaMet,
  shouldShowRetainedOnboardingOverlay,
  shouldSuppressOnboardingOverlay,
} from '@/app/(app)/onboarding-overlay-state'

describe('onboarding overlay state machine', () => {
  describe('isCalendarPromptCriteriaMet', () => {
    it('is met once onboarding and the tour are done and the calendar is not yet imported', () => {
      const profile = createMockProfile({
        hasCompletedOnboarding: true,
        hasCompletedTour: true,
        hasImportedCalendar: false,
      })
      expect(isCalendarPromptCriteriaMet(profile, '/')).toBe(true)
    })

    it('is not met on the calendar-sync route itself', () => {
      const profile = createMockProfile({
        hasCompletedOnboarding: true,
        hasCompletedTour: true,
        hasImportedCalendar: false,
      })
      expect(isCalendarPromptCriteriaMet(profile, '/calendar-sync')).toBe(false)
    })

    it('is not met before the tour is complete', () => {
      const profile = createMockProfile({
        hasCompletedOnboarding: true,
        hasCompletedTour: false,
        hasImportedCalendar: false,
      })
      expect(isCalendarPromptCriteriaMet(profile, '/')).toBe(false)
    })

    it('is not met without a profile', () => {
      expect(isCalendarPromptCriteriaMet(undefined, '/')).toBe(false)
    })
  })

  describe('isImportPromptCriteriaMet', () => {
    const onboardedProfile = () =>
      createMockProfile({
        hasCompletedOnboarding: true,
        hasSeenImportPrompt: false,
      })

    it('is met for an onboarded profile that has not seen the prompt when nothing else is pending', () => {
      expect(
        isImportPromptCriteriaMet(onboardedProfile(), {
          calendarPromptCriteriaMet: false,
          showCalendarPrompt: false,
          hasPendingOnboardingAnswers: false,
        }),
      ).toBe(true)
    })

    it('defers while the calendar prompt is eligible', () => {
      expect(
        isImportPromptCriteriaMet(onboardedProfile(), {
          calendarPromptCriteriaMet: true,
          showCalendarPrompt: false,
          hasPendingOnboardingAnswers: false,
        }),
      ).toBe(false)
    })

    it('defers while the calendar prompt is shown', () => {
      expect(
        isImportPromptCriteriaMet(onboardedProfile(), {
          calendarPromptCriteriaMet: false,
          showCalendarPrompt: true,
          hasPendingOnboardingAnswers: false,
        }),
      ).toBe(false)
    })

    it('is suppressed while an onboarding draft is still pending flush', () => {
      expect(
        isImportPromptCriteriaMet(onboardedProfile(), {
          calendarPromptCriteriaMet: false,
          showCalendarPrompt: false,
          hasPendingOnboardingAnswers: true,
        }),
      ).toBe(false)
    })

    it('is not met once the prompt has already been seen', () => {
      expect(
        isImportPromptCriteriaMet(
          createMockProfile({ hasCompletedOnboarding: true, hasSeenImportPrompt: true }),
          {
            calendarPromptCriteriaMet: false,
            showCalendarPrompt: false,
            hasPendingOnboardingAnswers: false,
          },
        ),
      ).toBe(false)
    })
  })

  describe('shouldSuppressOnboardingOverlay', () => {
    it('suppresses until the draft store has hydrated', () => {
      expect(
        shouldSuppressOnboardingOverlay({
          draftHydrated: false,
          hasPendingOnboardingAnswers: false,
        }),
      ).toBe(true)
    })

    it('suppresses while buffered answers are still pending', () => {
      expect(
        shouldSuppressOnboardingOverlay({
          draftHydrated: true,
          hasPendingOnboardingAnswers: true,
        }),
      ).toBe(true)
    })

    it('does not suppress once hydrated with no pending answers', () => {
      expect(
        shouldSuppressOnboardingOverlay({
          draftHydrated: true,
          hasPendingOnboardingAnswers: false,
        }),
      ).toBe(false)
    })
  })

  describe('shouldShowRetainedOnboardingOverlay', () => {
    it('shows for a profile mid-onboarding once not suppressed', () => {
      const profile = createMockProfile({ hasCompletedOnboarding: false })
      expect(shouldShowRetainedOnboardingOverlay(profile, false)).toBe(true)
    })

    it('does not show while suppressed', () => {
      const profile = createMockProfile({ hasCompletedOnboarding: false })
      expect(shouldShowRetainedOnboardingOverlay(profile, true)).toBe(false)
    })

    it('does not show once onboarding is complete', () => {
      const profile = createMockProfile({ hasCompletedOnboarding: true })
      expect(shouldShowRetainedOnboardingOverlay(profile, false)).toBe(false)
    })

    it('does not show without a profile', () => {
      expect(shouldShowRetainedOnboardingOverlay(undefined, false)).toBe(false)
    })
  })
})
