import React, { useSyncExternalStore, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Text } from 'react-native'
import en from '@orbit/shared/i18n/en.json'
import { __setWindowDimensions } from '../../test-mocks/react-native'
import RootLayout from '@/app/_layout'
import { Shell412 } from '@/components/shell/shell-412'
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
const createState = vi.hoisted(() => ({
  profile: undefined as { hasProAccess: boolean } | undefined,
  count: 0,
  countLoaded: false,
  reducedMotion: false,
  push: vi.fn(),
  showCreate: vi.fn(),
  setLastDestination: vi.fn(),
  conversationOpen: false,
}))

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
    useRouter: () => ({ push: createState.push, replace: vi.fn() }),
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
  useHasProAccess: () => createState.profile?.hasProAccess ?? false,
  useProfile: () => ({ profile: createState.profile }),
}))
vi.mock('@/hooks/use-timezone-auto-sync', () => ({ useTimezoneAutoSync: vi.fn() }))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabitCountLoaded: () => ({ count: createState.count, isLoaded: createState.countLoaded }) }))
vi.mock('@/hooks/use-habits', () => ({ useTotalHabitCount: () => createState.count }))
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
  usePrefersReducedMotion: () => createState.reducedMotion,
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
      astraConversationOpen: createState.conversationOpen,
      enqueueCelebration: vi.fn(),
      setAstraConversationOpen: (open: boolean) => { createState.conversationOpen = open },
      setShowCreateModal: createState.showCreate,
      todayFabHidden: false,
      lastDestination: 'hoje',
      setLastDestination: createState.setLastDestination,
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
vi.mock('@/components/global-overlays', () => ({ OverlayLayer: () => null }))
vi.mock('@/components/offline-notice', () => ({ useOfflineNoticeContent: () => null }))
vi.mock('@/components/gamification/celebration-panel', () => ({
  CelebrationPanel: () => null,
}))
vi.mock('@/components/ui/app-toast', () => ({ AppToast: () => null }))
vi.mock('@/components/ui/app-error-boundary', () => ({ AppErrorScreen: () => null }))
vi.mock('@/components/chat/conversation', () => ({ AstraConversation: () => React.createElement(Text, { testID: 'conversation-content' }, 'Conversation') }))
vi.mock('@/components/throttle-screen', () => ({ ThrottleScreen: () => null }))
vi.mock('@/components/upgrade-required-screen', () => ({
  UpgradeRequiredScreen: () => null,
}))

