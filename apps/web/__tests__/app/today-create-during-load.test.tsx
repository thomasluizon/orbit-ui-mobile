import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HabitCreateFrame } from '@/components/habits/habit-create-frame'
import { buildHabitCreateHref } from '@orbit/shared/utils'
import { setUIAccountScope, useUIStore } from '@/stores/ui-store'
import { expectSmallSheetActions, sheetActionsUseActionPair, sheetSlotButtons } from '@/__tests__/support/sheet-slots'
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

function QueryAppLayout({ children }: { children: import('react').ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return <QueryClientProvider client={queryClient}><AppLayout>{children}</AppLayout></QueryClientProvider>
}

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: state.push, prefetch: vi.fn() }),
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
          <div data-shell-background="" inert={conversationOpen || undefined} aria-hidden={conversationOpen || undefined}>
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
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: state.profile, patchProfile: vi.fn() }) }))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabitCountLoaded: () => ({ count: state.count, isLoaded: state.countLoaded }) }))
vi.mock('@/hooks/use-habits', () => ({ useTotalHabitCount: () => state.count }))
vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => ({ leveledUp: false, newLevel: null, crossedStreakMilestones: [], newAchievements: [] }),
}))
vi.mock('@/hooks/use-timezone-auto-sync', () => ({ useTimezoneAutoSync: () => {} }))
vi.mock('@/hooks/use-onboarding-flush', () => ({ useOnboardingFlush: () => {} }))
vi.mock('@/hooks/use-retained-onboarding-guard', () => ({ useRetainedOnboardingGuard: () => false }))
vi.mock('@/stores/onboarding-draft-store', () => ({
  useOnboardingDraftHydrated: () => true,
  useOnboardingHasPendingAnswers: () => false,
  useOnboardingDraftStore: (selector: (state: { pushRegistrationFailed: boolean }) => unknown) => selector({ pushRegistrationFailed: false }),
}))
vi.mock('@/stores/auth-store', () => ({
  useHeldAccountId: () => state.authenticated ? 'account-a' : null,
  getHeldAccountId: () => 'account-a',
  useAuthStore: Object.assign(
    (selector: (state: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated: state.authenticated }),
    { getState: () => ({ startExpiryMonitor: () => () => {} }) },
  ),
}))
vi.mock('@/stores/referral-prompt-store', () => ({
  useReferralPromptStore: (selector: (value: Record<string, unknown>) => unknown) => selector({
    armReferralPrompt: vi.fn(), armMilestoneSharePrompt: vi.fn(), armConsentPrompt: vi.fn(),
  }),
}))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

vi.mock('@/components/navigation/notification-delete-notice', () => ({ NotificationDeleteNotice: () => null }))
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
vi.mock('@/components/gamification/celebration-panel', () => ({ CelebrationPanel: () => null }))
vi.mock('@/components/referral/referral-prompt', () => ({ ReferralPrompt: () => null }))
vi.mock('@/components/milestone-share/milestone-share-prompt', () => ({ MilestoneSharePrompt: () => null }))
vi.mock('@/components/marketing-consent/marketing-consent-prompt', () => ({ MarketingConsentPrompt: () => null }))
vi.mock('@/lib/api-fetch-i18n-provider', () => ({ ApiFetchI18nProvider: () => null }))
vi.mock('@/components/tour/tour-provider', () => ({ TourProvider: () => null }))
vi.mock('@/components/tour/tour-overlay', () => ({ TourOverlay: () => null }))

import AppLayout from '@/app/(app)/layout'
import { useAppToastStore } from '@/stores/app-toast-store'

