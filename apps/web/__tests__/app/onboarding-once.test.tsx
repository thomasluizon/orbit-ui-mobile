import { QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUIStore } from '@/stores/ui-store'
import { useVersionGateStore } from '@/stores/version-gate-store'

const state = vi.hoisted(() => ({
  profile: undefined as {
    hasProAccess: boolean
    hasCompletedOnboarding?: boolean
    hasCompletedTour?: boolean
    hasImportedCalendar?: boolean
    hasSeenImportPrompt?: boolean
  } | undefined,
  count: 0,
  countLoaded: false,
  isOnline: true,
  pathname: '/',
  wide: false,
  authenticated: true,
  push: vi.fn(),
}))

import { profileKeys } from '@orbit/shared/query'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types/profile'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { getQueryClient } from '@/lib/query-client'
import { useAuthStore } from '@/stores/auth-store'
import { resetAuthStore, holdAccount, respondWithAccount } from '@/__tests__/support/account-change'
import { installWebLocks } from '@/__tests__/helpers/web-locks'
import { setOnboardingProPending } from '@/hooks/use-onboarding-pro-pending'
import AuthLayout from '@/app/(auth)/layout'
import OnboardingLayout from '@/app/(onboarding)/layout'

const apply = vi.hoisted(() => vi.fn())
const routeHistory = vi.hoisted(() => [] as string[])
function QueryAppLayout() {
  return <QueryClientProvider client={getQueryClient()}><AppLayout><div>Hoje</div></AppLayout></QueryClientProvider>
}
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: state.push, prefetch: vi.fn(), replace: (route: string) => { routeHistory.push(route) } }),
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next/dynamic', () => ({
  default: () => ({ open, notice }: { open?: boolean; notice?: React.ReactNode }) =>
    open === undefined ? <div data-conversation-body="">{notice}</div> : open ? <h1 id="habit-form-title">Create habit</h1> : null,
}))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => state.wide }))
vi.mock('@/lib/providers', () => ({ Providers: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/lib/account-event-connection', () => ({ AccountEventConnection: () => null }))
vi.mock('@/app/(app)/today-provider', () => ({ TodayProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>, useToday: () => '2026-09-12' }))
vi.mock('@/components/shell/destination-shell', () => ({
  useShellComposerSlot: () => {},
  DestinationShell: ({ children, onCreate, notice, createRefusal, conversation, conversationOpen }: { children: React.ReactNode; onCreate: () => void; notice?: React.ReactNode; createRefusal?: React.ReactNode; conversation?: React.ReactNode; conversationOpen?: boolean }) => (
    <>
      {state.pathname === '/wrapped' ? children : (
        <>
          <div data-shell-background="" inert={conversationOpen && !state.wide || undefined} aria-hidden={conversationOpen && !state.wide || undefined}>
            <button type="button" onClick={onCreate}>Create</button>{createRefusal}<div data-shell-notice="" data-testid="notice-slot">{notice}</div>{children}
          </div>
          {conversationOpen && !state.wide ? <div role="dialog" aria-label="Astra conversation">{conversation}</div> : null}
          {conversationOpen && state.wide ? <aside aria-label="Astra conversation">{conversation}</aside> : null}
        </>
      )}
    </>
  ),
}))
vi.mock('@/components/command/command-palette', () => ({ CommandPaletteBackground: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/shell/composer', () => ({ Composer: () => null }))
vi.mock('@/hooks/use-chat-composer', () => ({ useChatComposer: () => ({
  fileInputRef: { current: null }, textFileInputRef: { current: null },
  handleFileSelect: vi.fn(), handleTextFileSelect: vi.fn(),
  composerProps: { onSend: vi.fn() },
}) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: state.isOnline }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showPersistentError: vi.fn() }) }))
vi.mock('@/components/navigation/web-nav', () => ({ WebNav: () => null }))
vi.mock('@/components/motion/route-transition-shell', () => ({ RouteTransitionShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => {
  const client = useQueryClient()
  const query = useQuery<Profile>({ queryKey: profileKeys.detail(), enabled: false })
  return { profile: query.data, patchProfile: (patch: Partial<Profile>) => client.setQueryData<Profile>(profileKeys.detail(), (old) => old ? { ...old, ...patch } : old) }
} }))
vi.mock('@/lib/actions/onboarding', () => ({ applyOnboarding: apply }))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabitCountLoaded: () => ({ count: state.count, isLoaded: state.countLoaded }) }))
vi.mock('@/hooks/use-habits', () => ({ useTotalHabitCount: () => state.count }))
vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => ({ leveledUp: false, newLevel: null, crossedStreakMilestones: [], newAchievements: [] }),
}))
vi.mock('@/hooks/use-timezone-auto-sync', () => ({ useTimezoneAutoSync: () => {} }))
vi.mock('@/stores/referral-prompt-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/stores/referral-prompt-store')>()),
  useReferralPromptStore: (selector: (value: Record<string, unknown>) => unknown) => selector({
    armReferralPrompt: vi.fn(), armMilestoneSharePrompt: vi.fn(), armConsentPrompt: vi.fn(),
  }),
}))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

