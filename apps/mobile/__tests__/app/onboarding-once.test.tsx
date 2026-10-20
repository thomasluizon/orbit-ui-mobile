import React, { useSyncExternalStore, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Text } from 'react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { useAuthStore } from '@/stores/auth-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { queryClient } from '@/lib/query-client'
import { setAccountId } from '@/lib/account-scope'
import { setOnboardingProPending } from '@/hooks/use-onboarding-pro-pending'
import AsyncStorage from '@react-native-async-storage/async-storage'
import ReferralRedirectScreen from '@/app/r/[code]'
import { useLoginFlow } from '@/app/use-login-flow'
import { getAuthReturnUrlAttempt, getStoredAuthReturnUrl, getStoredReferralCode } from '@/lib/auth-flow'
import RootLayout from '@/app/_layout'
import { Shell412 } from '@/components/shell/shell-412'
import {
  getFailedNotificationDeleteIdsSnapshot,
  queuePendingNotificationDelete,
  resetPendingNotificationDeletesForTests,
  subscribePendingNotificationDeleteIds,
} from '@/lib/pending-notification-deletes'

const routeState = vi.hoisted(() => ({
  contextEntry: false,
  replace: vi.fn(),
  pathname: '/wrapped',
  segments: ['wrapped'],
}))
const api = vi.hoisted(() => ({ profile: undefined as ReturnType<typeof createMockProfile> | undefined, apply: vi.fn() }))
const renderedRoutes: string[] = []
const createState = vi.hoisted(() => ({
  profile: undefined as { hasProAccess: boolean } | undefined,
  count: 0,
  countLoaded: false,
  reducedMotion: false,
  push: vi.fn(),
  showCreate: vi.fn(),
  setLastDestination: vi.fn(),
}))

vi.mock('expo-router', () => {
  const Stack = Object.assign(
    ({ children }: Readonly<{ children?: ReactNode }>) => children,
    {
      Protected: ({ children, guard }: Readonly<{ children?: ReactNode; guard: boolean }>) => guard ? children : null,
      Screen: ({ name }: { name: string }) => {
        if (routeState.contextEntry) {
          if (name === 'r/[code]' && routeState.pathname.startsWith('/r/')) return React.createElement(ReferralRedirectScreen)
          if (name === 'login' && routeState.pathname.startsWith('/login')) return React.createElement(LoginContext)
          return null
        }
        renderedRoutes.push(name); return React.createElement(Text, { testID: `route:${name}` }, name) },
    },
  )

  return {
    DarkTheme: { colors: {} },
    DefaultTheme: { colors: {} },
    Stack,
    ThemeProvider: ({ children }: Readonly<{ children?: ReactNode }>) => children,
    useGlobalSearchParams: () => ({}),
    useLocalSearchParams: () => routeState.pathname.startsWith('/r/')
      ? { code: routeState.pathname.slice(3) }
      : Object.fromEntries(new URL(routeState.pathname, 'https://orbit.test').searchParams),
    usePathname: () => routeState.pathname,
    useRouter: () => ({ push: createState.push, replace: routeState.replace }),
    useSegments: () => routeState.segments,
  }
})

