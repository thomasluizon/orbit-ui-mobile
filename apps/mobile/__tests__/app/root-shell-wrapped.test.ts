import React, { useSyncExternalStore, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Text } from 'react-native'
import RootLayout from '@/app/_layout'
import {
  getFailedNotificationDeleteIdsSnapshot,
  queuePendingNotificationDelete,
  resetPendingNotificationDeletesForTests,
  subscribePendingNotificationDeleteIds,
} from '@/lib/pending-notification-deletes'

const routeState = vi.hoisted(() => ({
  pathname: '/wrapped',
  segments: ['wrapped'],
}))
const authState = vi.hoisted(() => ({ isAuthenticated: true }))

vi.mock('expo-router', () => {
  const Stack = Object.assign(
    ({ children }: Readonly<{ children?: ReactNode }>) => children,
    {
      Protected: ({ children }: Readonly<{ children?: ReactNode }>) => children,
      Screen: () => null,
    },
  )

  return {
    DarkTheme: { colors: {} },
    DefaultTheme: { colors: {} },
    Stack,
    ThemeProvider: ({ children }: Readonly<{ children?: ReactNode }>) => children,
    useGlobalSearchParams: () => ({}),
    usePathname: () => routeState.pathname,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSegments: () => routeState.segments,
  }
})

