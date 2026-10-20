import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Page, Response } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockConfigResponse, createMockHabit, createMockProfile } from '@orbit/shared/__tests__/factories'
import { appConfigSchema } from '@orbit/shared/types/config'
import { SmokeDomPage, expectSmokeDom } from '@/__tests__/support/smoke-dom'
import { holdAccount } from '@/__tests__/support/account-change'
import AppLayout from '@/app/(app)/layout'
import { DestinationShell } from '@/components/shell/destination-shell'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { HabitRow } from '@/components/habits/habit-row'
import { PlanSelection } from '@/components/upgrade/plan-selection'
import { Sheet } from '@/components/ui/sheet'
import { subscriptionPlansFixture } from '@/test-support/hermetic/mock-api/fixtures/subscription-plans'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { createSmokeHabit, expectAppNavigation, expectCheckout, logSmokeHabit } from '@/e2e/support/smoke-adapters'

const mocks = vi.hoisted(() => ({
  profile: undefined as ReturnType<typeof createMockProfile> | undefined,
  pathname: '/', wide: false, expired: false, online: true,
  create: vi.fn(), dismissCalendarImport: vi.fn(), dismissImportPrompt: vi.fn(),
  checkout: vi.fn(), suggestion: vi.fn(), toast: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() },
  searchParams: new URLSearchParams(),
}))

vi.mock('@playwright/test', () => ({ expect: expectSmokeDom }))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname, useParams: () => ({}),
  useRouter: () => mocks.router, useSearchParams: () => mocks.searchParams,
}))
vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a> }))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@/lib/providers', () => ({ Providers: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/lib/account-event-connection', () => ({ AccountEventConnection: () => null }))
vi.mock('@/app/(app)/today-provider', () => ({ TodayProvider: ({ children }: { children: ReactNode }) => children, useToday: () => undefined }))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null, CommandPaletteBackground: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/components/motion/route-transition-shell', () => ({ RouteTransitionShell: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profile, patchProfile: vi.fn() }),
  useHasProAccess: () => false, useTrialExpired: () => mocks.expired,
}))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => mocks.wide, useIsDesktop: () => mocks.wide }))
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: () => {} }))
vi.mock('@/components/navigation/notification-bell', () => ({ NotificationBell: () => null }))
vi.mock('@/hooks/use-timezone-auto-sync', () => ({ useTimezoneAutoSync: () => {} }))
vi.mock('@/hooks/use-onboarding-flush', () => ({ useOnboardingFlush: () => {} }))
vi.mock('@/hooks/use-retained-onboarding-guard', () => ({ useRetainedOnboardingGuard: () => false, useRetainedOnboardingSession: () => ({ open: false }) }))
vi.mock('@/hooks/use-onboarding-pro-pending', () => ({ useOnboardingProPending: () => false }))
vi.mock('@/hooks/use-onboarding-completion-queue', () => ({ useOnboardingCompletionQueue: () => false }))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabitCountLoaded: () => ({ count: 0, isLoaded: true }) }))
vi.mock('@/hooks/use-gamification', () => ({ useGamificationProfile: () => ({ crossedStreakMilestones: [], newAchievements: [] }) }))
vi.mock('@/hooks/use-chat-composer', () => ({ useChatComposer: () => ({ composerProps: {} }) }))
vi.mock('@/stores/onboarding-draft-store', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/stores/onboarding-draft-store')>(),
  useOnboardingDraftHydrated: () => true, useOnboardingHasPendingAnswers: () => false,
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showPersistentError: mocks.toast, showError: mocks.toast, showSuccess: mocks.toast, showInfo: mocks.toast }) }))
vi.mock('@/lib/actions/calendar', () => ({ dismissCalendarImport: mocks.dismissCalendarImport }))
vi.mock('@/lib/actions/onboarding', () => ({ dismissImportPrompt: mocks.dismissImportPrompt }))
vi.mock('@/components/navigation/notification-delete-notice', () => ({ NotificationDeleteNotice: () => null }))
vi.mock('@/components/ui/update-available-banner', () => ({ UpdateAvailableBanner: () => null }))
vi.mock('@/components/ui/app-toast-host', () => ({ AppToastHost: () => null }))
vi.mock('@/components/ui/expiry-warning', () => ({ ExpiryWarning: () => null }))
vi.mock('@/components/onboarding/retained-onboarding-overlay', () => ({ RetainedOnboardingOverlay: () => null }))
vi.mock('@/components/referral/referral-prompt', () => ({ ReferralPrompt: () => null }))
vi.mock('@/components/milestone-share/milestone-share-prompt', () => ({ MilestoneSharePrompt: () => null }))
vi.mock('@/components/marketing-consent/marketing-consent-prompt', () => ({ MarketingConsentPrompt: () => null }))
vi.mock('@/components/shell/composer', () => ({ Composer: () => null }))
vi.mock('@/components/gamification/celebration-panel', () => ({ CelebrationPanel: () => null }))
vi.mock('@/lib/api-fetch-i18n-provider', () => ({ ApiFetchI18nProvider: () => null }))
vi.mock('@/hooks/use-config', () => ({ useConfig: () => ({ config: appConfigSchema.parse(createMockConfigResponse()) }) }))
vi.mock('@/hooks/use-habits', () => ({
  useCreateHabit: () => ({ mutateAsync: mocks.create, isPending: false }),
  useCreateSubHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: mocks.suggestion, isPending: false }) }))
vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: () => ({ requestPermission: vi.fn() }) }))
vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ tags: [] }), useSuggestTags: () => ({ isPending: false, mutateAsync: mocks.suggestion }),
  useCreateTag: () => ({ mutateAsync: vi.fn() }), useUpdateTag: () => ({ mutateAsync: vi.fn() }), useDeleteTag: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/use-subscription-plans', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-subscription-plans')>(),
  useSubscriptionPlans: () => ({ plans: subscriptionPlansFixture }),
}))

function Checkout({ disabled = false }: { disabled?: boolean }) {
  const t = useTranslations()
  return <PlanSelection plans={subscriptionPlansFixture} isLoading={false} isError={false}
    isOnline checkoutDisabled={disabled} discountedAmount={(amount) => amount}
    checkoutLoading={null} onCheckout={mocks.checkout} onRetry={vi.fn()} t={t} />
}

function HabitCreation() {
  const [creating, setCreating] = useState(false)
  return <DestinationShell onCreate={() => { mocks.pathname = '/habits/new'; setCreating(true) }}>
    {creating ? <CreateHabitModal open presentation="screen" onOpenChange={() => { mocks.pathname = '/'; setCreating(false) }} /> : <h1>Today</h1>}
  </DestinationShell>
}

function Logging({ page, success = true }: { page: SmokeDomPage; success?: boolean }) {
  const [done, setDone] = useState(false)
  return <HabitRow habit={createMockHabit({ title: 'Smoke log' })} state={done ? 'done' : 'empty'}
    actions={{ onLog: () => {
      setDone(true)
      page.respond?.({
        request: () => ({ method: () => 'POST', headers: () => ({ 'next-action': '<action-id>' }) }),
        ok: () => success,
      } as unknown as Response)
    } }} />
}

function mount(children: ReactNode, locale: 'en' | 'pt-BR') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(children, { wrapper: ({ children }: { children: ReactNode }) => <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}>
    <QueryClientProvider client={queryClient}>
      <style>{`[data-shell-sidebar] { display: ${mocks.wide ? 'block' : 'none'} } [data-shell-tab-bar] { display: ${mocks.wide ? 'none' : 'block'} }`}</style>
      {children}
    </QueryClientProvider>
  </NextIntlClientProvider> })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pathname = '/'
  mocks.wide = false
  mocks.expired = false
  mocks.online = true
  mocks.profile = createMockProfile({ hasCompletedOnboarding: true, hasImportedCalendar: true, hasSeenImportPrompt: true })
  mocks.create.mockResolvedValue(undefined)
  mocks.dismissCalendarImport.mockResolvedValue(undefined)
  localStorage.clear()
  holdAccount('smoke-unit-account')
  useAuthStore.setState({ isAuthenticated: true, startExpiryMonitor: () => () => {} })
  useUIStore.setState(useUIStore.getInitialState())
})

afterEach(() => { cleanup(); useAuthStore.setState(useAuthStore.getInitialState()); localStorage.clear() })