vi.mock('@/lib/google-auth', () => ({ startMobileGoogleAuth: vi.fn() }))
vi.mock('expo-linking', () => ({ useLinkingURL: () => null }))
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }))
vi.mock('expo-router/react-navigation', () => ({}))
vi.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: Readonly<{ children?: ReactNode }>) => children,
}))
vi.mock('@sentry/react-native', () => ({ wrap: (component: unknown) => component }))
vi.mock('@/lib/providers', () => ({
  Providers: ({ children }: Readonly<{ children?: ReactNode }>) => React.createElement(QueryClientProvider, { client: queryClient }, children),
  useCaptureReady: () => false,
}))
vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => ({
    clearLevelUp: vi.fn(),
    crossedStreakMilestones: [],
    leveledUp: false,
    newAchievements: [],
    newLevel: null,
  }),
}))
vi.mock('@/hooks/use-timezone-auto-sync', () => ({ useTimezoneAutoSync: vi.fn() }))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabitCountLoaded: () => ({ count: createState.count, isLoaded: createState.countLoaded }) }))
vi.mock('@/hooks/use-habits', () => ({ useTotalHabitCount: () => createState.count }))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({
    currentScheme: 'orange',
    currentTheme: 'dark',
    surfaces: {
      elevated: { backgroundColor: '#18181b' },
      screen: { backgroundColor: '#111111' },
    },
  }),
}))
vi.mock('@/lib/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/motion')>()),
  usePrefersReducedMotion: () => createState.reducedMotion,
  mobileMotion: { presets: { 'route-push': { enterDuration: 200 } } },
}))
vi.mock('@/lib/back-navigation', () => ({
  dismissOrFallback: vi.fn(),
  getAndroidBackFallbackRoute: () => null,
}))
vi.mock('@/lib/overlay-stack', () => ({ dismissTopOverlay: () => false }))
vi.mock('@/lib/upgrade-route', () => ({ buildUpgradeHref: () => '/upgrade' }))
vi.mock('@/stores/referral-prompt-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/stores/referral-prompt-store')>()),
  useReferralPromptStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      armConsentPrompt: vi.fn(),
      armMilestoneSharePrompt: vi.fn(),
      armReferralPrompt: vi.fn(),
      armReviewPrompt: vi.fn(),
    }),
}))
vi.mock('@orbit/shared/stores', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@orbit/shared/stores')>()),
  MARKETING_CONSENT_MILESTONE_KEY: 'marketing-consent',
  getMilestoneShareAchievementKey: vi.fn(),
  getMilestoneShareStreakKey: vi.fn(),
  getReferralLevelMilestone: vi.fn(),
  getReviewMomentLevelKey: vi.fn(),
}))
vi.mock('@orbit/shared/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@orbit/shared/utils')>()),
  formatAPIDate: () => '2026-09-14',
  isShareableAchievement: () => false,
}))
vi.mock('@/components/onboarding/onboarding-actions-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/onboarding/onboarding-actions-context')>()),
  useLiveOnboardingActions: () => ({}),
}))
vi.mock('@/components/navigation/notification-delete-notice', () => ({
  NotificationDeleteNotice: () => {
    const failedIds = useSyncExternalStore(
      subscribePendingNotificationDeleteIds,
      getFailedNotificationDeleteIdsSnapshot,
      getFailedNotificationDeleteIdsSnapshot,
    )
    return failedIds.map((id) => React.createElement(
      Text,
      { key: id },
      "Couldn't delete that alert. Try again.",
    ))
  },
}))
vi.mock('@/components/navigation/destination-tab-bar', () => ({
  DestinationTabBar: () => null,
}))
vi.mock('@/components/onboarding/onboarding-flow', () => ({ OnboardingFlow: ({ finalStepOnly }: { finalStepOnly: boolean }) => React.createElement(Text, { testID: 'account-onboarding' }, finalStepOnly ? 'trial' : 'first habit') }))
vi.mock('@/components/offline-notice', () => ({ useOfflineNoticeContent: () => null }))
vi.mock('@/components/gamification/celebration-panel', () => ({
  CelebrationPanel: () => null,
}))
vi.mock('@/components/ui/app-toast', () => ({ AppToast: () => null }))
vi.mock('@/components/ui/app-error-boundary', () => ({ AppErrorScreen: () => null }))
vi.mock('@/components/chat/conversation', () => ({ AstraConversation: () => null }))
vi.mock('@/components/shell/composer', () => ({ Composer: () => React.createElement('ComposerMarker', { testID: 'composer-marker' }) }))
vi.mock('@/components/throttle-screen', () => ({ ThrottleScreen: () => null }))
vi.mock('@/components/upgrade-required-screen', () => ({
  UpgradeRequiredScreen: () => null,
}))

vi.mock('@/hooks/use-chat-composer', () => ({
  useChatComposer: () => ({ composerProps: {} }),
}))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-push-notifications', () => ({
  usePushNotifications: () => ({ requestPermissionOutcome: vi.fn() }),
  PushNotificationsProvider: ({ children }: Readonly<{ children?: ReactNode }>) => children,
}))
vi.mock('@/lib/capture-mode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/capture-mode')>()),
  captureBuildEnabled: false,
  captureRequestProbeIdFromUrl: () => null,
  captureRouteProbeId: () => 'capture-probe',
}))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
type ReactTestRenderer = import('react-test-renderer').ReactTestRenderer

function findByTestId(tree: ReactTestRenderer, testID: string) {
  return tree.root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  )
}

async function renderRoot() {
  let tree!: ReactTestRenderer
  await TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(RootLayout))
  })
  return tree
}


vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn((endpoint: string, options?: { body?: string }) => {
  if (endpoint === API.profile.get) return Promise.resolve(api.profile)
  if (endpoint === API.profile.onboardingApply) { if (!api.profile) throw new Error('Expected a signed-in profile'); api.apply(JSON.parse(options?.body ?? '{}')); api.profile = { ...api.profile, hasCompletedOnboarding: true }; return Promise.resolve({ applied: true, createdHabitCount: 1, createdGoal: false, loggedFirstHabit: false }) }
  return Promise.resolve(undefined)
}) }))
vi.mock('@/lib/orbit-widget', () => ({ syncWidgetTheme: vi.fn(async () => {}), saveWidgetToken: vi.fn(async () => {}), clearWidgetToken: vi.fn(async () => {}) }))
vi.mock('@/lib/offline-mutations', () => ({ cancelScheduledFlush: vi.fn(), clearCompactedCreatesForUndo: vi.fn(), resumeOfflineReplay: vi.fn() }))

async function signIn(onboarded: boolean, accountId = 'account-a') {
  api.profile = createMockProfile({ hasCompletedOnboarding: onboarded, hasSeenImportPrompt: true, hasImportedCalendar: true })
  await TestRenderer.act(async () => {
    await useAuthStore.getState().login('eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjQxMDI0NDQ4MDB9.signature', null, { userId: accountId, name: 'Account', email: 'account@example.com' })
  })
}

async function settle() {
  await TestRenderer.act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)) })
}

let mounted: ReactTestRenderer | undefined
beforeEach(async () => {
  queryClient.clear()
  setAccountId(null)
  useAuthStore.setState(useAuthStore.getInitialState())
  useOnboardingDraftStore.setState({ ...useOnboardingDraftStore.getInitialState(), _hasHydrated: true })
  api.apply.mockClear()
  api.profile = undefined
  renderedRoutes.length = 0
  routeState.contextEntry = false
  routeState.replace.mockReset()
  routeState.pathname = '/'
  routeState.segments = ['(tabs)']
  createState.count = 0
  createState.countLoaded = true
  await setOnboardingProPending('account-a', false)
})
afterEach(async () => {
  if (mounted) await TestRenderer.act(() => mounted?.update(React.createElement(React.Fragment)))
  mounted = undefined
  queryClient.clear()
  vi.restoreAllMocks()
})

describe('onboarding through the root layout', () => {
  it('shows onboarding on a fresh install', async () => {
    mounted = await renderRoot()
    expect(findByTestId(mounted, 'route:(onboarding)')).toHaveLength(1)
  })

  it('never renders an onboarding route during sign-out, including a legacy device flag', async () => {
    await signIn(true)
    useOnboardingDraftStore.setState({ onboardingLocallyDone: false })
    mounted = await renderRoot()
    renderedRoutes.length = 0
    await TestRenderer.act(async () => { await useAuthStore.getState().logout() })
    expect(renderedRoutes).not.toContain('(onboarding)')
    expect(findByTestId(mounted, 'route:login')).toHaveLength(1)
    expect(findByTestId(mounted, 'account-onboarding')).toHaveLength(0)
  })

  it('skips device onboarding then signs into an onboarded account', async () => {
    useOnboardingDraftStore.getState().markOnboardingLocallyDone()
    mounted = await renderRoot()
    await signIn(true)
    await settle()
    expect(findByTestId(mounted, 'route:(onboarding)')).toHaveLength(0)
    expect(findByTestId(mounted, 'account-onboarding')).toHaveLength(0)
    expect(findByTestId(mounted, 'route:(tabs)')).toHaveLength(1)
  })

  it('saves the signed-out habit and shows only the trial step before Hoje', async () => {
    useOnboardingDraftStore.getState().bufferHabit({ title: 'Read', frequencyUnit: 'Day', frequencyQuantity: 1 })
    useOnboardingDraftStore.getState().markOnboardingLocallyDone()
    mounted = await renderRoot()
    await signIn(false)
    await settle()
    expect(api.apply).toHaveBeenCalledWith({ habits: [{ title: 'Read', frequencyUnit: 'Day', frequencyQuantity: 1 }] })
    expect(queryClient.getQueryData(profileKeys.detail())).toMatchObject({ hasCompletedOnboarding: true })
    expect(findByTestId(mounted, 'account-onboarding')[0]?.props.children).toBe('trial')
    await TestRenderer.act(async () => { await setOnboardingProPending('account-a', false) })
    await settle()
    expect(findByTestId(mounted, 'account-onboarding')).toHaveLength(0)
    expect(findByTestId(mounted, 'route:(tabs)')).toHaveLength(1)
    expect(useOnboardingDraftStore.getState().onboardingLocallyDone).toBe(true)
  })

  it.each([0, 3])('shows first-habit onboarding for an unfinished account on a used device with %s habits', async (count) => {
    useOnboardingDraftStore.getState().markOnboardingLocallyDone()
    createState.count = count
    mounted = await renderRoot()
    await signIn(false)
    await settle()
    expect(findByTestId(mounted, 'account-onboarding')[0]?.props.children).toBe('first habit')
    expect(api.apply).not.toHaveBeenCalled()
  })

  it('never restarts an onboarded account on second sign-in or a fresh device', async () => {
    await signIn(true)
    mounted = await renderRoot()
    await TestRenderer.act(async () => { await useAuthStore.getState().logout() })
    await signIn(true)
    await settle()
    expect(findByTestId(mounted, 'account-onboarding')).toHaveLength(0)
    expect(findByTestId(mounted, 'route:(onboarding)')).toHaveLength(0)
  })
})