describe('Today create during first load', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-09-12T12:00:00.000Z'))
    localStorage.clear()
    useUIStore.setState(useUIStore.getInitialState())
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
    state.profile = undefined
    state.count = 0
    state.countLoaded = false
    state.isOnline = true
    state.pathname = '/'
    state.wide = false
    state.authenticated = true
    state.push.mockClear()
    useAppToastStore.setState({ currentToast: null, queue: [] })
  })

  afterEach(() => { localStorage.clear(); vi.useRealTimers() })

  it('keeps reload guidance in the main app layout', async () => {
    render(<QueryAppLayout><div>Today</div></QueryAppLayout>)

    await act(async () => useVersionGateStore.getState().requireReload('appUpdated'))

    expect(screen.getByRole('status')).toHaveTextContent('errors.api.appUpdated')
    expect(screen.getByRole('button', { name: 'errors.api.reload' })).toBeInTheDocument()
  })

  it('keeps reload guidance reachable while the Astra conversation is open', async () => {
    render(<QueryAppLayout><div>Today</div></QueryAppLayout>)

    act(() => useUIStore.getState().setAstraConversationOpen(true))
    await act(async () => useVersionGateStore.getState().requireReload('accountChanged'))

    const banners = screen.getAllByRole('status')
      .filter((node) => node.hasAttribute('data-update-banner'))
    expect(banners).toHaveLength(1)
    expect(banners[0]).toHaveTextContent('errors.api.accountChanged')
    expect(banners[0]?.closest('[inert]')).toBeNull()
  })

  it('announces reload guidance inside the wide conversation', async () => {
    state.wide = true
    render(<QueryAppLayout><div>Today</div></QueryAppLayout>)

    act(() => useUIStore.getState().setAstraConversationOpen(true))
    await act(async () => useVersionGateStore.getState().requireReload('accountChanged'))

    const banners = screen.getAllByRole('status')
      .filter((node) => node.hasAttribute('data-update-banner'))
    expect(banners).toHaveLength(1)
    expect(banners[0]).toHaveTextContent('errors.api.accountChanged')
    expect(banners[0]?.closest('[data-conversation-body]')).not.toBeNull()
  })

  it('waits to show the calendar import prompt until the pushed creation screen closes', async () => {
    state.profile = { hasProAccess: true, hasCompletedOnboarding: true, hasCompletedTour: true, hasImportedCalendar: false }
    state.pathname = '/habits/new'
    const view = render(<QueryAppLayout>
      <HabitCreateFrame presentation="screen" open title="Create habit" fromConversation={false}
        actionRefreshKey="ready" leaving={false} onNavigate={() => {}} onReturn={() => {}}
        onClose={() => {}} onAttemptDismiss={() => {}} actions={<button type="button">Save habit</button>}>
        <input aria-label="Habit title" />
      </HabitCreateFrame>
    </QueryAppLayout>)
    expect(screen.getByRole('textbox', { name: 'Habit title' })).toBeInTheDocument()
    expect(screen.queryByText('onboarding.wizard.calendarTitle')).toBeNull()
    state.pathname = '/'
    await act(async () => view.rerender(<QueryAppLayout><div>Today</div></QueryAppLayout>))
    expect(screen.getByText('onboarding.wizard.calendarTitle')).toBeInTheDocument()
  })

  it.each([
    ['calendar', { hasImportedCalendar: false }, ['common.later', 'onboarding.wizard.calendarButton']],
    ['Astra', { hasImportedCalendar: true, hasSeenImportPrompt: false }, ['onboarding.wizard.importNotNow', 'onboarding.wizard.importButton']],
  ] as const)('pins the %s import actions in the sheet footer, never in the scrolling body', async (_prompt, flags, footer) => {
    state.profile = { hasProAccess: true, hasCompletedOnboarding: true, ...flags }
    render(<QueryAppLayout><div>Today</div></QueryAppLayout>)
    await act(async () => {})

    expect(sheetSlotButtons('sheet-actions')).toEqual(footer)
    expectSmallSheetActions()
    expect(sheetActionsUseActionPair()).toBe(true)
    expect(sheetSlotButtons('sheet-body')).toEqual([])
  })

  it.each([
    ['calendar', { hasImportedCalendar: false }, 'common.later'],
    ['Astra', { hasImportedCalendar: true, hasSeenImportPrompt: false }, 'onboarding.wizard.importNotNow'],
  ] as const)('uses a ghost pill for the %s import dismissal', async (_prompt, flags, quiet) => {
    state.profile = { hasProAccess: true, hasCompletedOnboarding: true, ...flags }
    render(<QueryAppLayout><div>Today</div></QueryAppLayout>)
    await act(async () => {})

    expect(screen.getByRole('button', { name: quiet })).toHaveAttribute('data-variant', 'ghost')
  })

  it('waits to offer calendar import while another sheet is open', async () => {
    state.profile = {
      hasProAccess: true,
      hasCompletedOnboarding: true,
      hasImportedCalendar: false,
    }
    useUIStore.getState().registerOpenOverlay('already-open')
    render(<QueryAppLayout><div>Today</div></QueryAppLayout>)
    expect(screen.queryByText('onboarding.wizard.calendarTitle')).toBeNull()

    await act(async () => useUIStore.getState().unregisterOpenOverlay('already-open'))
    expect(screen.getByText('onboarding.wizard.calendarTitle')).toBeInTheDocument()
  })

  it('waits to offer Astra import while another sheet is open', async () => {
    state.profile = {
      hasProAccess: true,
      hasCompletedOnboarding: true,
      hasImportedCalendar: true,
      hasSeenImportPrompt: false,
    }
    useUIStore.getState().registerOpenOverlay('already-open')
    render(<QueryAppLayout><div>Today</div></QueryAppLayout>)
    expect(screen.queryByText('onboarding.wizard.importTitle')).toBeNull()

    await act(async () => useUIStore.getState().unregisterOpenOverlay('already-open'))
    expect(screen.getByText('onboarding.wizard.importTitle')).toBeInTheDocument()
  })

  it('keeps the requested creation route when session, profile and habit count resolve', async () => {
    const view = render(<QueryAppLayout><div>Today loading</div></QueryAppLayout>)
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(state.push).toHaveBeenCalledExactlyOnceWith(buildHabitCreateHref({ from: '/', date: '2026-09-12' }))

    await act(async () => {
      setUIAccountScope('account-a')
      state.profile = { hasProAccess: true }
      state.count = 10
      state.countLoaded = true
      view.rerender(<QueryAppLayout><div>Today loaded</div></QueryAppLayout>)
    })

    expect(state.push).toHaveBeenCalledExactlyOnceWith(buildHabitCreateHref({ from: '/', date: '2026-09-12' }))
    expect(state.push).not.toHaveBeenCalledWith('/upgrade')

    await act(async () => setUIAccountScope('account-b'))
    expect(useUIStore.getState().showCreateModal).toBe(false)
  })

  it('pushes creation when count arrives before a Pro profile', () => {
    state.count = 10
    state.countLoaded = true
    render(<QueryAppLayout><div>Today loading</div></QueryAppLayout>)
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(state.push).toHaveBeenCalledExactlyOnceWith(buildHabitCreateHref({ from: '/', date: '2026-09-12' }))
    expect(state.push).not.toHaveBeenCalledWith('/upgrade')
  })

  it('refuses creation beside the action while offline without a shell toast', () => {
    state.isOnline = false
    render(<QueryAppLayout><div>Today</div></QueryAppLayout>)

    expect(screen.getByTestId('notice-slot')).not.toHaveTextContent('offline.title')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(screen.getByText('offline.create.title')).toBeInTheDocument()
    expect(screen.getByText('offline.create.reason')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Create habit' })).not.toBeInTheDocument()
    expect(state.push).not.toHaveBeenCalledWith('/upgrade')
  })

  it('clears a prior refusal after reconnecting', () => {
    state.isOnline = false
    const view = render(<QueryAppLayout><div>Today</div></QueryAppLayout>)
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(screen.getByText('offline.create.reason')).toBeInTheDocument()

    state.isOnline = true
    view.rerender(<QueryAppLayout><div>Today</div></QueryAppLayout>)
    expect(screen.queryByText('offline.create.reason')).not.toBeInTheDocument()

    state.isOnline = false
    view.rerender(<QueryAppLayout><div>Today</div></QueryAppLayout>)
    expect(screen.queryByText('offline.create.reason')).not.toBeInTheDocument()
  })

  it('shows queued feedback at the bottom of signed-out About', async () => {
    state.pathname = '/about'
    state.authenticated = false
    const view = render(<QueryAppLayout><div>About</div></QueryAppLayout>)
    act(() => { useAppToastStore.getState().showError('Account unavailable') })

    await screen.findByText('Account unavailable')
    expect(view.container.querySelector('[data-toast-page-host]')).toHaveTextContent('Account unavailable')
    expect(view.container.querySelector('[data-shell-notice]')).toBeNull()
  })

  it('shows the Reload action in the active compact Astra dialog', async () => {
    useUIStore.getState().setAstraConversationOpen(true)
    const view = render(<QueryAppLayout><div>Today</div></QueryAppLayout>)
    act(() => {
      useAppToastStore.getState().showQueued('App updated', 'Reload', vi.fn())
    })

    await screen.findByText('App updated')
    const dialog = screen.getByRole('dialog', { name: 'Astra conversation' })
    expect(dialog).toHaveTextContent('App updated')
    expect(dialog.querySelector('button')).toHaveTextContent('Reload')
    expect(view.container.querySelector('[data-shell-background]')).toHaveAttribute('inert')
    expect(view.container.querySelector('[data-shell-notice]')).not.toHaveTextContent('App updated')
  })

  it('keeps feedback inside the wide conversation', async () => {
    state.wide = true
    useUIStore.getState().setAstraConversationOpen(true)
    const view = render(<QueryAppLayout><div>Today</div></QueryAppLayout>)
    act(() => { useAppToastStore.getState().showError('Sync failed') })

    await screen.findByText('Sync failed')
    expect(view.container.querySelector('[data-conversation-body]')).toHaveTextContent('Sync failed')
    expect(view.container.querySelector('[data-shell-notice]')).not.toHaveTextContent('Sync failed')
  })
})