describe.each(['en', 'pt-BR'] as const)('production smoke adapters in %s', (locale) => {
  it.each([false, true])('requires real navigation with the current shell, wide=%s', async (wide) => {
    mocks.wide = wide
    mount(<DestinationShell onCreate={() => {}}><h1>Today</h1></DestinationShell>, locale)
    await expectAppNavigation(new SmokeDomPage() as unknown as Page)
  })

  it('submits the real habit form once through its external footer button', async () => {
    mount(<HabitCreation />, locale)
    await createSmokeHabit(new SmokeDomPage() as unknown as Page, 'Smoke creation')
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({ title: 'Smoke creation' })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(mocks.suggestion).not.toHaveBeenCalled()
  })

  it('keeps a failed create red with the entered title retained', async () => {
    mocks.create.mockRejectedValue(new Error('Create request failed'))
    mount(<HabitCreation />, locale)
    await expect(createSmokeHabit(new SmokeDomPage() as unknown as Page, 'Smoke failure')).rejects.toThrow()
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('textbox')).toHaveValue('Smoke failure')
  })

  it('dismisses the real trial and subsequent calendar prompt before navigation', async () => {
    mocks.expired = true
    mocks.profile = createMockProfile({ hasCompletedOnboarding: true, hasImportedCalendar: false, hasSeenImportPrompt: true })
    mount(<AppLayout><h1>Today</h1></AppLayout>, locale)
    await screen.findByRole('dialog')
    await expectAppNavigation(new SmokeDomPage() as unknown as Page)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(localStorage.getItem('orbit_trial_expired_seen:smoke-unit-account')).toBe('1')
    expect(mocks.dismissCalendarImport).toHaveBeenCalledTimes(1)
    expect(mocks.router.push).not.toHaveBeenCalled()
  })

  it('dismisses the real calendar prompt and requires an enabled checkout without purchasing', async () => {
    mocks.pathname = '/upgrade'
    mocks.profile = createMockProfile({ hasCompletedOnboarding: true, hasImportedCalendar: false, hasSeenImportPrompt: true })
    mount(<AppLayout><Checkout /></AppLayout>, locale)
    await screen.findByRole('dialog')
    await expectCheckout(new SmokeDomPage() as unknown as Page)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.dismissCalendarImport).toHaveBeenCalledTimes(1)
    expect(mocks.checkout).not.toHaveBeenCalled()
  })

  it('handles known prompts that arrive after the initial navigation assertion', async () => {
    const page = new SmokeDomPage()
    const view = mount(<AppLayout><h1>Today</h1></AppLayout>, locale)
    await expectAppNavigation(page as unknown as Page)
    mocks.expired = true
    mocks.profile = createMockProfile({ hasCompletedOnboarding: true, hasImportedCalendar: false, hasSeenImportPrompt: true })
    view.rerender(<AppLayout><h1>Today</h1></AppLayout>)
    await screen.findByRole('dialog')
    await page.getByRole('link', { name: (locale === 'en' ? en : ptBR).nav.today, exact: true }).click()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.dismissCalendarImport).toHaveBeenCalledTimes(1)
  })

  it('leaves an unknown dialog blocking the flow', async () => {
    mount(<><DestinationShell onCreate={() => {}}><h1>Today</h1></DestinationShell>
      <Sheet open title="Unknown required decision"><p>Decision required</p></Sheet></>, locale)
    await expect(expectAppNavigation(new SmokeDomPage() as unknown as Page)).rejects.toThrow('undismissed dialog')
    expect(screen.getByRole('dialog', { name: 'Unknown required decision' })).toBeInTheDocument()
  })

  it('allows a dialog action while blocking an outside click', async () => {
    const inside = vi.fn()
    const outside = vi.fn()
    mount(<><button data-testid="outside-action" onClick={outside}>Outside</button>
      <Sheet open title="Unknown required decision">
        <button data-testid="inside-action" onClick={inside}>Inside</button>
      </Sheet></>, locale)
    const page = new SmokeDomPage()
    await page.getByTestId('inside-action').click()
    expect(inside).toHaveBeenCalledTimes(1)
    await expect(page.getByTestId('outside-action').click()).rejects.toThrow('undismissed dialog')
    expect(outside).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Unknown required decision' })).toBeInTheDocument()
  })

  it('rejects disabled checkout', async () => {
    mount(<Checkout disabled />, locale)
    await expect(expectCheckout(new SmokeDomPage() as unknown as Page)).rejects.toThrow(/enabled/)
    expect(mocks.checkout).not.toHaveBeenCalled()
  })

  it('rejects a failed logging response despite the optimistic check', async () => {
    const page = new SmokeDomPage()
    mount(<Logging page={page} success={false} />, locale)
    await expect(logSmokeHabit(page as unknown as Page, 'Smoke log')).rejects.toThrow(/truthy/)
  })

  it('respects the real logging control disabled reason', async () => {
    mount(<HabitRow habit={createMockHabit({ title: 'Smoke log' })}
      completionReadOnly completionReason="Logging unavailable" />, locale)
    await expect(logSmokeHabit(new SmokeDomPage() as unknown as Page, 'Smoke log')).rejects.toThrow(/aria-disabled/)
  })
})
