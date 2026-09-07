import type { ReactNode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { RequestCookies } from 'next/dist/compiled/@edge-runtime/cookies'
import RootLayout from '@/app/layout'
import AppLayout from '@/app/(app)/layout'
import { useAuthStore } from '@/stores/auth-store'

const mocks = vi.hoisted(() => ({ cookie: '', fetch: vi.fn(), router: { prefetch: vi.fn() } }))
vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => new RequestCookies(new Headers({ cookie: mocks.cookie })) }))
vi.mock('next/font/google', () => ({ Geist: () => ({}), Geist_Mono: () => ({}), Space_Grotesk: () => ({}) }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'en', getMessages: async () => ({}) }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, NextIntlClientProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('next/navigation', () => ({ usePathname: () => '/about', useRouter: () => mocks.router, useSearchParams: () => new URLSearchParams() }))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('sonner', () => ({ Toaster: () => null }))
vi.mock('@vercel/analytics/next', () => ({ Analytics: () => null }))
vi.mock('@vercel/speed-insights/next', () => ({ SpeedInsights: () => null }))
vi.mock('@/components/navigation/navigation-history-tracker', () => ({ NavigationHistoryTracker: () => null }))
vi.mock('@/components/ui/throttle-screen', () => ({ ThrottleScreen: () => null }))
vi.mock('@/lib/providers', () => ({ Providers: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/app/(app)/today-provider', () => ({ TodayProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/components/shell/destination-shell', () => ({ DestinationShell: ({ children }: { children: ReactNode }) => <main aria-label="Destination shell">{children}</main> }))
vi.mock('@/components/command/command-palette', () => ({ CommandPaletteBackground: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/components/motion/route-transition-shell', () => ({ RouteTransitionShell: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: null }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-timezone-auto-sync', () => ({ useTimezoneAutoSync: () => {} }))
vi.mock('@/hooks/use-onboarding-flush', () => ({ useOnboardingFlush: () => {} }))
vi.mock('@/hooks/use-retained-onboarding-guard', () => ({ useRetainedOnboardingGuard: () => false }))
vi.mock('@/hooks/use-habits', () => ({ useTotalHabitCount: () => 0 }))
vi.mock('@/hooks/use-gamification', () => ({ useGamificationProfile: () => ({ crossedStreakMilestones: [], newAchievements: [] }) }))
vi.mock('@/hooks/use-chat-composer', () => ({ useChatComposer: () => ({ composerProps: {} }) }))
vi.mock('@/stores/onboarding-draft-store', () => ({ useOnboardingDraftHydrated: () => true, useOnboardingHasPendingAnswers: () => false }))
vi.mock('@/app/actions/calendar', () => ({ dismissCalendarImport: vi.fn() }))
vi.mock('@/app/actions/onboarding', () => ({ dismissImportPrompt: vi.fn() }))
vi.mock('@/components/navigation/notification-delete-notice', () => ({ NotificationDeleteNotice: () => null }))
vi.mock('@/components/ui/update-available-banner', () => ({ UpdateAvailableBanner: () => null }))
vi.mock('@/components/ui/back-to-top', () => ({ BackToTop: () => null }))
vi.mock('@/components/ui/trial-expired-modal', () => ({ TrialExpiredModal: () => null }))
vi.mock('@/components/ui/expiry-warning', () => ({ ExpiryWarning: () => null }))
vi.mock('@/components/ui/push-prompt', () => ({ PushPrompt: () => null }))
vi.mock('@/components/goals/create-goal-modal', () => ({ CreateGoalModal: () => null }))
vi.mock('@/components/onboarding/retained-onboarding-overlay', () => ({ RetainedOnboardingOverlay: () => null }))
vi.mock('@/components/gamification/streak-celebration', () => ({ StreakCelebration: () => null }))
vi.mock('@/components/gamification/all-done-celebration', () => ({ AllDoneCelebration: () => null }))
vi.mock('@/components/gamification/goal-completed-celebration', () => ({ GoalCompletedCelebration: () => null }))
vi.mock('@/components/gamification/level-up-overlay', () => ({ LevelUpOverlay: () => null }))
vi.mock('@/components/referral/referral-prompt', () => ({ ReferralPrompt: () => null }))
vi.mock('@/components/milestone-share/milestone-share-prompt', () => ({ MilestoneSharePrompt: () => null }))
vi.mock('@/components/marketing-consent/marketing-consent-prompt', () => ({ MarketingConsentPrompt: () => null }))
vi.mock('@/components/tour/tour-provider', () => ({ TourProvider: () => null }))
vi.mock('@/components/tour/tour-overlay', () => ({ TourOverlay: () => null }))
vi.mock('@/components/shell/composer', () => ({ Composer: () => null }))
vi.mock('@/lib/api-fetch-i18n-provider', () => ({ ApiFetchI18nProvider: () => null }))

beforeEach(() => {
  mocks.cookie = ''
  mocks.fetch.mockReset()
  vi.stubGlobal('fetch', mocks.fetch)
  useAuthStore.setState({ isAuthenticated: false, user: null, expiresAt: null })
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
