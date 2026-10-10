import { QueryClientProvider } from '@tanstack/react-query'
import { use, type ReactNode } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { RequestCookies } from 'next/dist/compiled/@edge-runtime/cookies'
import AppLayout from '@/app/(app)/layout'
import { SessionCookieProvider } from '@/lib/session-cookie-provider'
import { getQueryClient } from '@/lib/query-client'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { resetAuthStore } from '@/__tests__/support/account-change'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { profileKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import * as profileActions from '@/lib/actions/profile'
import * as onboardingActions from '@/lib/actions/onboarding'
import { GET } from '@/app/api/auth/session/route'
import { PreloadedProfileContext, useProfile } from '@/hooks/use-profile'
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
  const queryClient = getQueryClient()
  return <QueryClientProvider client={queryClient}><AppLayout>{children}</AppLayout></QueryClientProvider>
}

function ProfileSnapshot() {
  const { profile } = useProfile()
  return <span data-testid="profile-snapshot">{profile?.name ?? 'waiting'}</span>
}

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
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
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
  clearBackendErrors: vi.fn(),
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
vi.mock('@/lib/actions/calendar', () => ({ dismissCalendarImport: vi.fn() }))
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

const serverSession = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/auth-api')>(),
  resolveServerSession: serverSession,
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => new RequestCookies(new Headers()) }))

function sessionFor(accountId: string) {
  const claims = { 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier': accountId }
  return { token: `header.${btoa(JSON.stringify(claims))}.signature`, expiresAt: Date.now() + 3_600_000, refreshFailed: false }
}

beforeEach(async () => {
  vi.stubGlobal('fetch', mocks.fetch)
  mocks.fetch.mockReset()
  await resetAuthStore()
  getQueryClient().clear()
  mocks.fetch.mockReset()
  useUIStore.setState(useUIStore.getInitialState())
  useAppToastStore.setState({ currentToast: null, queue: [] })
  useOnboardingDraftStore.getState().reset()
  await useOnboardingDraftStore.persist.rehydrate()
  useOnboardingDraftStore.getState().setAccountScope('account-a')
  useOnboardingDraftStore.getState().bufferWeekStartDay(1)
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({ resolvedOptions: () => ({ timeZone: 'America/Sao_Paulo' }) }) as Intl.DateTimeFormat)
  serverSession.mockReset()
})

afterEach(() => {
  cleanup()
  getQueryClient().clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each([
  { replacedCookie: false, preloaded: false },
  { replacedCookie: true, preloaded: false },
  { replacedCookie: false, preloaded: true },
  { replacedCookie: true, preloaded: true },
])('waits for the held account before writes: replaced=$replacedCookie, preloaded=$preloaded', async ({ replacedCookie, preloaded }) => {
  serverSession.mockResolvedValue(sessionFor('account-a'))
  const validatedSession = await GET()
  let answerSession: (response: Response) => void = () => {}
  const sessionResponse = new Promise<Response>((resolve) => { answerSession = resolve })
  let answerAction: (session: ReturnType<typeof sessionFor>) => void = () => {}
  const actionSession = new Promise<ReturnType<typeof sessionFor>>((resolve) => { answerAction = resolve })
  serverSession.mockImplementation(() => actionSession)
  const earlierProfile = createMockProfile({ name: 'Earlier profile', timeZone: null, themePreference: null, hasCompletedOnboarding: false })
  getQueryClient().setQueryData(profileKeys.detail(), earlierProfile)
  mocks.fetch.mockImplementation(async (input: string) => {
    if (input === '/api/auth/session') return (await sessionResponse).clone()
    if (input === API.profile.get) return new Response(JSON.stringify(earlierProfile))
    return new Response(null, { status: 204 })
  })
  const timezoneWrite = vi.spyOn(profileActions, 'updateTimezone')
  const themeWrite = vi.spyOn(profileActions, 'updateThemePreference')
  const onboardingWrite = vi.spyOn(onboardingActions, 'applyOnboarding')
  const sessionCheck = useAuthStore.getState().checkSession()
  const view = render(
    <SessionCookieProvider hasSessionCookie>
      <PreloadedProfileContext.Provider value={preloaded ? earlierProfile : undefined}>
        <QueryAppLayout><p>About content</p><ProfileSnapshot /></QueryAppLayout>
      </PreloadedProfileContext.Provider>
    </SessionCookieProvider>,
  )
  const shell = screen.getByRole('main', { name: 'Destination shell' })
  const content = screen.getByText('About content')
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  expect(useAuthStore.getState().isAuthenticated).toBe(false)
  expect(timezoneWrite).not.toHaveBeenCalled()
  expect(themeWrite).not.toHaveBeenCalled()
  expect(onboardingWrite).not.toHaveBeenCalled()
  expect(mocks.fetch.mock.calls.filter(([input]) => input === API.profile.get)).toHaveLength(0)
  expect(screen.getByTestId('profile-snapshot')).toHaveTextContent('Earlier profile')
  await act(async () => { answerSession(validatedSession); await sessionCheck })
  await waitFor(() => {
    expect(timezoneWrite).toHaveBeenCalledWith({ timeZone: 'America/Sao_Paulo' }, 'account-a')
    expect(themeWrite).toHaveBeenCalledWith(expect.anything(), 'account-a')
    expect(onboardingWrite).toHaveBeenCalledWith(expect.anything(), 'account-a')
  })
  expect(screen.getByRole('main', { name: 'Destination shell' })).toBe(shell)
  expect(screen.getByText('About content')).toBe(content)
  await act(async () => { answerAction(sessionFor(replacedCookie ? 'account-b' : 'account-a')) })
  if (replacedCookie) {
    await waitFor(() => expect(view.container).toHaveTextContent('errors.api.accountChanged'))
    expect(mocks.fetch.mock.calls.filter(([input]) => input.startsWith('http'))).toHaveLength(0)
  } else {
    await waitFor(() => expect(useOnboardingDraftStore.getState().hasPendingAnswers()).toBe(false))
    expect(mocks.fetch.mock.calls.filter(([input]) => input.endsWith(API.profile.timezone))).not.toHaveLength(0)
  }
})