vi.mock('@/hooks/use-chat-composer', () => ({
  useChatComposer: () => ({ composerProps: {
    words: en.shell.composer,
    value: '',
    state: 'idle',
    suggestions: [
      { id: 'first', label: 'First suggestion', onSelect: vi.fn() },
      { id: 'second', label: 'Second suggestion', onSelect: vi.fn() },
      { id: 'third', label: 'Third suggestion', onSelect: vi.fn() },
    ],
    onChangeValue: vi.fn(),
    onSend: vi.fn(),
  } }),
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
    createState.profile = undefined
    createState.reducedMotion = false
    createState.count = 0
    createState.countLoaded = false
    createState.conversationOpen = false
    createState.push.mockClear()
    createState.showCreate.mockClear()
    createState.setLastDestination.mockClear()
    resetPendingNotificationDeletesForTests()
  })

  afterEach(() => {
    resetPendingNotificationDeletesForTests()
    vi.useRealTimers()
  })

  it.each([false, true])('pushes creation with reduced motion=%s and without app navigation', async (reducedMotion) => {
    createState.reducedMotion = reducedMotion
    routeState.pathname = '/habits/new'
    routeState.segments = ['habits', 'new']
    const tree = await renderRoot()
    const screen = tree.root.findAll((node) => node.props.name === 'habits/new')[0]
    expect(screen?.props.options).toMatchObject({ animation: reducedMotion ? 'none' : 'slide_from_right' })
    expect(findByTestId(tree, 'shell-tab-bar')).toHaveLength(0)
    expect(findByTestId(tree, 'composer-idle')).toHaveLength(0)
  })

  it('opens create while profile access is unresolved, even after the habit count loads', async () => {
    routeState.pathname = '/'
    routeState.segments = ['(tabs)']
    createState.count = 10
    createState.countLoaded = true
    const tree = await renderRoot()
    const [createFab] = findByTestId(tree, 'fab')
    await TestRenderer.act(() => (createFab?.props.onPress as () => void)())
    expect(createState.showCreate).toHaveBeenCalledWith(true)
    expect(createState.push).not.toHaveBeenCalledWith('/upgrade')

    createState.profile = { hasProAccess: true }
    await TestRenderer.act(() => tree.update(React.createElement(RootLayout)))
    expect(createState.showCreate).not.toHaveBeenCalledWith(false)
  })

  it('names the Hoje create FAB for the habit action', async () => {
    routeState.pathname = '/'
    routeState.segments = ['(tabs)']
    const tree = await renderRoot()

    const [createFab] = findByTestId(tree, 'fab')
    expect(createFab?.props.accessibilityLabel).toBe('nav.createHabit')
  })

  it.each([412, 1352])('shows input and chips only on Hoje and preserves an open conversation at %ipx', async (width) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    routeState.pathname = '/'
    routeState.segments = ['(tabs)']
    const tree = await renderRoot()
    expect(findByTestId(tree, 'composer-idle')).toHaveLength(1)
    expect(findByTestId(tree, 'composer-field')).toHaveLength(1)
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'First suggestion')).toHaveLength(1)
    const open = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'todayAstra.openConversation')[0]
    await TestRenderer.act(() => { (open?.props.onPress as () => void)(); tree.update(React.createElement(RootLayout)) })
    expect(findByTestId(tree, 'shell-conversation')).toHaveLength(1)

    for (const pathname of ['/calendar', '/progress', '/profile']) {
      routeState.pathname = pathname
      routeState.segments = ['(tabs)', pathname.slice(1)]
      await TestRenderer.act(() => tree.update(React.createElement(RootLayout)))
      expect(findByTestId(tree, 'shell-conversation')).toHaveLength(1)
      expect(findByTestId(tree, 'conversation-content')).toHaveLength(1)
      expect(findByTestId(tree, 'shell-pinned-slot')).toHaveLength(0)
      createState.conversationOpen = false
      await TestRenderer.act(() => tree.update(React.createElement(RootLayout)))
      expect(findByTestId(tree, 'composer-idle')).toHaveLength(0)
      expect(findByTestId(tree, 'composer-field')).toHaveLength(0)
      expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'First suggestion')).toHaveLength(0)
      expect(findByTestId(tree, 'shell-composer-band')).toHaveLength(0)
      expect(findByTestId(tree, 'shell-tab-bar')).toHaveLength(1)
      createState.conversationOpen = true
      await TestRenderer.act(() => tree.update(React.createElement(RootLayout)))
    }
    routeState.pathname = '/'
    routeState.segments = ['(tabs)']
    createState.conversationOpen = false
    await TestRenderer.act(() => tree.update(React.createElement(RootLayout)))
    expect(findByTestId(tree, 'composer-idle')).toHaveLength(1)
    await TestRenderer.act(() => tree.update(React.createElement(React.Fragment)))
  })

  it('renders Wrapped without bottom chrome or notices', async () => {
    const tree = await renderRoot()

    expect(findByTestId(tree, 'shell-bottom')).toHaveLength(0)
    expect(findByTestId(tree, 'shell-notice')).toHaveLength(0)
  })

  it('keeps the not-found screen in the tab shell without a composer or header', async () => {
    routeState.pathname = '/nao-existe'
    routeState.segments = ['+not-found']
    const tree = await renderRoot()

    expect(findByTestId(tree, 'shell-tab-bar')).toHaveLength(1)
    expect(findByTestId(tree, 'shell-pinned-slot')).toHaveLength(0)
    expect(findByTestId(tree, 'composer-idle')).toHaveLength(0)
    expect(findByTestId(tree, 'shell-header')).toHaveLength(0)
    expect(tree.root.findAll((node) => node.type === Shell412)[0]?.props.safeAreaTop).toBe(true)
  })

  it('keeps the signed-out not-found screen clear of bottom chrome and below the safe area', async () => {
    authState.isAuthenticated = false
    routeState.pathname = '/nao-existe'
    routeState.segments = ['+not-found']
    const tree = await renderRoot()

    expect(findByTestId(tree, 'shell-bottom')).toHaveLength(0)
    expect(tree.root.findAll((node) => node.type === Shell412)[0]?.props.safeAreaTop).toBe(true)
  })

  it.each(['/calendar/bad', '/habits/missing'])('does not remember a destination or show a composer for unmatched path %s', async (pathname) => {
    routeState.pathname = pathname
    routeState.segments = ['+not-found']
    const tree = await renderRoot()

    expect(findByTestId(tree, 'shell-pinned-slot')).toHaveLength(0)
    expect(createState.setLastDestination).not.toHaveBeenCalled()
  })

  it.each(['/', '/calendar', '/progress', '/profile', '/habits/h1', '/search', '/about', '/support', '/preferences', '/advanced', '/ai-settings'])(
    'shows composer only on Hoje and habit detail at %s', async (pathname) => {
      routeState.pathname = pathname
      routeState.segments = pathname === '/' ? ['(tabs)'] : [pathname.slice(1)]
      const tree = await renderRoot()
      expect(findByTestId(tree, 'shell-pinned-slot').length > 0).toBe(
        ['/', '/habits/h1'].includes(pathname),
      )
      expect(findByTestId(tree, 'shell-header')).toHaveLength(0)
    },
  )

  it.each([
    'login',
    'auth-callback',
    'chat',
    'step-up',
    'upgrade',
    'privacy',
    'terms',
    'r',
  ])('keeps the authenticated %s route free of empty bottom chrome', async (segment) => {
    routeState.pathname = `/${segment}`
    routeState.segments = [segment]
    const tree = await renderRoot()

    expect(findByTestId(tree, 'shell-bottom')).toHaveLength(0)
    expect(findByTestId(tree, 'shell-notice')).toHaveLength(0)
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
