import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { use, useState, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi, afterEach } from 'vitest'
import { RequestCookies } from 'next/dist/compiled/@edge-runtime/cookies'
import RootLayout from '@/app/layout'
import AppLayout from '@/app/(app)/layout'
import AuthLayout from '@/app/(auth)/layout'
import AppNotFound from '@/app/(app)/not-found'
import { useAuthStore } from '@/stores/auth-store'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useUIStore } from '@/stores/ui-store'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

const mocks = vi.hoisted(() => ({
  cookie: '',
  fetch: vi.fn(),
  pathname: '/about',
  params: {} as { missing?: string[] },
  wide: false,
  searchPending: false,
  searchParams: new URLSearchParams(),
  router: { prefetch: vi.fn(), replace: vi.fn(), push: vi.fn() },
  validateHabit: vi.fn(),
}))
function QueryAppLayout({ children }: { children: import('react').ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return <QueryClientProvider client={queryClient}><AppLayout>{children}</AppLayout></QueryClientProvider>
}

vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => new RequestCookies(new Headers({ cookie: mocks.cookie })) }))
vi.mock('@/app/fonts', () => ({ geist: {}, geistMono: {}, spaceGrotesk: {} }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'en', getMessages: async () => ({}) }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en', NextIntlClientProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useParams: () => mocks.params,
  useRouter: () => mocks.router,
  useSearchParams: () => {
    if (mocks.searchPending) use(new Promise<URLSearchParams>(() => {}))
    return mocks.searchParams
  },
}))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@/components/navigation/navigation-history-tracker', () => ({ NavigationHistoryTracker: () => null }))
vi.mock('@/components/ui/throttle-screen', () => ({ ThrottleScreen: () => null }))
vi.mock('@/lib/providers', () => ({ Providers: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/lib/account-event-connection', () => ({ AccountEventConnection: () => null }))
vi.mock('@/app/(app)/today-provider', () => ({ TodayProvider: ({ children }: { children: ReactNode }) => children, useToday: () => '2026-09-12' }))
vi.mock('@/components/shell/shell-wide', () => ({
  ShellWide: ({ children, composer, notice, onCreate }: { children: ReactNode; composer?: ReactNode; notice?: ReactNode; onCreate: () => void }) => (
    <main aria-label="Destination shell"><nav aria-label="nav.mainNavigation" /><button onClick={onCreate}>Create habit</button>{composer}{children}<div data-shell-notice="">{notice}</div></main>
  ),
}))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null, CommandPaletteBackground: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/hooks/use-is-desktop', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-is-desktop')>(),
  useIsWideDesktop: () => mocks.wide,
}))
vi.mock('@/components/motion/route-transition-shell', () => ({ RouteTransitionShell: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: null }), useHasProAccess: () => true }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-timezone-auto-sync', () => ({ useTimezoneAutoSync: () => {} }))
vi.mock('@/hooks/use-onboarding-flush', () => ({ useOnboardingFlush: () => {} }))
vi.mock('@/hooks/use-retained-onboarding-guard', () => ({ useRetainedOnboardingGuard: () => false }))
vi.mock('@/hooks/use-habits', () => ({
  useTotalHabitCount: () => 0,
  useCreateHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateSubHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/use-habit-form', () => ({ useHabitForm: () => ({
  form: {
    watch: (field: string) => field === 'title' ? 'Test Habit' : field === 'scheduledReminders' ? [] : undefined,
    reset: vi.fn(),
    setValue: vi.fn(),
    trigger: vi.fn().mockResolvedValue(true),
    formState: { isDirty: false },
  },
  validateAll: mocks.validateHabit,
  setGeneral: vi.fn(),
}) }))
vi.mock('@/hooks/use-tag-selection', () => ({ useTagSelection: () => ({ selectedTagIds: [], resetTags: vi.fn() }) }))
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-config', () => ({ useConfig: () => ({ config: { features: { 'habits.subHabits': { enabled: true, planRequirement: 'Pro' } } } }) }))
vi.mock('@/hooks/use-dismiss-guard', () => ({ useDismissGuard: () => ({ canDismiss: true, requestDismiss: vi.fn() }) }))
vi.mock('@/components/habits/habit-form-fields', () => ({ HabitFormFields: () => <input aria-label="Habit title" defaultValue="Test Habit" /> }))
vi.mock('@/components/habits/create-habit-modal/sub-habit-editor', () => ({ SubHabitEditor: () => null }))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabitCountLoaded: () => ({ count: 0, isLoaded: false }) }))
vi.mock('@/hooks/use-gamification', () => ({ useGamificationProfile: () => ({ crossedStreakMilestones: [], newAchievements: [] }) }))
vi.mock('@/hooks/use-chat-composer', () => ({ useChatComposer: () => ({ composerProps: {} }) }))
vi.mock('@/stores/onboarding-draft-store', () => ({
  useOnboardingDraftHydrated: () => true,
  useOnboardingHasPendingAnswers: () => false,
  useOnboardingDraftStore: Object.assign(
    (selector: (state: { pushRegistrationFailed: boolean }) => unknown) => selector({ pushRegistrationFailed: false }),
    { getState: () => ({ markOnboardingLocallyDone: vi.fn(), reset: vi.fn() }), persist: { rehydrate: vi.fn(async () => {}) } },
  ),
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
vi.mock('@/components/shell/composer', () => ({ Composer: () => <div data-testid="composer" /> }))
vi.mock('@/lib/api-fetch-i18n-provider', () => ({ ApiFetchI18nProvider: () => null }))

beforeEach(() => {
  mocks.cookie = ''
  mocks.pathname = '/about'
  mocks.params = {}
  mocks.wide = false
  mocks.searchPending = false
  mocks.searchParams = new URLSearchParams()
  mocks.validateHabit.mockReset()
  mocks.router.replace.mockClear()
  mocks.router.push.mockClear()
  mocks.fetch.mockReset()
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ expiresAt: Date.now() + 3_600_000 })))
  vi.stubGlobal('fetch', mocks.fetch)
  useAuthStore.setState({ isAuthenticated: false, user: null, expiresAt: null })
  useUIStore.setState(useUIStore.getInitialState())
  useAppToastStore.setState({ currentToast: null, queue: [] })
})