vi.mock('expo-linking', () => ({ useLinkingURL: () => null }))
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }))
vi.mock('expo-router/react-navigation', () => ({}))
vi.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: Readonly<{ children?: ReactNode }>) => children,
}))
vi.mock('@sentry/react-native', () => ({ wrap: (component: unknown) => component }))
vi.mock('@/lib/providers', () => ({
  Providers: ({ children }: Readonly<{ children?: ReactNode }>) => children,
  useCaptureReady: () => false,
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) =>
    selector(authState),
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
vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => false,
  useProfile: () => ({ profile: null }),
}))
vi.mock('@/hooks/use-timezone-auto-sync', () => ({ useTimezoneAutoSync: vi.fn() }))
vi.mock('@/hooks/use-habits', () => ({ useTotalHabitCount: () => 0 }))
vi.mock('@/lib/theme', () => ({
  createTokensV2: () => ({ bg: '#111111', fg1: '#ffffff', hairline: '#222222', primary: '#c4530f' }),
}))
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
vi.mock('@/lib/motion', () => ({
  mobileMotion: { presets: { 'route-push': { enterDuration: 200 } } },
}))
vi.mock('@/lib/orbit-widget', () => ({ syncWidgetTheme: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/back-navigation', () => ({
  dismissOrFallback: vi.fn(),
  getAndroidBackFallbackRoute: () => null,
}))
vi.mock('@/lib/overlay-stack', () => ({ dismissTopOverlay: () => false }))
vi.mock('@/lib/upgrade-route', () => ({ buildUpgradeHref: () => '/upgrade' }))
vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      astraConversationOpen: false,
      enqueueCelebration: vi.fn(),
      setAstraConversationOpen: vi.fn(),
      setShowCreateModal: vi.fn(),
      todayFabHidden: false,
    }),
}))
vi.mock('@/stores/referral-prompt-store', () => ({
  useReferralPromptStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      armConsentPrompt: vi.fn(),
      armMilestoneSharePrompt: vi.fn(),
      armReferralPrompt: vi.fn(),
      armReviewPrompt: vi.fn(),
    }),
}))
vi.mock('@orbit/shared/stores', () => ({
  MARKETING_CONSENT_MILESTONE_KEY: 'marketing-consent',
  getMilestoneShareAchievementKey: vi.fn(),
  getMilestoneShareStreakKey: vi.fn(),
  getReferralLevelMilestone: vi.fn(),
  getReviewMomentLevelKey: vi.fn(),
}))
vi.mock('@orbit/shared/utils', () => ({
  formatAPIDate: () => '2026-09-14',
  isShareableAchievement: () => false,
}))
vi.mock('@/stores/review-reminder-store', () => ({
  isReviewMomentEligible: () => false,
  useReviewReminderStore: { getState: () => ({}) },
}))
vi.mock('@/components/onboarding/onboarding-actions-context', () => ({
  useLiveOnboardingActions: () => ({}),
}))
vi.mock('@/stores/onboarding-draft-store', () => ({
  useOnboardingDraftStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ hasPendingAnswers: () => false, onboardingLocallyDone: true }),
}))
vi.mock('@/hooks/use-onboarding-flush', () => ({ useOnboardingFlush: vi.fn() }))
vi.mock('@/hooks/use-retained-onboarding-guard', () => ({
  useRetainedOnboardingGuard: () => false,
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
vi.mock('@/components/search/search-header-action', () => ({ SearchHeader: () => null }))
vi.mock('@/components/ui/fab', () => ({ Fab: () => null }))
vi.mock('@/components/global-overlays', () => ({ OverlayLayer: () => null }))
vi.mock('@/components/offline-notice', () => ({ OfflineNotice: () => null }))
vi.mock('@/components/gamification/celebration-panel', () => ({
  CelebrationPanel: () => null,
}))
vi.mock('@/components/ui/app-toast', () => ({ AppToast: () => null }))
vi.mock('@/components/ui/app-error-boundary', () => ({ AppErrorScreen: () => null }))
vi.mock('@/components/chat/conversation', () => ({ AstraConversation: () => null }))
vi.mock('@/components/shell/composer', () => ({ Composer: () => null }))
vi.mock('@/components/throttle-screen', () => ({ ThrottleScreen: () => null }))
vi.mock('@/components/upgrade-required-screen', () => ({
  UpgradeRequiredScreen: () => null,
}))

vi.mock('@/hooks/use-chat-composer', () => ({
  useChatComposer: () => ({ composerProps: {} }),
}))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-push-notifications', () => ({
  PushNotificationsProvider: ({ children }: Readonly<{ children?: ReactNode }>) => children,
}))
vi.mock('@/lib/capture-mode', () => ({
  captureBuildEnabled: false,
  captureRequestProbeIdFromUrl: () => null,
  captureRouteProbeId: () => 'capture-probe',
  shouldExposeOnboardingRoute: () => false,
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

describe('Wrapped root shell', () => {
  beforeEach(() => {
    authState.isAuthenticated = true
    routeState.pathname = '/wrapped'
    routeState.segments = ['wrapped']
    resetPendingNotificationDeletesForTests()
  })

  afterEach(() => {
    resetPendingNotificationDeletesForTests()
    vi.useRealTimers()
  })

  it('renders Wrapped without bottom chrome or notices', async () => {
    const tree = await renderRoot()

    expect(findByTestId(tree, 'shell-bottom')).toHaveLength(0)
    expect(findByTestId(tree, 'shell-notice')).toHaveLength(0)
  })

  it.each([
    'login',
    'auth-callback',
    'chat',
    'step-up',
    'upgrade',
    'privacy',
    'terms',
    'r',
  ])('keeps notices on the authenticated %s route', async (segment) => {
    routeState.pathname = `/${segment}`
    routeState.segments = [segment]
    const tree = await renderRoot()

    expect(findByTestId(tree, 'shell-bottom')).toHaveLength(1)
    expect(findByTestId(tree, 'shell-notice')).toHaveLength(1)
  })

  it('keeps an unauthenticated no-navigation route free of notices', async () => {
    authState.isAuthenticated = false
    routeState.pathname = '/login'
    routeState.segments = ['login']
    const tree = await renderRoot()

    expect(findByTestId(tree, 'shell-bottom')).toHaveLength(0)
    expect(findByTestId(tree, 'shell-notice')).toHaveLength(0)
  })

  it('keeps a delayed delete failure available after switching to an authenticated no-navigation shell', async () => {
    vi.useFakeTimers()
    routeState.pathname = '/notifications'
    routeState.segments = ['notifications']
    let rejectDelete!: (error: Error) => void
    const deleteRequest = new Promise<never>((_resolve, reject) => { rejectDelete = reject })
    const tree = await renderRoot()
    queuePendingNotificationDelete('notif-1', () => deleteRequest)
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(5000) })

    routeState.pathname = '/chat'
    routeState.segments = ['chat']
    await TestRenderer.act(() => { tree.update(React.createElement(RootLayout)) })
    rejectDelete(new Error('Server error'))
    await TestRenderer.act(async () => { await Promise.resolve(); await Promise.resolve() })

    const failureCopy = tree.root.findAll(
      (node) => (node.type as unknown) === 'Text'
        && node.props.children === "Couldn't delete that alert. Try again.",
    )
    expect(failureCopy).toHaveLength(1)
  })
})
