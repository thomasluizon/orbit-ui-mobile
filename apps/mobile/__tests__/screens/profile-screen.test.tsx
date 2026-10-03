import React from 'react'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import en from '@orbit/shared/i18n/en.json'
import { API } from '@orbit/shared/api'
import { createApiClientError } from '@orbit/shared/utils'
import type { StepUpTimingRecord } from '@orbit/shared/utils'
import { beginStepUpChallenge } from '@/lib/step-up-storage'
import { advanceAccountGeneration } from '@/lib/session-epoch'

import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import { ListRow } from '@/components/ui/list-row'

import ProfileScreen from '@/app/(tabs)/profile'
import ProfileAccountRoute from '@/app/profile/account'
import ProfilePreferencesRoute from '@/app/profile/preferences'
import ProfileAstraRoute from '@/app/profile/astra'
import ProfileNotificationsRoute from '@/app/profile/notifications'

interface MockDeviceState {
  count: number | undefined
  max: number
  isCurrentDeviceRegistered: boolean
  isLoading: boolean
  isError: boolean
  refresh: ReturnType<typeof vi.fn>
}

vi.mock('@/components/referral/referral-card', () => ({
  ReferralCard: ({ onOpen }: { onOpen: () => void; onDismiss?: () => void }) =>
    React.createElement('ReferralCardStub', {
      accessibilityRole: 'button',
      onPress: onOpen,
    }),
}))

vi.mock('@/components/referral/referral-drawer', () => ({
  ReferralDrawer: ({ open }: { open: boolean; onClose?: () => void }) =>
    open ? React.createElement('ReferralDrawerOpen', {}) : null,
}))

vi.mock('react-native', async (importOriginal) => {
  const native = await importOriginal<typeof import('react-native')>()
  return {
    ...native,
    AccessibilityInfo: {
      ...native.AccessibilityInfo,
      sendAccessibilityEvent: mockSendAccessibilityEvent,
      announceForAccessibility: mockAnnounceForAccessibility,
    },
    Platform: { ...native.Platform, OS: 'android' },
    Linking: { ...native.Linking, openSettings: mockOpenSettings },
    AppState: { ...native.AppState, addEventListener: mockAddAppStateListener },
  }
})

const TestRenderer = require('react-test-renderer')

const {
  mockApiClient,
  mockPerformQueuedApiMutation,
  mockAuthState,
  mockShareAsync,
  mockShellNoticeSlot,
  mockUseGamificationProfile,
  mockPatchProfile,
  mockRefetchProfile,
  mockRouterPush,
  mockSetAstraConversationOpen,
  mockSendAccessibilityEvent,
  mockAnnounceForAccessibility,
  mockApplyTheme,
  mockChangeLanguage,
  mockPushSupported,
  mockPushEnabled,
  mockPushError,
  mockDeviceState,
  mockFocusCallback,
  mockPushPermissionStatus,
  mockDisablePushNotifications,
  mockOpenSettings,
  mockRequestPushPermission,
  mockRefreshPushPermissionStatus,
  mockAddAppStateListener,
  mockRemoveAppStateListener,
  mockConversationOpen,
  mockRealConsentSection,
  mockRealListRow,
  mockProfileState,
  mockSearchParams,
  mockStepUpVerified,
  mockCreateGrant,
  mockApiKeys,
  mockTranslate,
  mockLocale,
} = vi.hoisted(() => {
  const deviceState: MockDeviceState = { count: 0, max: 5, isCurrentDeviceRegistered: false, isLoading: false, isError: false, refresh: vi.fn() }
  return ({
  mockApiClient: vi.fn(),
  mockPerformQueuedApiMutation: vi.fn(),
  mockShareAsync: vi.fn(),
  mockAuthState: {
    isAuthenticated: true,
    user: { userId: 'user-1' },
    logout: vi.fn(),
  },
  mockUseGamificationProfile: vi.fn(() => ({ profile: null })),
  mockPatchProfile: vi.fn(),
  mockRefetchProfile: vi.fn(),
  mockShellNoticeSlot: vi.fn(),
  mockRouterPush: vi.fn(),
  mockSetAstraConversationOpen: vi.fn(),
  mockSendAccessibilityEvent: vi.fn(),
  mockAnnounceForAccessibility: vi.fn(),
  mockApplyTheme: vi.fn(),
  mockChangeLanguage: vi.fn(),
  mockPushSupported: { current: false },
  mockPushEnabled: { current: false },
  mockPushError: { current: null as string | null },
  mockDeviceState: { current: deviceState },
  mockFocusCallback: { current: null as null | (() => void) },
  mockPushPermissionStatus: { current: null as 'denied' | 'granted' | null },
  mockDisablePushNotifications: vi.fn(),
  mockOpenSettings: vi.fn(),
  mockRequestPushPermission: vi.fn(),
  mockRefreshPushPermissionStatus: vi.fn(),
  mockRemoveAppStateListener: vi.fn(),
  mockAddAppStateListener: vi.fn(),
  mockConversationOpen: { current: false },
  mockRealConsentSection: { current: false },
  mockRealListRow: { current: false },
  mockSearchParams: { current: {} },
  mockStepUpVerified: { current: false },
  mockCreateGrant: { consumed: false },
  mockApiKeys: { current: [] as Record<string, unknown>[] },
  mockTranslate: { current: (key: string, params?: Record<string, string | number>) => key === 'profile.settingsRows.devicesCount' ? [params?.count ?? '', 'of', params?.max ?? ''].join(' ') : key },
  mockLocale: { current: 'en' },
  mockProfileState: {
    current: {
      profile: undefined as ReturnType<typeof createMockProfile> | undefined,
      isLoading: false,
      error: null as Error | null,
    },
  },
}) })

vi.mock('expo-sharing', () => {
  return { isAvailableAsync: vi.fn().mockResolvedValue(true), shareAsync: mockShareAsync }
})

vi.mock('@react-native-clipboard/clipboard', () => ({
  default: { setString: vi.fn() },
}))

vi.mock('expo-device', () => ({
  __esModule: true,
  default: { isDevice: true },
  isDevice: true,
}))

vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))

vi.mock('expo-router', () => ({
  usePathname: () => '/profile',
  useFocusEffect: (callback: () => void) => { mockFocusCallback.current = callback },
  useLocalSearchParams: () => mockSearchParams.current,
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterPush,
    dismissTo: mockRouterPush,
  }),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => mockTranslate.current(key, params),
    i18n: { language: mockLocale.current, changeLanguage: mockChangeLanguage },
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey?: string[] }) => ({
    data: queryKey?.[0] === 'apiKeys' ? mockApiKeys.current : undefined,
    error: null,
    isLoading: false,
    isError: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    clear: vi.fn(),
  }),
  useMutation: (options: { mutationFn?: (value: boolean) => unknown }) => ({
    mutate: (value: boolean) => options.mutationFn?.(value),
    isPending: false,
  }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ ...mockProfileState.current, patchProfile: mockPatchProfile, refetch: mockRefetchProfile }),
  useTrialExpired: () => true,
}))

vi.mock('@/hooks/use-push-notifications', () => ({
  usePushNotifications: () => ({
    expoPushToken: 'fcm-token',
    error: mockPushError.current,
    isSupported: mockPushSupported.current,
    isEnabled: mockPushEnabled.current,
    isRegistered: false,
    isLoading: false,
    permissionStatus: mockPushPermissionStatus.current,
    registrationStatus: 'unsupported',
    refreshPermissionStatus: mockRefreshPushPermissionStatus,
    disablePushNotifications: mockDisablePushNotifications,
    requestPermission: mockRequestPushPermission,
  }),
}))

vi.mock('@/hooks/use-push-subscriptions', () => ({
  usePushSubscriptions: () => mockDeviceState.current,
}))

vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: mockUseGamificationProfile,
  useReportEvent: () => ({ mutate: vi.fn() }),
  useStreakInfo: () => ({ data: { currentStreak: 0, isFrozenToday: false } }),
}))

vi.mock('@/stores/auth-store', () => {
  const useAuthStore = (selector: (state: typeof mockAuthState) => unknown) =>
    selector(mockAuthState)
  useAuthStore.getState = () => mockAuthState
  return { useAuthStore }
})

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: { setAstraConversationOpen: typeof mockSetAstraConversationOpen; astraConversationOpen: boolean }) => unknown) =>
    selector({ setAstraConversationOpen: mockSetAstraConversationOpen, astraConversationOpen: mockConversationOpen.current }),
}))

vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: true }),
}))

vi.mock('@/stores/offline-sync-store', () => ({
  useOfflineSyncStore: { getState: () => ({ clearDrops: vi.fn(() => Promise.resolve()) }) },
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: new Proxy({}, { get: () => '#111111' }),
    currentScheme: 'purple',
    currentTheme: 'dark',
    applyTheme: mockApplyTheme,
  }),
}))

vi.mock('@/lib/theme', () => ({
  createColors: () => new Proxy({}, { get: () => '#111111' }),
  createTokensV2: () => new Proxy({}, { get: () => '#111111' }),
  spacing: {
    pageX: 20,
    pageBottom: 40,
    sectionGap: 16,
    cardPadding: 20,
    cardGap: 12,
    itemGap: 8,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    '2xl': 24,
    full: 9999,
  },
  shadows: {
    sm: {},
    md: {},
    lg: {},
    cardParent: {},
    cardParentHover: {},
    cardChild: {},
  },
  shadowsV2: {
    shadow1: {},
    shadow2: {},
    shadow3: {},
  },
  tintFromPrimary: () => 'rgba(17, 17, 17, 0.1)',
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mockApiClient,
}))