vi.mock('@/components/navigation/notification-delete-notice', () => ({ NotificationDeleteNotice: () => null }))
vi.mock('@/components/ui/trial-expired-modal', () => ({ TrialExpiredModal: () => null }))
vi.mock('@/components/ui/expiry-warning', () => ({ ExpiryWarning: () => null }))
vi.mock('@/components/ui/push-prompt', () => ({ PushPrompt: () => null }))
vi.mock('@/components/onboarding/retained-onboarding-overlay', () => ({ RetainedOnboardingOverlay: ({ finalStepOnly }: { finalStepOnly: boolean }) => <div data-testid="account-onboarding">{finalStepOnly ? 'trial' : 'first habit'}</div> }))
vi.mock('@/components/gamification/streak-celebration', () => ({ StreakCelebration: () => null }))
vi.mock('@/components/gamification/all-done-celebration', () => ({ AllDoneCelebration: () => null }))
vi.mock('@/components/gamification/goal-completed-celebration', () => ({ GoalCompletedCelebration: () => null }))
vi.mock('@/components/gamification/welcome-back-toast', () => ({ WelcomeBackToast: () => null }))
vi.mock('@/components/gamification/achievement-toast', () => ({ AchievementToast: () => null }))
vi.mock('@/components/gamification/level-up-overlay', () => ({ LevelUpOverlay: () => null }))
vi.mock('@/components/gamification/streak-freeze-celebration', () => ({ StreakFreezeCelebration: () => null }))
vi.mock('@/components/gamification/celebration-panel', () => ({ CelebrationPanel: () => null }))
vi.mock('@/components/referral/referral-prompt', () => ({ ReferralPrompt: () => null }))
vi.mock('@/components/milestone-share/milestone-share-prompt', () => ({ MilestoneSharePrompt: () => null }))
vi.mock('@/components/marketing-consent/marketing-consent-prompt', () => ({ MarketingConsentPrompt: () => null }))
vi.mock('@/lib/api-fetch-i18n-provider', () => ({ ApiFetchI18nProvider: () => null }))
vi.mock('@/components/tour/tour-provider', () => ({ TourProvider: () => null }))
vi.mock('@/components/tour/tour-overlay', () => ({ TourOverlay: () => null }))

import AppLayout from '@/app/(app)/layout'
import { useAppToastStore } from '@/stores/app-toast-store'


async function signIn(onboarded: boolean) {
  await act(async () => { holdAccount('account-a'); await Promise.resolve(); await Promise.resolve() })
  respondWithAccount('account-a')
  getQueryClient().setQueryData(profileKeys.detail(), createMockProfile({ hasCompletedOnboarding: onboarded, hasSeenImportPrompt: true, hasImportedCalendar: true }))
  state.pathname = '/'
}

beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
  installWebLocks()
  await resetAuthStore()
  localStorage.clear()
  useOnboardingDraftStore.setState(useOnboardingDraftStore.getInitialState())
  await useOnboardingDraftStore.persist.rehydrate()
  getQueryClient().clear()
  state.pathname = '/login'
  state.count = 0
  state.countLoaded = true
  apply.mockReset().mockResolvedValue(undefined)
  routeHistory.length = 0
})
afterEach(() => { vi.unstubAllGlobals() })

