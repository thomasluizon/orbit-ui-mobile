import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setUIAccountScope, useUIStore } from '@/stores/ui-store'

const state = vi.hoisted(() => ({
  profile: undefined as { hasProAccess: boolean } | undefined,
  count: 0,
  countLoaded: false,
  push: vi.fn(),
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: state.push, prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next/dynamic', () => ({
  default: () => ({ open }: { open: boolean }) => open ? <h1 id="habit-form-title">Create habit</h1> : null,
}))
vi.mock('@/lib/providers', () => ({ Providers: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/lib/account-event-connection', () => ({ AccountEventConnection: () => null }))
vi.mock('@/app/(app)/today-provider', () => ({ TodayProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/shell/app-shell', () => ({
  AppShell: ({ children, onCreate }: { children: React.ReactNode; onCreate: () => void }) => (
    <><button type="button" onClick={onCreate}>Create</button>{children}</>
  ),
}))
vi.mock('@/components/navigation/web-nav', () => ({ WebNav: () => null }))
vi.mock('@/components/motion/route-transition-shell', () => ({ RouteTransitionShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: state.profile, patchProfile: vi.fn() }) }))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabitCountLoaded: () => ({ count: state.count, isLoaded: state.countLoaded }) }))
vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => ({ leveledUp: false, newLevel: null, crossedStreakMilestones: [], newAchievements: [] }),
}))
vi.mock('@/hooks/use-timezone-auto-sync', () => ({ useTimezoneAutoSync: () => {} }))
vi.mock('@/hooks/use-onboarding-flush', () => ({ useOnboardingFlush: () => {} }))
vi.mock('@/hooks/use-retained-onboarding-guard', () => ({ useRetainedOnboardingGuard: () => false }))
vi.mock('@/stores/onboarding-draft-store', () => ({
  useOnboardingDraftHydrated: () => true,
  useOnboardingHasPendingAnswers: () => false,
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: { getState: () => ({ startExpiryMonitor: () => () => {} }) } }))
vi.mock('@/stores/referral-prompt-store', () => ({
  useReferralPromptStore: (selector: (value: Record<string, unknown>) => unknown) => selector({
    armReferralPrompt: vi.fn(), armMilestoneSharePrompt: vi.fn(), armConsentPrompt: vi.fn(),
  }),
}))
vi.mock('@/components/ui/app-overlay', () => ({ AppOverlay: () => null }))
vi.mock('@/components/ui/pill-button', () => ({ PillButton: () => null }))

vi.mock('@/components/ui/trial-banner', () => ({ TrialBanner: () => null }))
vi.mock('@/components/ui/update-available-banner', () => ({ UpdateAvailableBanner: () => null }))
vi.mock('@/components/ui/back-to-top', () => ({ BackToTop: () => null }))
vi.mock('@/components/ui/trial-expired-modal', () => ({ TrialExpiredModal: () => null }))
vi.mock('@/components/ui/expiry-warning', () => ({ ExpiryWarning: () => null }))
vi.mock('@/components/ui/push-prompt', () => ({ PushPrompt: () => null }))
vi.mock('@/components/onboarding/retained-onboarding-overlay', () => ({ RetainedOnboardingOverlay: () => null }))
vi.mock('@/components/gamification/streak-celebration', () => ({ StreakCelebration: () => null }))
vi.mock('@/components/gamification/all-done-celebration', () => ({ AllDoneCelebration: () => null }))
vi.mock('@/components/gamification/goal-completed-celebration', () => ({ GoalCompletedCelebration: () => null }))
vi.mock('@/components/gamification/welcome-back-toast', () => ({ WelcomeBackToast: () => null }))
vi.mock('@/components/gamification/achievement-toast', () => ({ AchievementToast: () => null }))
vi.mock('@/components/gamification/level-up-overlay', () => ({ LevelUpOverlay: () => null }))
vi.mock('@/components/gamification/streak-freeze-celebration', () => ({ StreakFreezeCelebration: () => null }))
vi.mock('@/components/referral/referral-prompt', () => ({ ReferralPrompt: () => null }))
vi.mock('@/components/milestone-share/milestone-share-prompt', () => ({ MilestoneSharePrompt: () => null }))
vi.mock('@/components/marketing-consent/marketing-consent-prompt', () => ({ MarketingConsentPrompt: () => null }))
vi.mock('@/lib/api-fetch-i18n-provider', () => ({ ApiFetchI18nProvider: () => null }))
vi.mock('@/components/tour/tour-provider', () => ({ TourProvider: () => null }))
vi.mock('@/components/tour/tour-overlay', () => ({ TourOverlay: () => null }))

import AppLayout from '@/app/(app)/layout'

describe('Today create during first load', () => {
  beforeEach(() => {
    localStorage.clear()
    useUIStore.setState(useUIStore.getInitialState())
    state.profile = undefined
    state.count = 0
    state.countLoaded = false
    state.push.mockClear()
  })

  afterEach(() => localStorage.clear())

  it('keeps the form open when session, profile and habit count resolve', async () => {
    const view = render(<AppLayout><div>Today loading</div></AppLayout>)
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(screen.getByRole('heading', { name: 'Create habit' })).toBeInTheDocument()

    await act(async () => {
      setUIAccountScope('account-a')
      state.profile = { hasProAccess: true }
      state.count = 10
      state.countLoaded = true
      view.rerender(<AppLayout><div>Today loaded</div></AppLayout>)
    })

    expect(screen.getByRole('heading', { name: 'Create habit' })).toBeInTheDocument()
    expect(state.push).not.toHaveBeenCalledWith('/upgrade')

    await act(async () => setUIAccountScope('account-b'))
    expect(screen.queryByRole('heading', { name: 'Create habit' })).not.toBeInTheDocument()
  })

  it('opens the form when count arrives before a Pro profile', () => {
    state.count = 10
    state.countLoaded = true
    render(<AppLayout><div>Today loading</div></AppLayout>)
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(screen.getByRole('heading', { name: 'Create habit' })).toBeInTheDocument()
    expect(state.push).not.toHaveBeenCalledWith('/upgrade')
  })
})
