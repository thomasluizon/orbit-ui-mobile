import { use, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { act, cleanup, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi, afterEach } from 'vitest'
import { RequestCookies } from 'next/dist/compiled/@edge-runtime/cookies'
import RootLayout from '@/app/layout'
import AppLayout from '@/app/(app)/layout'
import AuthLayout from '@/app/(auth)/layout'
import { useAuthStore } from '@/stores/auth-store'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useUIStore } from '@/stores/ui-store'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

const mocks = vi.hoisted(() => ({
  cookie: '',
  fetch: vi.fn(),
  pathname: '/about',
  searchPending: false,
  searchParams: new URLSearchParams(),
  router: { prefetch: vi.fn(), replace: vi.fn() },
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => new RequestCookies(new Headers({ cookie: mocks.cookie })) }))
vi.mock('@/app/fonts', () => ({ geist: {}, geistMono: {}, spaceGrotesk: {} }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'en', getMessages: async () => ({}) }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, NextIntlClientProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => mocks.router,
  useSearchParams: () => {
    if (mocks.searchPending) use(new Promise<URLSearchParams>(() => {}))
    return mocks.searchParams
  },
}))
vi.mock('next/dynamic', () => ({
  default: () => (props: { initialDate?: string | null }) =>
    'initialDate' in props ? <div data-testid="create-habit-modal">{props.initialDate}</div> : null,
}))
vi.mock('@vercel/analytics/next', () => ({ Analytics: () => null }))
vi.mock('@vercel/speed-insights/next', () => ({ SpeedInsights: () => null }))
vi.mock('@/components/navigation/navigation-history-tracker', () => ({ NavigationHistoryTracker: () => null }))
vi.mock('@/components/ui/throttle-screen', () => ({ ThrottleScreen: () => null }))
vi.mock('@/lib/providers', () => ({ Providers: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/lib/account-event-connection', () => ({ AccountEventConnection: () => null }))
vi.mock('@/app/(app)/today-provider', () => ({ TodayProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/components/shell/destination-shell', () => ({ DestinationShell: ({ children, notice }: { children: ReactNode; notice?: ReactNode }) => <main aria-label="Destination shell">{children}<div data-shell-notice="">{notice}</div></main> }))
vi.mock('@/components/command/command-palette', () => ({ CommandPaletteBackground: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/components/motion/route-transition-shell', () => ({ RouteTransitionShell: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: null }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-timezone-auto-sync', () => ({ useTimezoneAutoSync: () => {} }))
vi.mock('@/hooks/use-onboarding-flush', () => ({ useOnboardingFlush: () => {} }))
vi.mock('@/hooks/use-retained-onboarding-guard', () => ({ useRetainedOnboardingGuard: () => false }))
vi.mock('@/hooks/use-habits', () => ({ useTotalHabitCount: () => 0 }))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabitCountLoaded: () => ({ count: 0, isLoaded: false }) }))
vi.mock('@/hooks/use-gamification', () => ({ useGamificationProfile: () => ({ crossedStreakMilestones: [], newAchievements: [] }) }))
vi.mock('@/hooks/use-chat-composer', () => ({ useChatComposer: () => ({ composerProps: {} }) }))
vi.mock('@/stores/onboarding-draft-store', () => ({
  useOnboardingDraftHydrated: () => true,
  useOnboardingHasPendingAnswers: () => false,
  useOnboardingDraftStore: (
    selector: (state: { pushRegistrationFailed: boolean }) => unknown,
  ) => selector({ pushRegistrationFailed: false }),
}))
vi.mock('@/lib/actions/calendar', () => ({ dismissCalendarImport: vi.fn() }))
vi.mock('@/lib/actions/onboarding', () => ({ dismissImportPrompt: vi.fn() }))
vi.mock('@/components/navigation/notification-delete-notice', () => ({ NotificationDeleteNotice: () => null }))
vi.mock('@/components/ui/update-available-banner', () => ({ UpdateAvailableBanner: () => null }))
vi.mock('@/components/ui/trial-expired-modal', () => ({ TrialExpiredModal: () => null }))
vi.mock('@/components/ui/expiry-warning', () => ({ ExpiryWarning: () => null }))
vi.mock('@/components/onboarding/retained-onboarding-overlay', () => ({ RetainedOnboardingOverlay: () => null }))
vi.mock('@/components/referral/referral-prompt', () => ({ ReferralPrompt: () => null }))
vi.mock('@/components/milestone-share/milestone-share-prompt', () => ({ MilestoneSharePrompt: () => null }))
vi.mock('@/components/marketing-consent/marketing-consent-prompt', () => ({ MarketingConsentPrompt: () => null }))
vi.mock('@/components/shell/composer', () => ({ Composer: () => null }))
vi.mock('@/lib/api-fetch-i18n-provider', () => ({ ApiFetchI18nProvider: () => null }))

beforeEach(() => {
  mocks.cookie = ''
  mocks.pathname = '/about'
  mocks.searchPending = false
  mocks.searchParams = new URLSearchParams()
  mocks.router.replace.mockClear()
  mocks.fetch.mockReset()
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ expiresAt: Date.now() + 3_600_000 })))
  vi.stubGlobal('fetch', mocks.fetch)
  useAuthStore.setState({ isAuthenticated: false, user: null, expiresAt: null })
  useUIStore.setState({ activeView: 'today', showCreateModal: false })
  useAppToastStore.setState({ currentToast: null, queue: [] })
})

it('renders app feedback inside the destination notice slot', () => {
  mocks.pathname = '/'
  const view = render(<AppLayout><p>Today content</p></AppLayout>)
  act(() => { useAppToastStore.getState().showError('x') })
  expect(view.container.querySelector('[data-shell-notice] [data-kind="neutral"]')).toBeInTheDocument()
  expect(screen.getByRole('status')).toBeInTheDocument()
})

it('places signed-out feedback at the bottom of the page', () => {
  const view = render(<AuthLayout><p>Sign in</p></AuthLayout>)
  act(() => { useAppToastStore.getState().showError('x') })
  expect(view.container.querySelector('[data-toast-page-host] [data-kind="neutral"]')).toBeInTheDocument()
  expect(view.container.querySelector('[data-toast-page-host]')).toHaveClass('bottom-0')
})

it('places public About feedback at the bottom of the page', () => {
  const view = render(<AppLayout><p>About content</p></AppLayout>)
  act(() => { useAppToastStore.getState().showError('x') })
  expect(view.container.querySelector('[data-toast-page-host] [data-kind="neutral"]')).toBeInTheDocument()
  expect(view.container.querySelector('[data-shell-notice]')).toBeNull()
})

it('keeps the Today shell and content in server markup while search parameters are pending', () => {
  mocks.pathname = '/'
  mocks.searchPending = true

  const html = renderToString(<AppLayout><p>Today content</p></AppLayout>)

  expect(html).toContain('Destination shell')
  expect(html).toContain('Today content')
})

it('opens an Astra deep link once while the shell rerenders', () => {
  mocks.pathname = '/'
  mocks.searchParams = new URLSearchParams({ astra: 'open' })
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ expiresAt: Date.now() + 3_600_000 })))

  render(<AppLayout><p>Today content</p></AppLayout>)

  expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith('/')
})