it('renders app feedback inside the destination notice slot', () => {
  mocks.pathname = '/'
  const view = render(<QueryAppLayout><p>Today content</p></QueryAppLayout>)
  act(() => { useAppToastStore.getState().showError('x') })
  expect(view.container.querySelector('[data-shell-notice] [data-kind="neutral"]')).toBeInTheDocument()
  expect(screen.getByRole('status')).toBeInTheDocument()
})

it('keeps failed form feedback and its action reachable on the creation screen', async () => {
  mocks.pathname = '/habits/new'
  mocks.validateHabit.mockReturnValue('Habit name is required')
  const action = vi.fn()
  const view = render(<QueryAppLayout><CreateHabitModal open presentation="screen" onOpenChange={() => {}} /></QueryAppLayout>)

  fireEvent.submit(view.container.querySelector('form')!)
  await waitFor(() => expect(mocks.validateHabit).toHaveBeenCalledOnce())
  await waitFor(() => expect(view.container.querySelector('[data-shell-notice] [data-kind="neutral"]')).toHaveTextContent('Habit name is required'))

  act(() => { useAppToastStore.getState().showQueued('Retry save', 'Retry', action) })
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(action).toHaveBeenCalledOnce()
  expect(view.container.querySelector('form')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('places signed-out feedback at the bottom of the page', () => {
  const view = render(<AuthLayout><p>Sign in</p></AuthLayout>)
  act(() => { useAppToastStore.getState().showError('x') })
  expect(view.container.querySelector('[data-toast-page-host] [data-kind="neutral"]')).toBeInTheDocument()
  expect(view.container.querySelector('[data-toast-page-host]')).toHaveClass('bottom-0')
})

it('places public About feedback at the bottom of the page', () => {
  const view = render(<QueryAppLayout><p>About content</p></QueryAppLayout>)
  act(() => { useAppToastStore.getState().showError('x') })
  expect(view.container.querySelector('[data-toast-page-host] [data-kind="neutral"]')).toBeInTheDocument()
  expect(view.container.querySelector('[data-shell-notice]')).toBeNull()
})

it('keeps the Today shell and content in server markup while search parameters are pending', () => {
  mocks.pathname = '/'
  mocks.searchPending = true

  const html = renderToString(<QueryAppLayout><p>Today content</p></QueryAppLayout>)

  expect(html).toContain('Destination shell')
  expect(html).toContain('Today content')
})

it('opens an Astra deep link once while the shell rerenders', () => {
  mocks.pathname = '/'
  mocks.searchParams = new URLSearchParams({ astra: 'open' })
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ expiresAt: Date.now() + 3_600_000 })))

  render(<QueryAppLayout><p>Today content</p></QueryAppLayout>)

  expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith('/')
})

it.each([false, true])('renders an authenticated unknown path without a composer at wide=%s', (wide) => {
  mocks.pathname = '/nao-existe'
  mocks.params = { missing: ['nao-existe'] }
  mocks.wide = wide
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ expiresAt: Date.now() + 3_600_000 })))
  useAuthStore.setState({ isAuthenticated: true })
  render(<QueryAppLayout><AppNotFound /></QueryAppLayout>)
  expect(screen.getByRole('navigation', { name: 'nav.mainNavigation' })).toBeInTheDocument()
  expect(screen.queryByTestId('composer')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'notFoundPage.title' })).toBeInTheDocument()
})