describe('onboarding through owning layouts', () => {
  it('routes a fresh install to onboarding before rendering sign-in', async () => {
    render(<AuthLayout><div>Entrar</div></AuthLayout>)
    await waitFor(() => expect(routeHistory).toContain('/onboarding'))
    expect(screen.queryByText('Entrar')).not.toBeInTheDocument()
    render(<OnboardingLayout><div>signed-out onboarding</div></OnboardingLayout>)
    expect(await screen.findByText('signed-out onboarding')).toBeInTheDocument()
  })

  it('lets an auth callback finish sign-in on a fresh device', async () => {
    state.pathname = '/auth-callback'
    render(<AuthLayout><div>auth callback</div></AuthLayout>)
    expect(await screen.findByText('auth callback')).toBeInTheDocument()
    expect(routeHistory).not.toContain('/onboarding')
  })

  it('never renders onboarding after sign-out, including a legacy device flag', async () => {
    await signIn(true)
    useOnboardingDraftStore.setState({ onboardingLocallyDone: false })
    const view = render(<QueryAppLayout />)
    await act(async () => { await useAuthStore.getState().logout() })
    state.pathname = '/login'
    view.rerender(<AuthLayout><div>Entrar</div></AuthLayout>)
    expect(await screen.findByText('Entrar')).toBeInTheDocument()
    expect(routeHistory).not.toContain('/onboarding')
    view.rerender(<OnboardingLayout><div>signed-out onboarding</div></OnboardingLayout>)
    expect(screen.queryByText('signed-out onboarding')).not.toBeInTheDocument()
    expect(routeHistory).toContain('/login')
  })

  it('skips device onboarding and signs into an onboarded account', async () => {
    useOnboardingDraftStore.getState().markOnboardingLocallyDone()
    render(<AuthLayout><div>Entrar</div></AuthLayout>)
    expect(await screen.findByText('Entrar')).toBeInTheDocument()
    await signIn(true)
    render(<QueryAppLayout />)
    expect(screen.queryByTestId('account-onboarding')).not.toBeInTheDocument()
    expect(screen.getByText('Hoje')).toBeInTheDocument()
  })

  it('saves the signed-out habit then shows only the trial step before Hoje', async () => {
    useOnboardingDraftStore.getState().bufferHabit({ title: 'Read', frequencyUnit: 'Day', frequencyQuantity: 1 })
    useOnboardingDraftStore.getState().markOnboardingLocallyDone()
    await signIn(false)
    render(<QueryAppLayout />)
    await waitFor(() => expect(screen.getByTestId('account-onboarding')).toHaveTextContent('trial'))
    expect(apply).toHaveBeenCalledWith({ habits: [{ title: 'Read', frequencyUnit: 'Day', frequencyQuantity: 1 }] }, 'account-a')
    expect(getQueryClient().getQueryData(profileKeys.detail())).toMatchObject({ hasCompletedOnboarding: true })
    act(() => setOnboardingProPending('account-a', false))
    await waitFor(() => expect(screen.queryByTestId('account-onboarding')).not.toBeInTheDocument())
    expect(screen.getByText('Hoje')).toBeInTheDocument()
    expect(useOnboardingDraftStore.getState().onboardingLocallyDone).toBe(true)
  })

  it.each([0, 3])('shows account onboarding on a used device with %s existing habits', async (count) => {
    useOnboardingDraftStore.getState().markOnboardingLocallyDone()
    state.count = count
    await signIn(false)
    render(<QueryAppLayout />)
    expect(await screen.findByTestId('account-onboarding')).toHaveTextContent('first habit')
    expect(apply).not.toHaveBeenCalled()
  })

  it('never restarts an onboarded account on second sign-in or a fresh device', async () => {
    await signIn(true)
    const view = render(<QueryAppLayout />)
    await act(async () => { await useAuthStore.getState().logout() })
    await signIn(true)
    view.rerender(<QueryAppLayout />)
    expect(screen.queryByTestId('account-onboarding')).not.toBeInTheDocument()
    expect(screen.getByText('Hoje')).toBeInTheDocument()
  })
})