it('passes the selected Today date to the create modal', () => {
  mocks.pathname = '/'
  mocks.searchParams = new URLSearchParams({ date: '2026-08-20' })
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ expiresAt: Date.now() + 3_600_000 })))

  render(<AppLayout><p>Today content</p></AppLayout>)
  act(() => useUIStore.getState().setShowCreateModal(true))

  expect(screen.getByTestId('create-habit-modal')).toHaveTextContent('2026-08-20')
})

it.each(['auth_token', 'refresh_token'])('restores the destination shell on a hard load of About with %s', async (cookieName) => {
  mocks.cookie = `${cookieName}=session-placeholder`
  let resolveSession!: (response: Response) => void
  mocks.fetch.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ expiresAt: Date.now() + 3_600_000 }))))
  mocks.fetch.mockReturnValueOnce(new Promise<Response>((resolve) => { resolveSession = resolve }))
  render(await RootLayout({ children: <AppLayout><p>About content</p></AppLayout> }), { container: document })
  expect(screen.getByText('About content')).toBeInTheDocument()
  expect(mocks.fetch).toHaveBeenCalledWith('/api/auth/session')
  await act(async () => resolveSession(new Response(JSON.stringify({ expiresAt: Date.now() + 3_600_000 }))))
  expect(screen.getByRole('main', { name: 'Destination shell' })).toHaveTextContent('About content')
  cleanup()
  mocks.fetch.mockClear()
  mocks.cookie = ''
  useAuthStore.setState({ isAuthenticated: false, user: null, expiresAt: null })
  render(await RootLayout({ children: <AppLayout><p>Public About content</p></AppLayout> }), { container: document })
  expect(screen.getByText('Public About content')).toBeInTheDocument()
  expect(screen.queryByRole('main', { name: 'Destination shell' })).not.toBeInTheDocument()
  expect(mocks.fetch).not.toHaveBeenCalled()
})