it.each([false, true])('keeps the Hoje composer at wide=%s', (wide) => {
  mocks.pathname = '/'
  mocks.wide = wide
  useAuthStore.setState({ isAuthenticated: true })
  render(<QueryAppLayout><p>Today content</p></QueryAppLayout>)
  expect(screen.getByTestId('composer')).toBeInTheDocument()
})

it('renders an unauthenticated unknown public path without the shell', () => {
  mocks.pathname = '/terms/x'
  render(<QueryAppLayout><AppNotFound /></QueryAppLayout>)
  expect(screen.getByRole('heading', { name: 'notFoundPage.title' })).toBeInTheDocument()
  expect(screen.getByRole('main')).toHaveClass('min-h-dvh')
  expect(screen.queryByRole('navigation', { name: 'nav.mainNavigation' })).not.toBeInTheDocument()
  expect(screen.queryByTestId('composer')).not.toBeInTheDocument()
})

it('keeps the shell shape while a protected unknown path restores its session', () => {
  mocks.pathname = '/nao-existe'
  mocks.params = { missing: ['nao-existe'] }
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ expiresAt: Date.now() + 3_600_000 })))
  render(<QueryAppLayout><AppNotFound /></QueryAppLayout>)
  expect(screen.getByRole('navigation', { name: 'nav.mainNavigation' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'notFoundPage.title' })).toBeInTheDocument()
  expect(screen.queryByTestId('composer')).not.toBeInTheDocument()
  expect(screen.getByRole('main', { name: 'Destination shell' }).querySelector('main')).toBeNull()
})

it('pushes creation from Today with its selected date', () => {
  mocks.pathname = '/'
  mocks.searchParams = new URLSearchParams({ date: '2026-08-20' })
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ expiresAt: Date.now() + 3_600_000 })))

  render(<QueryAppLayout><p>Today content</p></QueryAppLayout>)
  act(() => useUIStore.getState().setShowCreateModal(true))

  expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith('/habits/new?date=2026-08-20&from=%2F%3Fdate%3D2026-08-20')
  expect(useUIStore.getState().showCreateModal).toBe(false)
})

it('pushes creation from the sidebar and retains its origin', () => {
  mocks.pathname = '/calendar'
  render(<QueryAppLayout><p>Calendar content</p></QueryAppLayout>)
  fireEvent.click(screen.getByRole('button', { name: 'Create habit' }))
  expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith('/habits/new?from=%2Fcalendar')
})

it('preserves the current creation screen when the palette requests Create again', () => {
  mocks.pathname = '/habits/new'
  render(<QueryAppLayout><input aria-label="Draft title" defaultValue="Walk" /></QueryAppLayout>)
  fireEvent.click(screen.getByRole('button', { name: 'Create habit' }))
  expect(mocks.router.push).not.toHaveBeenCalled()
  expect(screen.getByRole('textbox', { name: 'Draft title' })).toHaveValue('Walk')
  expect(useUIStore.getState().showCreateModal).toBe(false)
})

it('carries conversation provenance while closing its overlay', () => {
  mocks.pathname = '/'
  render(<QueryAppLayout><p>Today content</p></QueryAppLayout>)
  act(() => {
    useUIStore.getState().setAstraConversationOpen(true)
    useUIStore.getState().setShowCreateModal(true)
  })
  expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith('/habits/new?date=2026-09-12&from=%2F&origin=conversation')
  expect(useUIStore.getState().astraConversationOpen).toBe(false)
})

it.each(['auth_token', 'refresh_token'])('restores the destination shell on a hard load of About with %s', async (cookieName) => {
  mocks.cookie = `${cookieName}=session-placeholder`
  let resolveSession!: (response: Response) => void
  mocks.fetch.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ expiresAt: Date.now() + 3_600_000 }))))
  mocks.fetch.mockReturnValueOnce(new Promise<Response>((resolve) => { resolveSession = resolve }))
  render(await RootLayout({ children: <QueryAppLayout><p>About content</p></QueryAppLayout> }), { container: document })
  expect(screen.getByText('About content')).toBeInTheDocument()
  expect(mocks.fetch).toHaveBeenCalledWith('/api/auth/session', undefined)
  await act(async () => resolveSession(new Response(JSON.stringify({ expiresAt: Date.now() + 3_600_000 }))))
  expect(screen.getByRole('main', { name: 'Destination shell' })).toHaveTextContent('About content')
  cleanup()
  mocks.fetch.mockClear()
  mocks.cookie = ''
  useAuthStore.setState({ isAuthenticated: false, user: null, expiresAt: null })
  render(await RootLayout({ children: <QueryAppLayout><p>Public About content</p></QueryAppLayout> }), { container: document })
  expect(screen.getByText('Public About content')).toBeInTheDocument()
  expect(screen.queryByRole('main', { name: 'Destination shell' })).not.toBeInTheDocument()
  expect(mocks.fetch).not.toHaveBeenCalled()
})