vi.mock('@/components/onboarding/calendar-import-prompt', () => ({ CalendarImportPrompt: () => null }))
vi.mock('@/components/onboarding/astra-import-prompt', () => ({ AstraImportPrompt: () => null }))
vi.mock('@/components/referral/referral-prompt', () => ({ ReferralPrompt: () => null }))
vi.mock('@/components/milestone-share/milestone-share-prompt', () => ({ MilestoneSharePrompt: () => null }))
vi.mock('@/components/marketing-consent/marketing-consent-prompt', () => ({ MarketingConsentPrompt: () => null }))
vi.mock('@/components/review-moment/review-moment-sheet', () => ({ ReviewMomentSheet: () => null }))
vi.mock('@/components/ui/expiry-warning', () => ({ ExpiryWarning: () => null }))
vi.mock('@/components/ui/trial-expired-modal', () => ({ TrialExpiredModal: () => null }))
vi.mock('@/components/version-update-drawer', () => ({ VersionUpdateDrawer: () => null }))

function LoginContext() {
  const flow = useLoginFlow()
  return React.createElement(Text, { testID: 'login-context' }, `${flow.step} ${flow.showReferralBanner} ${flow.errorKey}`)
}

describe('explicit sign-in context through the root layout', () => {
  beforeEach(() => {
    const storage = new Map<string, string>()
    vi.spyOn(AsyncStorage, 'getItem').mockImplementation((key: string) => Promise.resolve(storage.get(key) ?? null))
    vi.spyOn(AsyncStorage, 'setItem').mockImplementation((key: string, value: string) => { storage.set(key, value); return Promise.resolve() })
    vi.spyOn(AsyncStorage, 'removeItem').mockImplementation((key: string) => { storage.delete(key); return Promise.resolve() })
    routeState.contextEntry = true
  })

  it('keeps a referral deep link available on a fresh install and persists its referral at login', async () => {
    routeState.pathname = '/r/friend-42'
    routeState.segments = ['r', '[code]']
    mounted = await renderRoot()
    expect(routeState.replace).toHaveBeenCalledWith('/login?ref=friend-42')
    routeState.pathname = routeState.replace.mock.calls[0]![0] as string
    routeState.segments = ['login']
    await TestRenderer.act(() => { mounted?.update(React.createElement(RootLayout)) })
    await settle()
    expect(await getStoredReferralCode()).toBe('friend-42')
    expect(findByTestId(mounted, 'login-context')[0]?.props.children).toContain('email true')
    expect(useOnboardingDraftStore.getState().onboardingLocallyDone).toBe(false)
  })

  it.each([
    ['/login?ref=friend-42&returnUrl=%2Fcalendar', '/calendar', 'email true'],
    ['/login?email=person%40example.com&code=123456&returnUrl=%2Fcalendar', '/calendar', 'code false'],
    ['/login?googleError=1&returnUrl=%2Fcalendar', '/calendar', 'auth.errors.googleError'],
    ['/login?returnUrl=%2F%2Fevil.example', null, 'email false'],
  ])('keeps an explicit login entry and validates its return URL: %s', async (url, destination, content) => {
    routeState.pathname = url
    routeState.segments = ['login']
    mounted = await renderRoot()
    await settle()
    expect(findByTestId(mounted, 'login-context')[0]?.props.children).toContain(content)
    expect(await getStoredAuthReturnUrl(getAuthReturnUrlAttempt())).toBe(destination)
    expect(routeState.replace).not.toHaveBeenCalled()
    expect(useOnboardingDraftStore.getState().onboardingLocallyDone).toBe(false)
  })
})