vi.mock('@/lib/step-up-storage', () => ({
  beginStepUpChallenge: vi.fn(),
  isStepUpVerified: () => mockStepUpVerified.current,
  hasApiKeyCreationGrant: () => mockStepUpVerified.current && !mockCreateGrant.consumed,
  consumeApiKeyCreationGrant: () => {
    mockCreateGrant.consumed = true
  },
  clearApiKeyCreationGrant: () => {
    mockCreateGrant.consumed = true
  },
}))

vi.mock('@/lib/queued-api-mutation', () => ({
  performQueuedApiMutation: mockPerformQueuedApiMutation,
}))

vi.mock('@/hooks/use-shell-notice-slot', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useShellNoticeSlot: mockShellNoticeSlot,
}))

vi.mock('@/lib/checklist-template-storage', () => ({
  clearChecklistTemplates: vi.fn(),
}))

vi.mock('@/lib/offline-mutations', () => ({
  buildQueuedMutation: vi.fn(),
  createQueuedAck: vi.fn(),
  isQueuedResult: vi.fn(() => false),
  queueOrExecute: vi.fn(),
}))

vi.mock('@/lib/offline-queue', () => ({
  clear: vi.fn(),
  enqueue: vi.fn(),
}))

vi.mock('@/lib/query-client', () => ({
  clearPersistedQueryCache: vi.fn(),
}))



vi.mock('@/components/ui/theme-toggle', () => ({
  ThemeToggle: () => React.createElement('ThemeToggle'),
}))

vi.mock('@/components/marketing-consent/marketing-consent-section', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/marketing-consent/marketing-consent-section')>()
  return {
    MarketingConsentSection: (props: React.ComponentProps<typeof actual.MarketingConsentSection>) =>
      mockRealConsentSection.current
        ? React.createElement(actual.MarketingConsentSection, props)
        : React.createElement('MarketingConsentSectionStub', {
          testID: 'marketing-consent-section',
        }, props.trailingRow),
  }
})

vi.mock('@/components/ui/offline-unavailable-state', () => ({
  OfflineUnavailableState: () => null,
}))

vi.mock('@/components/ui/app-text-input', () => ({
  AppTextInput: () => null,
}))

vi.mock('@/components/ui/keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useKeyboardAwareInputReveal: () => null,
}))



vi.mock('@/app/(tabs)/profile/_components/profile-nav-card', () => ({
  ProfileNavCard: () => null,
}))

vi.mock('@/components/gamification/streak-badge', () => ({
  StreakBadge: () => React.createElement('StreakBadge'),
}))



vi.mock('@/components/ui/section-label', () => ({
  SectionLabel: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/ui/settings-group', () => ({
  SettingsGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SettingsGroupRow: ({
    label,
    hint,
    onPress,
  }: {
    label: string
    hint?: string
    onPress?: () => void
  }) => React.createElement('SettingsRowStub', { label, hint, onPress }),
}))

vi.mock('@/components/ui/row-list', () => ({
  RowList: ({ children }: { children: React.ReactNode }) =>
    React.createElement('RowListStub', { rowCount: React.Children.toArray(children).length }, children),
}))

vi.mock('@/components/ui/sheet', () => ({
  useSheetHost: () => {
    const sheetRef = React.useRef<{ requestClose: (exitAction?: () => void) => void } | null>(null)
    return {
      sheetRef,
      closeSheet: (exitAction?: () => void) => sheetRef.current?.requestClose(exitAction),
    }
  },
  Sheet: React.forwardRef(function SheetStub(
    {
      title,
      actions,
      onClose,
      children,
    }: {
      title: string
      actions?: React.ReactNode
      onClose?: () => void
      children: React.ReactNode
    },
    ref: React.ForwardedRef<{ requestClose: (exitAction?: () => void) => void }>,
  ) {
    React.useImperativeHandle(ref, () => ({
      requestClose: (exitAction?: () => void) => {
        if (exitAction) exitAction()
        else onClose?.()
      },
    }), [onClose])
    return React.createElement('SheetStub', { title }, children, actions)
  }),
}))

vi.mock('@/components/ui/list-row', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/list-row')>()
  return {
    ListRow: (props: React.ComponentProps<typeof actual.ListRow>) => {
      if (mockRealListRow.current) return React.createElement(actual.ListRow, props)
      const { icon, danger, title, description, value, trailing, onClick, accessibilityLabel, ref, chevron = true, action, readOnly = false } = props
      return React.createElement(
        'SettingsRowStub',
        {
          label: title,
          icon,
          danger,
          hint: description,
          value,
          hasTrailing: Boolean(trailing),
          onPress: readOnly ? undefined : onClick,
          chevron,
          accessibilityRole: !readOnly && onClick ? 'button' : undefined,
          accessibilityLabel: accessibilityLabel ?? title,
          ref,
        },
        action ? React.createElement('RowActionStub', {
          accessibilityRole: 'button',
          accessibilityLabel: action.label,
          onPress: action.onPress,
        }) : null,
        trailing ?? null,
      )
    },
  }
})

vi.mock('react-native-svg', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => React.createElement('Svg', props),
  Path: () => null,
  Defs: () => null,
  Stop: () => null,
  Rect: () => null,
}))

interface SettingsRowStubNode {
  type: unknown
  props: {
    icon?: React.ReactNode
    label?: string
    hint?: string
    value?: string
    hasTrailing?: boolean
    onPress?: () => void
    chevron?: boolean
    accessibilityRole?: string
    accessibilityState?: { disabled?: boolean }
  }
}

async function renderProfileScreen(createNodeMock?: (element: { props: { label?: string } }) => unknown) {
  let tree: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<ProfileScreen />, { createNodeMock })
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return tree!
}

async function renderProfileSubscreen(screen: 'account' | 'preferences' | 'astra' | 'notifications') {
  let tree: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    const Destination = PROFILE_ROUTES[screen]
    tree = TestRenderer.create(<Destination />)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return tree!
}

function findRowByLabel(
  tree: ReturnType<typeof TestRenderer.create>,
  label: string,
): SettingsRowStubNode {
  const [row] = tree.root.findAll(
    (node: SettingsRowStubNode) =>
      node.type === 'SettingsRowStub' && node.props.label === label,
  )
  if (!row) throw new Error(`No settings row with label "${label}"`)
  return row
}

function nodeText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (!node || typeof node !== 'object' || !('children' in node)) return ''
  return (node as { children: unknown[] }).children.map(nodeText).join('')
}

function findButtonByText(
  tree: ReturnType<typeof TestRenderer.create>,
  label: string,
) {
  return tree.root.find(
    (node: { props: { accessibilityRole?: string }; children: unknown[] }) =>
      node.props.accessibilityRole === 'button' && nodeText(node) === label,
  )
}


const PROFILE_ROUTES = { account: ProfileAccountRoute, preferences: ProfilePreferencesRoute, astra: ProfileAstraRoute, notifications: ProfileNotificationsRoute }

describe('ProfileScreen', () => {
  it('owns the drawn 16px content inset below the destination bell', async () => {
    const tree = await renderProfileScreen()
    const scroller = tree.root.findByProps({ testID: 'profile-scroller' })
    const content = scroller.findByProps({ testID: 'profile-content' })
    expect(StyleSheet.flatten(content.props.style)).toMatchObject({
      paddingTop: 16,
      paddingHorizontal: 16,
    })
    const groups = tree.root.findByProps({ testID: 'profile-settings-groups' })
    expect(scroller.findByProps({ testID: 'profile-settings-group-you' })).toBeDefined()
    expect(StyleSheet.flatten(groups.props.style)).not.toHaveProperty('paddingTop')
  })

  const proPlans = [
    { state: 'free', hasProAccess: false, isTrialActive: false, isLifetimePro: false, en: 'Free', pt: 'Grátis' },
    { state: 'trial', hasProAccess: true, isTrialActive: true, isLifetimePro: false, en: 'Trial', pt: 'Teste' },
    { state: 'paid', hasProAccess: true, isTrialActive: false, isLifetimePro: false, en: 'Active', pt: 'Ativo' },
    { state: 'lifetime', hasProAccess: true, isTrialActive: false, isLifetimePro: true, en: 'Lifetime', pt: 'Vitalício' },
  ] as const

  function translateProMessages(locale: 'en' | 'pt-BR') {
    mockLocale.current = locale
    const messages = locale === 'en' ? en : ptBR
    mockTranslate.current = (key, params) => {
      let message: unknown = messages
      for (const segment of key.split('.')) {
        message = message && typeof message === 'object'
          ? (message as Record<string, unknown>)[segment]
          : undefined
      }
      return typeof message === 'string'
        ? message.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
        : key
    }
  }

  it.each(['en', 'pt-BR'].flatMap((locale) => [320, 360, 412].flatMap((width) => [1, 2].flatMap((textScale) => ['free', 'trial', 'paid', 'lifetime'].map((plan) => ({ locale, width, textScale, plan }))))))('keeps $plan Android Perfil rows readable in $locale at $width dp and $textScale text scale', async ({ locale, width, textScale, plan }) => {
    translateProMessages(locale as 'en' | 'pt-BR')
    mockRealListRow.current = true
    mockProfileState.current.profile = createMockProfile({
      name: 'Marina', email: 'marina.silva.long.address@example.com', hasProAccess: plan !== 'free',
      isTrialActive: plan === 'trial', isLifetimePro: plan === 'lifetime',
      trialEndsAt: plan === 'trial' ? '2099-10-09T12:00:00Z' : null,
    })
    const tree = await renderProfileScreen()
    try {
      const rows = tree.root.findAllByType(ListRow)
      expect(rows).toHaveLength(11)
      const measured: ({ title: string } & ReturnType<typeof measureProfileRow>)[] = rows.map((row: { props: React.ComponentProps<typeof ListRow>; children: unknown[] }) => {
        let rowTree!: ReturnType<typeof TestRenderer.create>
        TestRenderer.act(() => { rowTree = TestRenderer.create(React.createElement(ListRow, row.props)) })
        try {
          const iconSlot = rowTree.root.find((node: { type: unknown; props: { style?: StyleProp<ViewStyle> } }) => node.type === 'View' && node.props.style && StyleSheet.flatten(node.props.style).width === 28)
          expect(iconSlot.props.importantForAccessibility).toBe('no-hide-descendants')
          return { title: row.props.title, ...measureProfileRow(rowTree.toJSON(), width - 32, textScale) }
        }
        finally { TestRenderer.act(() => rowTree.unmount()) }
      })
      for (const row of measured) {
        const title = row.texts.find(({ label }) => label === row.title)!
        expect(row.height, row.title).toBeGreaterThanOrEqual(48)
        expect(title.left, row.title).toBe(measured[0]!.texts[0]!.left)
        expect(title.right, row.title).toBeLessThanOrEqual(width - 32)
        expect(title.clipped, row.title).toBe(false)
        if (textScale === 1) {
          expect(row.height, row.title).toBeLessThanOrEqual(68)
          expect(title.lines, row.title).toBe(1)
        }
      }
      if (textScale === 2 && locale === 'pt-BR') {
        const calendar = measured.find(({ title }) => title === ptBR.profile.calendarSync.title)!
        expect(calendar.texts[0]!.lines).toBeGreaterThan(1)
        expect(calendar.height).toBeGreaterThan(52)
      }
    } finally { TestRenderer.act(() => tree.unmount()) }
  })

  it.each([1, 2])('reveals the full account email within the Android row at %s text scale', async (textScale) => {
    const email = `${'address'.repeat(9)}@${'domain'.repeat(20)}.com`
    mockProfileState.current.profile = createMockProfile({ name: `Marina ${'Silva'.repeat(16)}`, email })
    mockRealListRow.current = true
    const root = await renderProfileScreen()
    const account = root.root.findAllByType(ListRow).find((row: { props: React.ComponentProps<typeof ListRow> }) => row.props.description === email)!
    TestRenderer.act(() => account.props.onClick())
    expect(mockRouterPush).toHaveBeenCalledWith('/profile/account')
    TestRenderer.act(() => root.unmount())
    const destination = await renderProfileSubscreen('account')
    try {
      const row = destination.root.findAllByType(ListRow).find((row: { props: React.ComponentProps<typeof ListRow> }) => row.props.description === email)!
      let rowTree!: ReturnType<typeof TestRenderer.create>
      TestRenderer.act(() => { rowTree = TestRenderer.create(React.createElement(ListRow, row.props)) })
      try {
        const geometry = measureProfileRow(rowTree.toJSON(), 288, textScale)
        const description = geometry.texts.find(({ label }) => label === email)!
        expect(geometry.texts[0]!.lines).toBeGreaterThanOrEqual(3)
        expect(geometry.texts[0]!.lineHeightRatio).toBeGreaterThanOrEqual(1.4)
        expect(description.clipped).toBe(false)
        expect(description.lines).toBeGreaterThan(2)
        expect(description.right).toBeLessThanOrEqual(288)
      } finally { TestRenderer.act(() => rowTree.unmount()) }
    } finally { TestRenderer.act(() => destination.unmount()) }
  })

  describe.each(['en', 'pt-BR'] as const)('Orbit Pro in %s', (locale) => {
    it.each(proPlans)('shows the $state plan directly after the account and opens its destination', async (plan) => {
      translateProMessages(locale)
      mockRealListRow.current = true
      mockProfileState.current.profile = createMockProfile({
        plan: plan.hasProAccess ? 'pro' : 'free',
        hasProAccess: plan.hasProAccess,
        isTrialActive: plan.isTrialActive,
        isLifetimePro: plan.isLifetimePro,
        trialEndsAt: plan.isTrialActive ? '2099-10-09T12:00:00Z' : null,
      })
      const tree = await renderProfileScreen()
      const group = tree.root.findByProps({ testID: 'profile-settings-group-you' })
      const rows = group.findAllByType(ListRow)
      expect(rows).toHaveLength(5)
      const leadingIcons = ['User', 'Crown', 'Settings', 'Svg', 'Bell']
      for (const [index, row] of rows.entries()) {
        const contents = row.findAll((node: { type: unknown }) =>
          typeof node.type === 'string' && [...leadingIcons, 'Text', 'ChevronRight'].includes(node.type))
        const icons = contents.filter((node: { type: unknown }) => node.type !== 'Text')
        const navigates = !(index === 1 && plan.isLifetimePro)
        expect(icons, row.props.title).toHaveLength(navigates ? 2 : 1)
        expect(contents[0].type).toBe(leadingIcons[index])
        expect(contents[1].type).toBe('Text')
        expect(icons[0].props.size ?? icons[0].props.width).toBe(24)
        if (navigates) {
          expect(contents.at(-1).type).toBe('ChevronRight')
        }
        const decorativeSlots = row.findAll((node: { type: unknown; props: { importantForAccessibility?: string } }) =>
          node.type === 'View' && node.props.importantForAccessibility === 'no-hide-descendants')
        expect(decorativeSlots).toHaveLength(navigates ? 2 : 1)
      }
      const expectedValue = locale === 'en' ? plan.en : plan.pt
      const text = nodeText(group)
      expect(text.indexOf(mockProfileState.current.profile.name)).toBeLessThan(text.indexOf('Orbit Pro'))
      expect(text.indexOf('Orbit Pro')).toBeLessThan(text.indexOf(locale === 'en' ? 'Preferences' : 'Preferências'))
      expect(text).toContain(`Orbit Pro${expectedValue}`)
      expect(mockRouterPush).not.toHaveBeenCalled()
      const entries = group.findAll((node: { type: unknown; props: { accessibilityRole?: string }; children: unknown[] }) =>
        typeof node.type === 'string' && node.props.accessibilityRole === 'button' && nodeText(node).startsWith('Orbit Pro'))
      expect(entries).toHaveLength(plan.isLifetimePro ? 0 : 1)
      if (!plan.isLifetimePro) {
        TestRenderer.act(() => entries[0].props.onPress())
        expect(mockRouterPush).toHaveBeenCalledExactlyOnceWith('/upgrade')
      }
      TestRenderer.act(() => tree.unmount())
    })
  })


  it.each([true, false])('withholds the Pro entry while the plan is unknown and loading is %s', async (isLoading) => {
    mockRealListRow.current = true
    mockProfileState.current = { profile: undefined, isLoading, error: isLoading ? null : new Error('load failed') }
    const tree = await renderProfileScreen()
    expect(nodeText(tree.root)).not.toContain('upgrade.pitchTitle')
    TestRenderer.act(() => tree.unmount())
  })

  it.each(['account', 'preferences', 'astra', 'notifications'] as const)('offers recovery for a failed %s load and keeps its settings hidden', async (destination) => {
    mockProfileState.current = { profile: undefined, isLoading: false, error: new Error('load failed') }
    const tree = await renderProfileSubscreen(destination)
    expect(nodeText(tree.root)).toContain('errors.loadProfile')
    TestRenderer.act(() => {
      tree.root.find((node: { type: unknown; props: { accessibilityRole?: string; accessibilityLabel?: string } }) =>
        typeof node.type === 'string' && node.props.accessibilityRole === 'button' && (node.props.accessibilityLabel === 'common.retry' || nodeText(node) === 'common.retry')).props.onPress()
    })
    expect(mockRefetchProfile).toHaveBeenCalledOnce()
    expect(tree.root.findAllByProps({ testID: 'profile-api-keys' })).toHaveLength(0)
    expect(tree.root.findAll((node: { props: { accessibilityRole?: string } }) => node.props.accessibilityRole === 'switch')).toHaveLength(0)
    TestRenderer.act(() => tree.unmount())
  })

  it.each([
    ['account', ['profile.settingsRows.export', 'profile.analytics.title', 'profile.settingsRows.startOver', 'profile.settingsRows.deleteAccount']],
    ['preferences', ['profile.settingsRows.timezone', 'profile.settingsRows.weekStart', 'settings.clock.title', 'profile.language.title', 'profile.settingsRows.theme', 'settings.homeScreen.showGeneral']],
    ['astra', ['profile.allowance.title', 'profile.proactiveAstra.title', 'profile.aiSummary.title', 'profile.settingsRows.apiKeysMcp']],
    ['notifications', ['profile.settingsRows.remindersNote']],
  ] as const)('opens %s from Perfil and keeps its settings in that screen alone', async (destination, labels) => {
    mockRealListRow.current = true
    const top = await renderProfileScreen()
    const title = destination === 'account' ? mockProfileState.current.profile?.name : destination === 'preferences' ? 'profile.submenus.preferences' : `profile.groups.${destination}`
    TestRenderer.act(() => {
      top.root.find((node: { type: unknown; props: { accessibilityRole?: string }; children: unknown[] }) =>
        typeof node.type === 'string' && node.props.accessibilityRole === 'button' && nodeText(node).startsWith(title ?? '')).props.onPress()
    })
    expect(mockRouterPush).toHaveBeenLastCalledWith(`/profile/${destination}`)
    TestRenderer.act(() => top.unmount())
    const tree = await renderProfileSubscreen(destination)
    const group = tree.root.findByProps({ testID: `profile-settings-group-${destination}` })
    for (const label of labels) expect(nodeText(group) + group.findAllByProps({ label }).map((row: { props: { label: string } }) => row.props.label).join('')).toContain(label)
    expect(labels.map((label) => nodeText(group).indexOf(label))).toEqual(labels.map((label) => nodeText(group).indexOf(label)).sort((left, right) => left - right))
    TestRenderer.act(() => {
      tree.root.find((node: { type: unknown; props: { accessibilityRole?: string; accessibilityLabel?: string } }) =>
        typeof node.type === 'string' && node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'common.backToProfile').props.onPress()
    })
    expect(mockRouterPush).toHaveBeenLastCalledWith('/profile')
    for (const other of ['account', 'preferences', 'astra', 'notifications']) {
      if (other !== destination) expect(tree.root.findAllByProps({ testID: `profile-settings-group-${other}` })).toHaveLength(0)
    }
    TestRenderer.act(() => tree.unmount())
  })

  it('forwards a directly linked subscription success return to Astra', async () => {
    mockSearchParams.current = { subscription: 'success' }
    const tree = await renderProfileScreen()
    expect(mockRouterPush).toHaveBeenCalledWith('/profile/astra?subscription=success')
    TestRenderer.act(() => tree.unmount())
  })

  it('opens each settings sub-screen from Perfil without showing its controls there', async () => {
    const tree = await renderProfileScreen()
    for (const [label, path] of [
      [mockProfileState.current.profile?.name ?? 'profile.submenus.account', '/profile/account'],
      ['profile.submenus.preferences', '/profile/preferences'],
      ['profile.groups.astra', '/profile/astra'],
      ['profile.groups.notifications', '/profile/notifications'],
    ] as const) {
      TestRenderer.act(() => {
        findRowByLabel(tree, label).props.onPress?.()
      })
      expect(mockRouterPush).toHaveBeenLastCalledWith(path)
    }
    expect(nodeText(tree.root)).not.toContain('profile.settingsRows.timezone')
    expect(nodeText(tree.root)).not.toContain('profile.settingsRows.apiKeysMcp')
  })

  beforeEach(() => {
    mockRealListRow.current = false
    mockTranslate.current = (key, params) => key === 'profile.settingsRows.devicesCount' ? [params?.count ?? '', 'of', params?.max ?? ''].join(' ') : key
    mockLocale.current = 'en'
    mockApiClient.mockReset()
    mockPerformQueuedApiMutation.mockReset()
    mockShareAsync.mockReset().mockResolvedValue(undefined)
    mockShellNoticeSlot.mockReset()
    mockRefetchProfile.mockReset()
    mockPatchProfile.mockReset()
    mockUseGamificationProfile.mockClear()
    mockRouterPush.mockClear()
    mockSetAstraConversationOpen.mockClear()
    mockSendAccessibilityEvent.mockClear()
    mockAnnounceForAccessibility.mockClear()
    mockApplyTheme.mockClear()
    mockChangeLanguage.mockReset().mockResolvedValue(undefined)
    mockPushSupported.current = false
    mockPushEnabled.current = false
    mockPushError.current = null
    mockDeviceState.current = { count: 0, max: 5, isCurrentDeviceRegistered: false, isLoading: false, isError: false, refresh: vi.fn().mockResolvedValue(undefined) }
    mockFocusCallback.current = null
    mockPushPermissionStatus.current = null
    mockDisablePushNotifications.mockReset().mockResolvedValue(undefined)
    mockOpenSettings.mockReset().mockResolvedValue(undefined)
    mockRequestPushPermission.mockReset().mockResolvedValue(undefined)
    mockRefreshPushPermissionStatus.mockReset().mockResolvedValue(undefined)
    mockRemoveAppStateListener.mockReset()
    mockAddAppStateListener.mockReset().mockReturnValue({ remove: mockRemoveAppStateListener })
    mockConversationOpen.current = false
    mockRealConsentSection.current = false
    vi.mocked(beginStepUpChallenge).mockClear()
    mockAuthState.user.userId = 'user-1'
    mockSearchParams.current = {}
    mockStepUpVerified.current = false
    mockCreateGrant.consumed = false
    mockApiKeys.current = []
    mockProfileState.current = {
      profile: createMockProfile({
        plan: 'free',
        hasProAccess: false,
        aiMessagesUsed: 2,
        aiMessagesLimit: 5,
      }),
      isLoading: false,
      error: null,
    }
  })

  it('renders every feature destination as a grouped settings row with its hint', async () => {
    const tree = await renderProfileScreen()

    const groupLabels = [
      'profile.groups.more',
    ]
    for (const label of groupLabels) {
      expect(
        tree.root.findAll(
          (node: { children?: unknown[] }) => node.children?.includes(label),
        ).length,
      ).toBeGreaterThan(0)
    }

    expect(findRowByLabel(tree, 'profile.settingsRows.wrapped').props.hint).toBeUndefined()
    expect(findRowByLabel(tree, 'profile.widgetTitle').props.hint).toBeUndefined()
    expect(findRowByLabel(tree, 'profile.calendarSync.title').props.hint).toBeUndefined()
    expect(findRowByLabel(tree, 'profile.support.rowTitle').props.hint).toBeUndefined()
    expect(findRowByLabel(tree, 'profile.aboutRow').props.hint).toBeUndefined()

    const more = tree.root.findByProps({ testID: 'profile-settings-group-more' })
    expect(more.findAllByType('RowListStub')[0].props.rowCount).toBeGreaterThan(1)
    expect(
      more.findAll((node: SettingsRowStubNode) => node.type === 'SettingsRowStub')
        .map((node: SettingsRowStubNode) => node.props.label),
    ).toEqual([
      'profile.settingsRows.wrapped',
      'profile.widgetTitle',
      'profile.calendarSync.title',
      'profile.support.rowTitle',
      'profile.aboutRow',
    ])

    for (const movedLabel of [
      'profile.sections.preferences',
      'profile.sections.aiFeatures',
      'profile.sections.advanced',
    ]) {
      expect(
        tree.root.findAll(
          (node: SettingsRowStubNode) =>
            node.type === 'SettingsRowStub' && node.props.label === movedLabel,
        ),
      ).toHaveLength(0)
    }

    const removedLabels = [
      ['so', 'cial.profileNav.title'].join(''),
      ['profile.public', 'Profile.title'].join(''),
    ]
    for (const label of removedLabels) {
      expect(
        tree.root.findAll(
          (node: SettingsRowStubNode) =>
            node.type === 'SettingsRowStub' && node.props.label === label,
        ),
      ).toHaveLength(0)
    }
  })

  it('keeps the share card off Perfil', async () => {
    const tree = await renderProfileScreen()
    expect(
      tree.root.findAll(
        (node: SettingsRowStubNode) =>
          node.type === 'SettingsRowStub' && node.props.label === 'shareCard.entry',
      ),
    ).toHaveLength(0)
  })

  it('puts Sign out first in Ending things', async () => {
    const tree = await renderProfileScreen()
    const ending = tree.root.findByProps({ testID: 'profile-settings-group-ending' })
    const rows = ending.findAll(
      (node: SettingsRowStubNode) => node.type === 'SettingsRowStub',
    ) as SettingsRowStubNode[]

    expect(rows[0]?.props.label).toBe('profile.settingsRows.signOut')
  })

  it('shows the free daily allowance as an enabled route to Pro', async () => {
    const tree = await renderProfileSubscreen('astra')
    const astra = tree.root.findByProps({ testID: 'profile-settings-group-astra' })
    const progress = astra.findByProps({
      accessibilityRole: 'progressbar',
      accessibilityLabel: 'profile.allowance.title',
    })
    expect(progress.props.accessibilityValue).toEqual({ min: 0, max: 5, now: 2 })
    expect(
      astra.findAll((node: { children: unknown[] }) =>
        node.children.includes('profile.allowance.spent')),
    ).toHaveLength(0)
    const allowance = tree.root.findByProps({ testID: 'astra-allowance-panel' })
    const allowanceGate = allowance.findByProps({
      accessibilityRole: 'button',
      accessibilityLabel: 'profile.allowance.seePro',
    })

    TestRenderer.act(() => {
      allowanceGate.props.onPress()
    })
    expect(allowanceGate.props.accessibilityState.disabled).toBe(false)
    expect(mockRouterPush).toHaveBeenNthCalledWith(1, {
      pathname: '/upgrade',
      params: { from: '/profile/astra' },
    })
  })

  it('shows both free Astra switch gates as enabled routes to Pro', async () => {
    const tree = await renderProfileSubscreen('astra')
    const proactiveGate = findRowByLabel(tree, 'profile.proactiveAstra.title')
    const summaryGate = findRowByLabel(tree, 'profile.aiSummary.title')

    expect(proactiveGate.props.accessibilityRole).toBe('button')
    expect(summaryGate.props.accessibilityRole).toBe('button')
    expect(proactiveGate.props.onPress).toEqual(expect.any(Function))
    expect(summaryGate.props.onPress).toEqual(expect.any(Function))
    TestRenderer.act(() => {
      proactiveGate.props.onPress?.()
      summaryGate.props.onPress?.()
    })
    expect(mockRouterPush).toHaveBeenNthCalledWith(1, {
      pathname: '/upgrade',
      params: { from: '/profile/astra' },
    })
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, {
      pathname: '/upgrade',
      params: { from: '/profile/astra' },
    })
  })

  it.each([
    ['pt-BR', false, 'Astra avisa quando algo escapa', 'Resumo do dia pela Astra'],
    ['pt-BR', true, 'Astra avisa quando algo escapa', 'Resumo do dia pela Astra'],
    ['en', false, 'Astra tells you when something slips', 'Daily summary from Astra'],
    ['en', true, 'Astra tells you when something slips', 'Daily summary from Astra'],
  ] as const)('renders the %s Astra labels for Pro access %s', async (locale, hasProAccess, proactive, summary) => {
    mockLocale.current = locale
    const messages = locale === 'pt-BR' ? ptBR : en
    mockTranslate.current = (key) => {
      let message: unknown = messages
      for (const segment of key.split('.')) {
        message = message && typeof message === 'object'
          ? (message as Record<string, unknown>)[segment]
          : undefined
      }
      return typeof message === 'string' ? message : key
    }
    mockProfileState.current.profile = createMockProfile({
      plan: hasProAccess ? 'pro' : 'free', hasProAccess, language: locale,
    })
    const tree = await renderProfileSubscreen('astra')
    const astra = tree.root.findByProps({ testID: 'profile-settings-group-astra' })

    if (hasProAccess) {
      expect(astra.findByProps({ accessibilityRole: 'switch', accessibilityLabel: proactive })).toBeDefined()
      expect(astra.findByProps({ accessibilityRole: 'switch', accessibilityLabel: summary })).toBeDefined()
    } else {
      for (const label of [proactive, summary]) {
        const row = findRowByLabel(tree, label)
        expect(row.props.accessibilityRole).toBe('button')
        expect(row.props.hasTrailing).toBe(true)
        expect(row.props.chevron).toBe(false)
        expect(row.props.hint).toBeUndefined()
        TestRenderer.act(() => row.props.onPress?.())
      }
      expect(mockRouterPush).toHaveBeenNthCalledWith(1, { pathname: '/upgrade', params: { from: '/profile/astra' } })
      expect(mockRouterPush).toHaveBeenNthCalledWith(2, { pathname: '/upgrade', params: { from: '/profile/astra' } })
    }
  })

  it('badges the locked API keys section Pro, never with the trial label', async () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'free', hasProAccess: false, isTrialActive: true }),
      isLoading: false,
      error: null,
    }
    const tree = await renderProfileSubscreen('astra')

    const apiKeys = tree.root.findByProps({ testID: 'profile-api-keys' })
    const badges = apiKeys.findAll((node: { type: unknown; props: { testID?: string } }) =>
      typeof node.type === 'string'
      && typeof node.props.testID === 'string' && node.props.testID.startsWith('badge-'))
    expect(badges.map((badge: { props: { testID?: string } }) => badge.props.testID))
      .toEqual(['badge-solid', 'badge-solid'])
    expect(badges.map(nodeText)).toEqual(['common.proBadge', 'common.proBadge'])
    expect(nodeText(apiKeys)).not.toContain('trial.proBadge')
  })

  it('shows only the API key description and upgrade row to free accounts', async () => {
    const tree = await renderProfileSubscreen('astra')
    const astra = tree.root.findByProps({ testID: 'profile-settings-group-astra' })

    expect(
      astra.findAll((node: { children: unknown[] }) =>
        node.children.includes('profile.apiKeys.description')),
    ).toHaveLength(1)
    const upgradeRow = findRowByLabel(tree, 'profile.apiKeys.unlock')
    expect(upgradeRow.props.accessibilityRole).toBe('button')
    expect(upgradeRow.props.onPress).toEqual(expect.any(Function))
    expect(
      astra.findAll((node: { children: unknown[] }) =>
        node.children.includes('orbitMcp.noKeys')),
    ).toHaveLength(0)

    TestRenderer.act(() => {
      upgradeRow.props.onPress?.()
    })
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/upgrade',
      params: { from: '/profile/astra' },
    })
  })

  it('keeps every free API key state on the enabled lock route', async () => {
    mockStepUpVerified.current = true
    mockApiKeys.current = [{
      id: 'key-1',
      name: 'Work key',
      keyPrefix: 'orb_live_1234',
    }]
    const tree = await renderProfileSubscreen('astra')

    const upgradeRow = findRowByLabel(tree, 'profile.apiKeys.unlock')
    expect(upgradeRow.props.accessibilityRole).toBe('button')
    expect(upgradeRow.props.onPress).toEqual(expect.any(Function))
    expect(
      tree.root.findAll((node: { children: unknown[] }) =>
        node.children.includes('Work key')),
    ).toHaveLength(0)
    TestRenderer.act(() => upgradeRow.props.onPress?.())
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/upgrade',
      params: { from: '/profile/astra' },
    })
  })

  it('puts the step up before the API key list for Pro accounts', async () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    const tree = await renderProfileSubscreen('astra')

    TestRenderer.act(() => {
      findRowByLabel(tree, 'profile.apiKeys.open').props.onPress?.()
    })
    expect(
      tree.root.findAll((node: { children: unknown[] }) =>
        node.children.includes('profile.apiKeys.stepUpAction')),
    ).toHaveLength(1)
  })

  it('does not unlock API keys from a manually typed return hint', async () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    mockSearchParams.current = { 'api-keys': '1' }
    mockApiKeys.current = [{
      id: 'key-1',
      name: 'Work key',
      keyPrefix: 'orb_live_1234',
    }]

    const tree = await renderProfileSubscreen('astra')

    expect(findRowByLabel(tree, 'profile.apiKeys.open')).toBeDefined()
    expect(
      tree.root.findAll((node: { children: unknown[] }) =>
        node.children.includes('Work key')),
    ).toHaveLength(0)
  })

  it('shows verified keys with a named revoke action', async () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    mockStepUpVerified.current = true
    mockApiKeys.current = [{
      id: 'key-1',
      name: 'Work key',
      keyPrefix: 'orb_live_1234',
      scopes: [],
      isReadOnly: false,
      expiresAtUtc: null,
      createdAtUtc: '2026-09-14T12:00:00Z',
      lastUsedAtUtc: null,
      isRevoked: false,
    }]
    const tree = await renderProfileSubscreen('astra')

    const keyRow = findRowByLabel(tree, 'Work key')
    expect(keyRow.props.value).toBe('orb_live_1234…')
    const revoke = tree.root.findByProps({
      accessibilityRole: 'button',
      accessibilityLabel: 'profile.apiKeys.revokeNamed',
    })
    TestRenderer.act(() => revoke.props.onPress())
    expect(
      tree.root.findAll((node: { type: unknown; props: { title?: string } }) =>
        node.type === 'SheetStub' && node.props.title === 'profile.apiKeys.revokeNamedQuestion'),
    ).toHaveLength(1)
  })

  it('resets scoped creation after cancellation and successful creation', async () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    mockStepUpVerified.current = true
    mockApiClient
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce({ id: 'key-2', key: 'orb_secret' })
    const tree = await renderProfileSubscreen('astra')

    await TestRenderer.act(async () => {
      findButtonByText(tree, 'profile.apiKeys.createScoped').props.onPress()
      await Promise.resolve()
    })
    const firstInput = tree.root.findByProps({ accessibilityLabel: 'profile.apiKeys.scopeLabel' })
    await TestRenderer.act(async () => {
      firstInput.props.onChangeText('stale:scope')
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      findButtonByText(tree, 'profile.apiKeys.scopeAction').props.onPress()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(nodeText(tree.root)).toContain('orbitMcp.createKeyError')
    TestRenderer.act(() => findButtonByText(tree, 'common.cancel').props.onPress())

    TestRenderer.act(() => findButtonByText(tree, 'profile.apiKeys.createScoped').props.onPress())
    expect(tree.root.findByProps({ accessibilityLabel: 'profile.apiKeys.scopeLabel' }).props.value).toBe('')
    expect(nodeText(tree.root)).not.toContain('orbitMcp.createKeyError')
    await TestRenderer.act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'profile.apiKeys.scopeLabel' }).props.onChangeText('fresh:scope')
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      findButtonByText(tree, 'profile.apiKeys.scopeAction').props.onPress()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(nodeText(tree.root)).toContain('orb_secret')
    TestRenderer.act(() => findButtonByText(tree, 'orbitMcp.done').props.onPress())

    tree.unmount()
    mockCreateGrant.consumed = false
    const secondTree = await renderProfileSubscreen('astra')
    TestRenderer.act(() => findButtonByText(secondTree, 'profile.apiKeys.createScoped').props.onPress())
    expect(secondTree.root.findByProps({ accessibilityLabel: 'profile.apiKeys.scopeLabel' }).props.value).toBe('')
  })

  it('requires a fresh verified grant before creating a second key', async () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    mockStepUpVerified.current = true
    const createdKeys = [
      { id: 'key-1', key: 'orb_first' },
      { id: 'key-2', key: 'orb_second' },
    ]
    mockApiClient.mockImplementation((endpoint: string) =>
      Promise.resolve(endpoint === API.apiKeys.create ? createdKeys.shift() : undefined))
    const tree = await renderProfileSubscreen('astra')

    await TestRenderer.act(async () => {
      findButtonByText(tree, 'profile.apiKeys.create').props.onPress()
      await Promise.resolve()
      await Promise.resolve()
    })
    TestRenderer.act(() => findButtonByText(tree, 'orbitMcp.copy').props.onPress())
    expect(nodeText(tree.root)).toContain('orbitMcp.copied')
    TestRenderer.act(() => findButtonByText(tree, 'orbitMcp.done').props.onPress())

    await TestRenderer.act(async () => {
      findButtonByText(tree, 'profile.apiKeys.create').props.onPress()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockRouterPush).toHaveBeenCalledWith('/step-up?operation=keys')
    expect(mockApiClient.mock.calls.filter(([endpoint]) => endpoint === API.apiKeys.create)).toHaveLength(1)

    tree.unmount()
    mockStepUpVerified.current = true
    mockCreateGrant.consumed = false
    const secondTree = await renderProfileSubscreen('astra')
    await TestRenderer.act(async () => {
      findButtonByText(secondTree, 'profile.apiKeys.create').props.onPress()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(nodeText(secondTree.root)).toContain('orb_second')
    expect(nodeText(secondTree.root)).toContain('orbitMcp.copy')
  })

  it('restarts step up when the API rejects a stale create grant', async () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    mockStepUpVerified.current = true
    mockApiClient
      .mockRejectedValueOnce(createApiClientError(428, {
        error: 'Confirm the emailed code before creating an API key.',
        errorCode: 'API_KEY_CREATION_CHALLENGE_REQUIRED',
      }, 'Challenge required'))
      .mockResolvedValueOnce(undefined)
    const tree = await renderProfileSubscreen('astra')

    await TestRenderer.act(async () => {
      findButtonByText(tree, 'profile.apiKeys.create').props.onPress()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockRouterPush).toHaveBeenCalledWith('/step-up?operation=keys')
    expect(mockCreateGrant.consumed).toBe(true)
    expect(nodeText(tree.root)).not.toContain('orbitMcp.createKeyError')
  })

  it.each(['success', 'failure'])('drops a late API key challenge %s after replacement', async (outcome) => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    mockStepUpVerified.current = true
    mockCreateGrant.consumed = true
    let settle!: () => void
    let reject!: (reason: Error) => void
    mockApiClient.mockReturnValue(new Promise((resolve, rejectPromise) => {
      settle = () => resolve({ message: 'sent' })
      reject = rejectPromise
    }))
    const tree = await renderProfileSubscreen('astra')
    TestRenderer.act(() => findButtonByText(tree, 'profile.apiKeys.create').props.onPress())
    expect(mockApiClient).toHaveBeenCalledWith(
      API.apiKeys.requestCreationChallenge,
      { method: 'POST' },
      expect.anything(),
    )

    mockAuthState.user.userId = 'user-2'
    TestRenderer.act(() => {
      tree.unmount()
      advanceAccountGeneration()
    })
    await TestRenderer.act(async () => {
      if (outcome === 'success') settle()
      else reject(new Error('Account A failure'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(beginStepUpChallenge).not.toHaveBeenCalled()
    expect(mockRouterPush).not.toHaveBeenCalledWith('/step-up?operation=keys')
  })

  it('does not navigate when account replacement interrupts timing storage', async () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    mockStepUpVerified.current = true
    mockCreateGrant.consumed = true
    mockApiClient.mockResolvedValue({ message: 'sent' })
    let settle!: () => void
    vi.mocked(beginStepUpChallenge).mockReturnValueOnce(new Promise<StepUpTimingRecord>((resolve) => {
      settle = () => resolve({ operation: 'keys', sentAt: Date.now() })
    }))
    const tree = await renderProfileSubscreen('astra')
    await TestRenderer.act(async () => {
      findButtonByText(tree, 'profile.apiKeys.create').props.onPress()
      await Promise.resolve()
    })
    expect(beginStepUpChallenge).toHaveBeenCalledWith('keys', 'user-1')

    TestRenderer.act(() => advanceAccountGeneration())
    await TestRenderer.act(async () => {
      settle()
      await Promise.resolve()
    })

    expect(mockRouterPush).not.toHaveBeenCalledWith('/step-up?operation=keys')
  })

  it('shows trial copy and routes its allowance action to the trial pitch', async () => {
    mockProfileState.current = {
      profile: createMockProfile({
        plan: 'pro',
        hasProAccess: true,
        isTrialActive: true,
        aiMessagesUsed: 2,
        aiMessagesLimit: 50,
      }),
      isLoading: false,
      error: null,
    }
    const tree = await renderProfileSubscreen('astra')
    const astra = tree.root.findByProps({ testID: 'profile-settings-group-astra' })
    expect(
      astra.findAll((node: { children: unknown[] }) =>
        node.children.includes('profile.subscription.trial')),
    ).toHaveLength(1)
    expect(
      astra.findAll((node: { children: unknown[] }) =>
        node.children.includes('profile.allowance.manageSubscription')),
    ).toHaveLength(0)

    TestRenderer.act(() => {
      tree.root.findByProps({
        accessibilityRole: 'button',
        accessibilityLabel: 'profile.allowance.seePro',
      }).props.onPress()
    })
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/upgrade',
      params: { from: '/profile/astra' },
    })
  })

  it('shows a spent Pro allowance and hands subscription management off directly', async () => {
    mockProfileState.current = {
      profile: createMockProfile({
        plan: 'pro',
        hasProAccess: true,
        aiMessagesUsed: 50,
        aiMessagesLimit: 50,
      }),
      isLoading: false,
      error: null,
    }
    const tree = await renderProfileSubscreen('astra')
    const astra = tree.root.findByProps({ testID: 'profile-settings-group-astra' })
    const progress = astra.findByProps({
      accessibilityRole: 'progressbar',
      accessibilityLabel: 'profile.allowance.title',
    })
    expect(progress.props.accessibilityValue).toEqual({ min: 0, max: 50, now: 50 })
    expect(astra.findByProps({ testID: 'progress-bar-complete' })).toBeDefined()
    expect(
      astra.findAll((node: { children: unknown[] }) =>
        node.children.includes('profile.allowance.spent')),
    ).toHaveLength(1)
    expect(
      astra.findAll((node: { children: unknown[] }) =>
        node.children.includes('profile.allowance.seePro')),
    ).toHaveLength(0)

    TestRenderer.act(() => {
      tree.root.findByProps({
        accessibilityRole: 'button',
        accessibilityLabel: 'profile.allowance.manageSubscription',
      }).props.onPress()
    })
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/upgrade',
      params: { from: '/profile/astra' },
    })
    const proactiveSwitch = astra.findByProps({
      accessibilityRole: 'switch',
      accessibilityLabel: 'profile.proactiveAstra.title',
    })
    const summarySwitch = astra.findByProps({
      accessibilityRole: 'switch',
      accessibilityLabel: 'profile.aiSummary.title',
    })
    expect(astra.findAllByType('RowListStub')[0].props.rowCount).toBe(2)
    TestRenderer.act(() => {
      proactiveSwitch.props.onPress()
      summarySwitch.props.onPress()
    })
    expect(mockPerformQueuedApiMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'setProactiveAstra',
      payload: { enabled: true },
    }))
    expect(mockPerformQueuedApiMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'setAiSummary',
      payload: { enabled: false },
    }))
  })

  it('shows lifetime Pro without advertising a subscription management action', async () => {
    mockProfileState.current = {
      profile: createMockProfile({
        plan: 'pro',
        hasProAccess: true,
        isTrialActive: false,
        isLifetimePro: true,
        aiMessagesUsed: 2,
        aiMessagesLimit: 50,
      }),
      isLoading: false,
      error: null,
    }
    const tree = await renderProfileSubscreen('astra')
    const astra = tree.root.findByProps({ testID: 'profile-settings-group-astra' })

    expect(
      astra.findAll((node: { children: unknown[] }) =>
        node.children.includes('profile.allowance.pro')),
    ).toHaveLength(1)
    expect(
      astra.findAll((node: { children: unknown[] }) =>
        node.children.includes('profile.allowance.seePro')),
    ).toHaveLength(0)
    expect(
      astra.findAll((node: { children: unknown[] }) =>
        node.children.includes('profile.allowance.manageSubscription')),
    ).toHaveLength(0)
  })

  it('shows Preparing on the row and registers completion in the shell notice slot', async () => {
    let finishExport!: (value: Record<string, never>) => void
    mockApiClient.mockReturnValueOnce(
      new Promise((resolve) => {
        finishExport = resolve
      }),
    )
    const tree = await renderProfileSubscreen('account')

    await TestRenderer.act(async () => {
      findRowByLabel(tree, 'profile.settingsRows.export').props.onPress?.()
      await Promise.resolve()
    })
    expect(findRowByLabel(tree, 'profile.settingsRows.export').props.value).toBe(
      'dataExport.preparing',
    )

    await TestRenderer.act(async () => {
      finishExport({})
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mockShellNoticeSlot.mock.calls.some(([enabled]) => enabled)).toBe(true)
    const noticeCall = [...mockShellNoticeSlot.mock.calls]
      .reverse()
      .find((call) => call[0] === true)
    const notice = noticeCall?.[1]() as React.ReactElement<{ kind: string; message: string }>
    expect(notice.props).toMatchObject({ kind: 'done', message: 'dataExport.done' })
  })

  it('opens the timezone picker from the timezone row', async () => {
    const tree = await renderProfileSubscreen('preferences')

    await TestRenderer.act(async () => {
      findRowByLabel(tree, 'profile.settingsRows.timezone').props.onPress?.()
      await Promise.resolve()
    })

    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(
      tree.root.findAll(
        (node: { props: { accessibilityRole?: string; accessibilityState?: { checked?: boolean } } }) =>
          node.props.accessibilityRole === 'radio' &&
          node.props.accessibilityState?.checked === true,
      ).length,
    ).toBeGreaterThan(0)
  })

  it.each([true, false])('renders answered email consent %s before the matching device row and reminders note', async (consent) => {
    mockPushSupported.current = true
    mockRealConsentSection.current = true
    mockRealListRow.current = true
    mockProfileState.current.profile = createMockProfile({ marketingEmailConsent: consent })
    const tree = await renderProfileSubscreen('notifications')
    const group = tree.root.findByProps({ testID: 'profile-settings-group-notifications' })
    const rows = group.findAllByType(ListRow)
    expect(rows.map((row: { props: { title: string } }) => row.props.title)).toEqual([
      'profile.marketingEmails.title',
      'profile.settingsRows.alertsOnThisDevice',
    ])
    for (const row of rows) {
      expect(row.props.icon).toBeUndefined()
      expect(row.props.readOnly).toBe(true)
      expect(row.props.chevron).toBe(false)
    }
    const controls = group.findAll((node: { type: unknown; props: { accessibilityRole?: string } }) =>
      typeof node.type === 'string' && node.props.accessibilityRole === 'switch')
    expect(controls.map((node: { props: { accessibilityLabel: string } }) => node.props.accessibilityLabel)).toEqual([
      'profile.marketingEmails.title',
      'profile.settingsRows.alertsOnThisDevice',
    ])
    expect(controls[0].props.accessibilityState.checked).toBe(consent)
    const text = nodeText(group)
    expect(text.indexOf('profile.settingsRows.alertsOnThisDevice')).toBeLessThan(text.indexOf('profile.settingsRows.remindersNote'))
    TestRenderer.act(() => tree.unmount())
  })

  it('renders only the drawn Notifications rows and the recorded deviations, in order', async () => {
    mockPushSupported.current = true
    mockRealConsentSection.current = true
    mockRealListRow.current = true
    const tree = await renderProfileSubscreen('notifications')
    const notificationsGroup = tree.root.findByProps({ testID: 'profile-settings-group-notifications' })
    const controls = notificationsGroup.findAll(
      (node: { type: unknown; props: { accessibilityRole?: string; onPress?: () => void } }) =>
        typeof node.type === 'string' &&
        ['switch', 'button', 'link'].includes(node.props.accessibilityRole ?? '') &&
        typeof node.props.onPress === 'function',
    )
    const textLines = notificationsGroup.findAll(
      (node: { type: unknown; children: unknown[] }) =>
        node.type === 'Text' && node.children.every((child) => typeof child === 'string'),
    ).map(nodeText).filter(Boolean)

    expect(textLines).toEqual([
      'profile.marketingEmails.question',
      'profile.marketingEmails.questionDescription',
      'profile.marketingEmails.decline',
      'profile.marketingEmails.accept',
      'profile.settingsRows.alertsOnThisDevice',
      'profile.settingsRows.remindersNote',
    ])
    expect(controls.map((node: { props: { accessibilityRole?: string; accessibilityLabel?: string } }) =>
      `${node.props.accessibilityRole}: ${node.props.accessibilityLabel ?? nodeText(node)}`)).toEqual([
      'button: profile.marketingEmails.decline',
      'button: profile.marketingEmails.accept',
      'switch: profile.settingsRows.alertsOnThisDevice',
    ])
  })

  it('restores the analytics switch and announces a failed local save', async () => {
    const write = vi.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage failed'))
    try {
      const tree = await renderProfileSubscreen('account')
      const control = tree.root.find(
        (node: { props: { accessibilityRole?: string; accessibilityLabel?: string; onPress?: () => void } }) =>
          node.props.accessibilityRole === 'switch' &&
          node.props.accessibilityLabel === 'profile.analytics.title' &&
          typeof node.props.onPress === 'function',
      )
      await TestRenderer.act(async () => {
        control.props.onPress()
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      expect(control.props.accessibilityState?.checked).toBe(true)
      expect(nodeText(tree.root)).toContain('profile.analytics.saveError')
      expect(mockAnnounceForAccessibility).toHaveBeenCalledWith('profile.analytics.saveError')
    } finally {
      write.mockRestore()
    }
  })

  it('redirects gated feature rows to upgrade for free users', async () => {
    const tree = await renderProfileScreen()
    const calendarRow = findRowByLabel(tree, 'profile.calendarSync.title')

    await TestRenderer.act(async () => {
      calendarRow.props.onPress?.()
      await Promise.resolve()
    })

    expect(calendarRow.props.chevron).toBe(false)
    expect(calendarRow.props.hasTrailing).toBe(true)
    expect(calendarRow.props.accessibilityRole).toBe('button')
    expect(calendarRow.props.onPress).toEqual(expect.any(Function))
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/upgrade',
      params: { from: '/profile' },
    })
  })

  it('routes every More of Orbit row', async () => {
    const tree = await renderProfileScreen()

    await TestRenderer.act(async () => {
      findRowByLabel(tree, 'profile.settingsRows.wrapped').props.onPress?.()
      await Promise.resolve()
    })
    expect(mockRouterPush).toHaveBeenCalledWith('/wrapped')
    mockRouterPush.mockClear()

    await TestRenderer.act(async () => {
      findRowByLabel(tree, 'profile.widgetTitle').props.onPress?.()
      await Promise.resolve()
    })
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(tree.root.findAll((node: { type: unknown; props: { title?: string } }) =>
      node.type === 'SheetStub' && node.props.title === 'profile.widgetTitle')).toHaveLength(1)
    mockRouterPush.mockClear()

    await TestRenderer.act(async () => {
      findRowByLabel(tree, 'profile.support.rowTitle').props.onPress?.()
      await Promise.resolve()
    })
    expect(mockRouterPush).toHaveBeenCalledWith('/support')
    mockRouterPush.mockClear()

    await TestRenderer.act(async () => {
      findRowByLabel(tree, 'profile.aboutRow').props.onPress?.()
      await Promise.resolve()
    })
    expect(mockRouterPush).toHaveBeenCalledWith('/about')
  })

  it('places the clock choice between week start and language', async () => {
    mockProfileState.current = { ...mockProfileState.current, profile: createMockProfile({ uses24HourClock: true }) }
    const tree = await renderProfileSubscreen('preferences')
    const rows = tree.root.findAll((node: SettingsRowStubNode) => node.type === 'SettingsRowStub')
    const labels = rows.map((row: SettingsRowStubNode) => row.props.label)
    expect(labels.indexOf('profile.settingsRows.weekStart')).toBeLessThan(labels.indexOf('settings.clock.title'))
    expect(labels.indexOf('settings.clock.title')).toBeLessThan(labels.indexOf('profile.language.title'))
    expect(findRowByLabel(tree, 'settings.clock.title').props.value).toBe('settings.clock.hour24')
  })

  it('opens each inline preference directly and sends Support to its form', async () => {
    const tree = await renderProfileSubscreen('preferences')
    for (const label of ['profile.language.title', 'profile.settingsRows.weekStart', 'settings.clock.title']) {
      mockRouterPush.mockClear()
      await TestRenderer.act(async () => {
        findRowByLabel(tree, label).props.onPress?.()
        await Promise.resolve()
      })
      expect(mockRouterPush).not.toHaveBeenCalled()
    }
    expect(tree.root.findAll((node: { props: { accessibilityRole?: string; accessibilityLabel?: string } }) =>
      node.props.accessibilityRole === 'radiogroup' && node.props.accessibilityLabel === 'profile.settingsRows.theme').length).toBeGreaterThan(0)
    const top = await renderProfileScreen()
    await TestRenderer.act(async () => {
      findRowByLabel(top, 'profile.support.rowTitle').props.onPress?.()
      await Promise.resolve()
    })
    expect(mockRouterPush).toHaveBeenCalledWith('/support')
    expect(mockSetAstraConversationOpen).not.toHaveBeenCalled()
  })

  it('refreshes push permission when the app becomes active', async () => {
    mockPushSupported.current = true
    const tree = await renderProfileSubscreen('notifications')
    expect(mockAddAppStateListener).toHaveBeenCalledWith('change', expect.any(Function))
    const onAppStateChange = mockAddAppStateListener.mock.calls[0]?.[1] as (state: string) => void
    await TestRenderer.act(async () => {
      onAppStateChange('background')
      await Promise.resolve()
    })
    expect(mockRefreshPushPermissionStatus).not.toHaveBeenCalled()
    await TestRenderer.act(async () => {
      onAppStateChange('active')
      await Promise.resolve()
    })
    expect(mockRefreshPushPermissionStatus).toHaveBeenCalledOnce()
    TestRenderer.act(() => tree.unmount())
    expect(mockRemoveAppStateListener).toHaveBeenCalledOnce()
  })

  it('changes theme and general habits from their inline controls', async () => {
    const write = vi.spyOn(AsyncStorage, 'setItem').mockResolvedValue(undefined)
    try {
      const tree = await renderProfileSubscreen('preferences')
      await TestRenderer.act(async () => {
        tree.root.find((node: { props: { accessibilityRole?: string; accessibilityLabel?: string; onPress?: () => void } }) =>
          node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === 'preferences.themeModeLight' && typeof node.props.onPress === 'function').props.onPress()
        tree.root.find((node: { props: { accessibilityRole?: string; accessibilityLabel?: string; onPress?: () => void } }) =>
          node.props.accessibilityRole === 'switch' && node.props.accessibilityLabel === 'settings.homeScreen.showGeneral' && typeof node.props.onPress === 'function').props.onPress()
        await Promise.resolve()
      })
      expect(mockApplyTheme).toHaveBeenCalledWith('light')
      expect(write).toHaveBeenCalledWith(expect.stringContaining('orbit_show_general_on_today'), 'true')
    } finally {
      write.mockRestore()
    }
  })

  it('commits language and week start through the inline pickers', async () => {
    const tree = await renderProfileSubscreen('preferences')
    TestRenderer.act(() => {
      findRowByLabel(tree, 'profile.language.title').props.onPress?.()
    })
    await TestRenderer.act(async () => {
      tree.root.find((node: { props: { accessibilityRole?: string; accessibilityLabel?: string; onPress?: () => void } }) =>
        node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === 'Português' && typeof node.props.onPress === 'function').props.onPress()
      await Promise.resolve()
    })
    expect(mockChangeLanguage).toHaveBeenCalledWith('pt-BR')
    expect(mockPerformQueuedApiMutation).toHaveBeenCalledWith(expect.objectContaining({ type: 'setLanguage', payload: { language: 'pt-BR' } }))

    TestRenderer.act(() => {
      findRowByLabel(tree, 'profile.settingsRows.weekStart').props.onPress?.()
    })
    await TestRenderer.act(async () => {
      tree.root.find((node: { props: { accessibilityRole?: string; accessibilityLabel?: string; onPress?: () => void } }) =>
        node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === 'settings.weekStartDay.sunday' && typeof node.props.onPress === 'function').props.onPress()
      await Promise.resolve()
    })
    expect(mockPerformQueuedApiMutation).toHaveBeenCalledWith(expect.objectContaining({ type: 'setWeekStartDay', payload: { weekStartDay: 0 } }))
  })

  it('uses an inline switch for this device', async () => {
    mockPushSupported.current = true
    const tree = await renderProfileSubscreen('notifications')
    await TestRenderer.act(async () => {
      tree.root.find((node: { props: { accessibilityRole?: string; accessibilityLabel?: string; onPress?: () => void } }) =>
        node.props.accessibilityRole === 'switch' && node.props.accessibilityLabel === 'profile.settingsRows.alertsOnThisDevice' && typeof node.props.onPress === 'function').props.onPress()
      await Promise.resolve()
    })
    expect(mockRequestPushPermission).toHaveBeenCalledOnce()
  })

  it.each([0, 1, 5])('shows one notification switch without a count for %i devices', async (count) => {
    mockDeviceState.current.count = count
    mockRealListRow.current = true
    const tree = await renderProfileSubscreen('notifications')
    expect(nodeText(tree.root)).toContain('profile.settingsRows.alertsOnThisDevice')
    expect(nodeText(tree.root)).not.toContain(`${count} of 5`)
    expect(nodeText(tree.root)).not.toContain('profile.settingsRows.devices')
  })

  it('turns a registered device off even at the cap', async () => {
    mockPushSupported.current = true
    mockDeviceState.current.count = 5
    mockDeviceState.current.isCurrentDeviceRegistered = true
    const tree = await renderProfileSubscreen('notifications')
    const control = tree.root.find((node: { props: { accessibilityRole?: string; onPress?: () => void } }) =>
      node.props.accessibilityRole === 'switch' && typeof node.props.onPress === 'function')
    expect(control.props.accessibilityState?.checked).toBe(true)
    await TestRenderer.act(async () => { control.props.onPress(); await Promise.resolve() })
    expect(mockDisablePushNotifications).toHaveBeenCalledOnce()
  })

  it('disables the switch while devices load', async () => {
    mockDeviceState.current.count = undefined
    mockDeviceState.current.isLoading = true
    const tree = await renderProfileSubscreen('notifications')
    expect(tree.root.findAll((node: { props: { accessibilityRole?: string; accessibilityState?: { disabled?: boolean } } }) =>
      node.props.accessibilityRole === 'switch' && node.props.accessibilityState?.disabled === true)).not.toHaveLength(0)
  })

  it('reports the cap only after an enable attempt without prompting or registering', async () => {
    mockPushPermissionStatus.current = 'granted'
    mockPushError.current = 'profile.settingsRows.pushDeviceLimit'
    mockPushSupported.current = true
    mockDeviceState.current.count = 5
    const tree = await renderProfileSubscreen('notifications')
    expect(nodeText(tree.root)).not.toContain('profile.settingsRows.pushDeviceLimit')
    const control = tree.root.find((node: { props: { accessibilityRole?: string; onPress?: () => void } }) =>
      node.props.accessibilityRole === 'switch' && typeof node.props.onPress === 'function')
    expect(control.props.accessibilityState?.disabled).not.toBe(true)
    await TestRenderer.act(async () => { control.props.onPress(); await Promise.resolve() })
    expect(nodeText(tree.root)).toContain('profile.settingsRows.pushDeviceLimit')
    expect(mockRequestPushPermission).not.toHaveBeenCalled()
    expect(control.props.accessibilityState?.checked).toBe(false)
  })

  it('offers retry when the device list fails', async () => {
    mockDeviceState.current.isError = true
    const tree = await renderProfileSubscreen('notifications')
    await TestRenderer.act(async () => {
      tree.root.find((node: { props: { accessibilityRole?: string; accessibilityLabel?: string; onPress?: () => void } }) =>
        node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'common.retry' && typeof node.props.onPress === 'function').props.onPress()
      await Promise.resolve()
    })
    expect(mockDeviceState.current.refresh).toHaveBeenCalledOnce()
  })

  it('refreshes the device count when Perfil regains focus', async () => {
    await renderProfileSubscreen('notifications')
    expect(mockFocusCallback.current).toBeTypeOf('function')
    await TestRenderer.act(async () => {
      mockFocusCallback.current?.()
      await Promise.resolve()
    })
    expect(mockDeviceState.current.refresh).toHaveBeenCalledOnce()
  })

  it('disables an enabled push registration from Perfil', async () => {
    mockPushSupported.current = true
    mockDeviceState.current.count = 1
    mockDeviceState.current.isCurrentDeviceRegistered = true
    const tree = await renderProfileSubscreen('notifications')
    await TestRenderer.act(async () => {
      tree.root.find((node: { props: { accessibilityRole?: string; accessibilityLabel?: string; onPress?: () => void } }) =>
        node.props.accessibilityRole === 'switch' && node.props.accessibilityLabel === 'profile.settingsRows.alertsOnThisDevice' && typeof node.props.onPress === 'function').props.onPress()
      await Promise.resolve()
    })
    expect(mockDisablePushNotifications).toHaveBeenCalledOnce()
    expect(mockRequestPushPermission).not.toHaveBeenCalled()
    expect(mockOpenSettings).not.toHaveBeenCalled()
  })

  it('opens device settings when push permission is denied', async () => {
    mockPushSupported.current = true
    mockPushPermissionStatus.current = 'denied'
    const tree = await renderProfileSubscreen('notifications')
    await TestRenderer.act(async () => {
      tree.root.find((node: { props: { accessibilityRole?: string; accessibilityLabel?: string; onPress?: () => void } }) =>
        node.props.accessibilityRole === 'switch' && node.props.accessibilityLabel === 'profile.settingsRows.alertsOnThisDevice' && typeof node.props.onPress === 'function').props.onPress()
      tree.root.find((node: { props: { accessibilityRole?: string; onPress?: () => void }; children: unknown[] }) =>
        node.props.accessibilityRole === 'button' && nodeText(node) === 'settings.notifications.openSettings' && typeof node.props.onPress === 'function').props.onPress()
      await Promise.resolve()
    })
    expect(mockOpenSettings).toHaveBeenCalledTimes(2)
    expect(mockDisablePushNotifications).not.toHaveBeenCalled()
    expect(mockRequestPushPermission).not.toHaveBeenCalled()
  })

  it('opens calendar sync directly for Pro', async () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    const tree = await renderProfileScreen()
    const calendarRow = findRowByLabel(tree, 'profile.calendarSync.title')

    await TestRenderer.act(async () => {
      calendarRow.props.onPress?.()
      await Promise.resolve()
    })

    expect(calendarRow.props.chevron).toBe(true)
    expect(calendarRow.props.hasTrailing).toBe(false)
    expect(mockRouterPush).toHaveBeenCalledWith('/calendar?import=1')
  })
})

it('places the Perfil bell inside the page scroller and opens Avisos', async () => {
  const tree = await renderProfileScreen()
  const scroller = tree.root.findByProps({ testID: 'profile-scroller' })
  const row = scroller.findAll((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === 'string' && node.props.testID === 'root-notification-header')[0]!
  expect(StyleSheet.flatten(row.props.style)).toMatchObject({ minHeight: 48, justifyContent: 'flex-end' })
  const bell = row.findAll((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === 'string' && node.props.accessibilityRole === 'button')[0]
  TestRenderer.act(() => bell.props.onPress())
  expect(mockRouterPush).toHaveBeenCalledWith('/notifications')
})
