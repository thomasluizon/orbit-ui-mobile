import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { API } from '@orbit/shared/api'
import { createApiClientError } from '@orbit/shared/utils'

import ProfileScreen from '@/app/(tabs)/profile'
import { PreferenceSettingsList } from '@/components/profile/preferences-sections'

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

const TestRenderer = require('react-test-renderer')

const {
  mockApiClient,
  mockPerformQueuedApiMutation,
  mockAuthState,
  mockShareAsync,
  mockShellNoticeSlot,
  mockUseGamificationProfile,
  mockPatchProfile,
  mockRouterPush,
  mockProfileState,
  mockSearchParams,
  mockStepUpVerified,
  mockCreateGrant,
  mockApiKeys,
} = vi.hoisted(() => ({
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
  mockShellNoticeSlot: vi.fn(),
  mockRouterPush: vi.fn(),
  mockSearchParams: { current: {} },
  mockStepUpVerified: { current: false },
  mockCreateGrant: { consumed: false },
  mockApiKeys: { current: [] as Record<string, unknown>[] },
  mockProfileState: {
    current: {
      profile: undefined as ReturnType<typeof createMockProfile> | undefined,
      isLoading: false,
      error: null as Error | null,
    },
  },
}))

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

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams.current,
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
  }),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
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
  useProfile: () => ({ ...mockProfileState.current, patchProfile: mockPatchProfile }),
  useTrialDaysLeft: () => 0,
  useTrialExpired: () => true,
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
  useUIStore: (selector: (state: { setAstraConversationOpen: () => void }) => unknown) =>
    selector({ setAstraConversationOpen: vi.fn() }),
}))

vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: true }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: new Proxy({}, { get: () => '#111111' }),
    currentScheme: 'purple',
    currentTheme: 'dark',
    applyTheme: vi.fn(),
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

vi.mock('@orbit/shared/hooks', async (importOriginal) => ({
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

vi.mock('@/hooks/use-tour-target', () => ({
  useTourTarget: vi.fn(),
}))

vi.mock('@/hooks/use-tour-scroll-container', () => ({
  useTourScrollContainer: () => ({ onTourScroll: vi.fn() }),
}))

vi.mock('@/components/ui/theme-toggle', () => ({
  ThemeToggle: () => React.createElement('ThemeToggle'),
}))

vi.mock('@/components/marketing-consent/marketing-consent-section', () => ({
  MarketingConsentSection: () =>
    React.createElement('MarketingConsentSectionStub', {
      testID: 'marketing-consent-section',
    }),
}))

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


vi.mock('@/components/tour/tour-replay-modal', () => ({
  TourReplayModal: ({ visible }: { visible: boolean }) =>
    visible ? React.createElement('TourReplayModalOpen', {}) : null,
}))

vi.mock('@/app/(tabs)/profile/_components/profile-nav-card', () => ({
  ProfileNavCard: () => null,
}))

vi.mock('@/components/profile/profile-nav-icon', () => ({
  ProfileNavIcon: () => null,
}))

vi.mock('@/components/gamification/streak-badge', () => ({
  StreakBadge: () => React.createElement('StreakBadge'),
}))

vi.mock('@/components/navigation/notification-bell', () => ({
  NotificationBell: () => React.createElement('NotificationBell'),
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
  RowList: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

vi.mock('@/components/ui/list-row', () => ({
  ListRow: ({
    title,
    description,
    value,
    trailing,
    onClick,
    accessibilityLabel,
    chevron = true,
    action,
  }: {
    title: string
    description?: string
    value?: string
    trailing?: React.ReactNode
    onClick?: () => void
    accessibilityLabel?: string
    chevron?: boolean
    action?: { label: string; onPress: () => void }
  }) => React.createElement(
    'SettingsRowStub',
    {
      label: title,
      hint: description,
      value,
      hasTrailing: Boolean(trailing),
      onPress: onClick,
      chevron,
      accessibilityRole: onClick ? 'button' : undefined,
      accessibilityLabel: accessibilityLabel ?? title,
    },
    action ? React.createElement('RowActionStub', {
      accessibilityRole: 'button',
      accessibilityLabel: action.label,
      onPress: action.onPress,
    }) : null,
  ),
}))

vi.mock('react-native-svg', () => ({
  __esModule: true,
  default: () => null,
  Path: () => null,
  Defs: () => null,
  Stop: () => null,
  Rect: () => null,
}))

interface SettingsRowStubNode {
  type: unknown
  props: {
    label?: string
    hint?: string
    value?: string
    hasTrailing?: boolean
    onPress?: () => void
    chevron?: boolean
    accessibilityRole?: string
  }
}

async function renderProfileScreen() {
  let tree: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<ProfileScreen />)
    await Promise.resolve()
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

describe('ProfileScreen', () => {
  beforeEach(() => {
    mockApiClient.mockReset()
    mockPerformQueuedApiMutation.mockReset()
    mockShareAsync.mockReset().mockResolvedValue(undefined)
    mockShellNoticeSlot.mockReset()
    mockPatchProfile.mockReset()
    mockUseGamificationProfile.mockClear()
    mockRouterPush.mockClear()
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
      'profile.groups.you',
      'profile.groups.astra',
      'profile.groups.notifications',
      'profile.groups.more',
      'profile.groups.ending',
    ]
    for (const label of groupLabels) {
      expect(
        tree.root.findAll(
          (node: { children?: unknown[] }) => node.children?.includes(label),
        ).length,
      ).toBeGreaterThan(0)
    }

    expect(findRowByLabel(tree, 'profile.wrappedTitle').props.hint).toBeUndefined()
    expect(findRowByLabel(tree, 'profile.widgetTitle').props.hint).toBe(
      'profile.widgetHint',
    )
    expect(findRowByLabel(tree, 'calendar.profileButton').props.hint).toBe(
      'calendar.profileHint',
    )
    expect(findRowByLabel(tree, 'profile.support.title').props.hint).toBe(
      'profile.support.description',
    )
    expect(findRowByLabel(tree, 'profile.sections.aboutHelp').props.hint).toBeUndefined()

    const more = tree.root.findByProps({ testID: 'profile-settings-group-more' })
    expect(
      more.findAll((node: SettingsRowStubNode) => node.type === 'SettingsRowStub')
        .map((node: SettingsRowStubNode) => node.props.label),
    ).toEqual([
      'profile.wrappedTitle',
      'profile.widgetTitle',
      'calendar.profileButton',
      'profile.support.title',
      'profile.sections.aboutHelp',
      'shareCard.entry',
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

  it('keeps every profile setting reachable by its accessible name', async () => {
    const tree = await renderProfileScreen()
    const accessibleNames = [
      'profile.settingsRows.editName',
      'profile.language.title',
      'profile.settingsRows.timezoneValue',
      'settings.weekStartDay.title',
      'preferences.themeMode',
      'profile.subscription.plan',
      'profile.wrappedTitle',
      'profile.widgetTitle',
      'calendar.profileButton',
      'profile.support.title',
      'profile.sections.aboutHelp',
      'dataExport.button',
      'profile.logout',
      'profile.freshStart.button',
      'profile.deleteAccount.button',
    ]

    for (const accessibilityLabel of accessibleNames) {
      expect(
        tree.root.findAll(
          (node: { props: { accessibilityRole?: string; accessibilityLabel?: string } }) =>
            node.props.accessibilityRole === 'button' &&
            node.props.accessibilityLabel === accessibilityLabel,
        ),
        `missing accessible profile row: ${accessibilityLabel}`,
      ).toHaveLength(1)
    }
  })

  it('keeps the share card reachable outside Ending things', async () => {
    const tree = await renderProfileScreen()
    const shareCardEntry = findRowByLabel(tree, 'shareCard.entry')
    const ending = tree.root.findByProps({ testID: 'profile-settings-group-ending' })

    expect(shareCardEntry).toBeDefined()
    expect(
      ending.findAll(
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

    expect(rows[0]?.props.label).toBe('profile.logout')
  })

  it('puts Fresh Start directly after Sign out', async () => {
    const tree = await renderProfileScreen()
    const ending = tree.root.findByProps({ testID: 'profile-settings-group-ending' })
    const labels = ending.findAll(
      (node: SettingsRowStubNode) => node.type === 'SettingsRowStub',
    ).map((node: SettingsRowStubNode) => node.props.label)

    expect(labels.slice(0, 2)).toEqual(['profile.logout', 'profile.freshStart.button'])
  })

  it('keeps Delete account last in the three-row ending group', async () => {
    const tree = await renderProfileScreen()
    const ending = tree.root.findByProps({ testID: 'profile-settings-group-ending' })
    const labels = ending.findAll(
      (node: SettingsRowStubNode) => node.type === 'SettingsRowStub',
    ).map((node: SettingsRowStubNode) => node.props.label)

    expect(labels).toEqual([
      'profile.logout',
      'profile.freshStart.button',
      'profile.deleteAccount.button',
    ])
  })

  it('shows the free daily allowance and routes its only plan action to Pro', async () => {
    const tree = await renderProfileScreen()
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
    const proactiveGate = findRowByLabel(tree, 'profile.proactiveAstra.title')
    const summaryGate = findRowByLabel(tree, 'profile.aiSummary.title')
    const allowance = tree.root.findByProps({ testID: 'astra-allowance-panel' })

    TestRenderer.act(() => {
      allowance.findByProps({
        accessibilityRole: 'button',
        accessibilityLabel: 'profile.allowance.seePro',
      }).props.onPress()
      proactiveGate.props.onPress?.()
      summaryGate.props.onPress?.()
    })
    expect(mockRouterPush).toHaveBeenNthCalledWith(1, {
      pathname: '/upgrade',
      params: { from: '/profile' },
    })
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, {
      pathname: '/upgrade',
      params: { from: '/profile' },
    })
    expect(mockRouterPush).toHaveBeenNthCalledWith(3, {
      pathname: '/upgrade',
      params: { from: '/profile' },
    })
  })

  it('shows only the API key description and upgrade row to free accounts', async () => {
    const tree = await renderProfileScreen()
    const astra = tree.root.findByProps({ testID: 'profile-settings-group-astra' })

    expect(
      astra.findAll((node: { children: unknown[] }) =>
        node.children.includes('profile.apiKeys.description')),
    ).toHaveLength(1)
    expect(findRowByLabel(tree, 'profile.apiKeys.unlock')).toBeDefined()
    expect(
      astra.findAll((node: { children: unknown[] }) =>
        node.children.includes('orbitMcp.noKeys')),
    ).toHaveLength(0)

    TestRenderer.act(() => {
      findRowByLabel(tree, 'profile.apiKeys.unlock').props.onPress?.()
    })
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/upgrade',
      params: { from: '/profile' },
    })
  })

  it('puts the step up before the API key list for Pro accounts', async () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    const tree = await renderProfileScreen()

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

    const tree = await renderProfileScreen()

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
    const tree = await renderProfileScreen()

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
    const tree = await renderProfileScreen()

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
    const secondTree = await renderProfileScreen()
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
    const tree = await renderProfileScreen()

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
    const secondTree = await renderProfileScreen()
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
    const tree = await renderProfileScreen()

    await TestRenderer.act(async () => {
      findButtonByText(tree, 'profile.apiKeys.create').props.onPress()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockRouterPush).toHaveBeenCalledWith('/step-up?operation=keys')
    expect(mockCreateGrant.consumed).toBe(true)
    expect(nodeText(tree.root)).not.toContain('orbitMcp.createKeyError')
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
    const tree = await renderProfileScreen()
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
      params: { from: '/profile' },
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
    const tree = await renderProfileScreen()
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
      params: { from: '/profile' },
    })
    const proactiveSwitch = astra.findByProps({
      accessibilityRole: 'switch',
      accessibilityLabel: 'profile.proactiveAstra.title',
    })
    const summarySwitch = astra.findByProps({
      accessibilityRole: 'switch',
      accessibilityLabel: 'profile.aiSummary.title',
    })
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
    const tree = await renderProfileScreen()
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

  it('places export last in You instead of Ending things', async () => {
    const tree = await renderProfileScreen()
    const youGroup = tree.root.find(
      (node: { props: { testID?: string } }) =>
        node.props.testID === 'profile-settings-group-you',
    )
    const endingGroup = tree.root.find(
      (node: { props: { testID?: string } }) =>
        node.props.testID === 'profile-settings-group-ending',
    )
    const youRows = youGroup.findAll(
      (node: SettingsRowStubNode) => node.type === 'SettingsRowStub',
    ) as SettingsRowStubNode[]

    expect(youRows.at(-1)?.props.label).toBe('dataExport.button')
    expect(
      endingGroup.findAll(
        (node: SettingsRowStubNode) =>
          node.type === 'SettingsRowStub' && node.props.label === 'dataExport.button',
      ),
    ).toHaveLength(0)
  })

  it('shows Preparing on the row and registers completion in the shell notice slot', async () => {
    let finishExport!: (value: Record<string, never>) => void
    mockApiClient.mockReturnValueOnce(
      new Promise((resolve) => {
        finishExport = resolve
      }),
    )
    const tree = await renderProfileScreen()

    await TestRenderer.act(async () => {
      findRowByLabel(tree, 'dataExport.button').props.onPress?.()
      await Promise.resolve()
    })
    expect(findRowByLabel(tree, 'dataExport.button').props.value).toBe(
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
    const tree = await renderProfileScreen()

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

  it('renders only product email consent in Notifications', async () => {
    const tree = await renderProfileScreen()
    const notificationsGroup = tree.root.find(
      (node: { props: { testID?: string } }) =>
        node.props.testID === 'profile-settings-group-notifications',
    )

    expect(
      notificationsGroup.findAll(
        (node: { props: { testID?: string } }) =>
          node.props.testID === 'marketing-consent-section',
      ),
    ).toHaveLength(1)
    expect(
      notificationsGroup.findAll(
        (node: { props: { accessibilityRole?: string; accessibilityLabel?: string } }) =>
          node.props.accessibilityRole === 'button' &&
          ['profile.settingsRows.reminders', 'habits.form.slipAlert'].includes(
            node.props.accessibilityLabel ?? '',
          ),
      ),
    ).toHaveLength(0)

    expect(
      notificationsGroup.findAll(
        (node: { children: unknown[] }) =>
          node.children.includes('profile.settingsRows.remindersNote'),
      ),
    ).toHaveLength(0)
    expect(
      notificationsGroup.findAll(
        (node: { props: { accessibilityRole?: string; accessibilityLabel?: string } }) =>
          node.props.accessibilityRole === 'switch' &&
          node.props.accessibilityLabel === 'profile.settingsRows.currentDevice',
      ),
    ).toHaveLength(0)
  })

  it('redirects gated feature rows to upgrade for free users', async () => {
    const tree = await renderProfileScreen()
    const calendarRow = findRowByLabel(tree, 'calendar.profileButton')

    await TestRenderer.act(async () => {
      calendarRow.props.onPress?.()
      await Promise.resolve()
    })

    expect(calendarRow.props.chevron).toBe(false)
    expect(calendarRow.props.hasTrailing).toBe(true)
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/upgrade',
      params: { from: '/profile' },
    })
  })

  it('routes every More of Orbit row', async () => {
    const tree = await renderProfileScreen()

    await TestRenderer.act(async () => {
      findRowByLabel(tree, 'profile.wrappedTitle').props.onPress?.()
      await Promise.resolve()
    })
    expect(mockRouterPush).toHaveBeenCalledWith('/wrapped')
    mockRouterPush.mockClear()

    await TestRenderer.act(async () => {
      findRowByLabel(tree, 'profile.widgetTitle').props.onPress?.()
      await Promise.resolve()
    })
    expect(mockRouterPush).toHaveBeenCalledWith('/advanced')
    mockRouterPush.mockClear()

    await TestRenderer.act(async () => {
      findRowByLabel(tree, 'profile.support.title').props.onPress?.()
      await Promise.resolve()
    })
    expect(mockRouterPush).toHaveBeenCalledWith('/support')
    mockRouterPush.mockClear()

    await TestRenderer.act(async () => {
      findRowByLabel(tree, 'profile.sections.aboutHelp').props.onPress?.()
      await Promise.resolve()
    })
    expect(mockRouterPush).toHaveBeenCalledWith('/about')
  })

  it('opens calendar sync directly for Pro', async () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    const tree = await renderProfileScreen()
    const calendarRow = findRowByLabel(tree, 'calendar.profileButton')

    await TestRenderer.act(async () => {
      calendarRow.props.onPress?.()
      await Promise.resolve()
    })

    expect(calendarRow.props.chevron).toBe(true)
    expect(calendarRow.props.hasTrailing).toBe(false)
    expect(mockRouterPush).toHaveBeenCalledWith('/calendar-sync')
  })
})

describe('PreferenceSettingsList', () => {
  it('does not render a color scheme row', () => {
    const tokens = new Proxy({}, { get: () => '#111111' })
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <PreferenceSettingsList
          tokens={tokens as never}
          t={(key) => key}
          languageLabel="English"
          themeLabel="Dark"
          weekStartLabel="Monday"
          showGeneralOnToday={false}
          onOpenPicker={vi.fn()}
          onToggleShowGeneral={vi.fn()}
          push={{
            pushSupported: false,
            pushEnabled: false,
            pushRegistered: false,
            pushLoading: false,
            permissionStatus: null,
            registrationStatus: 'unsupported',
            onToggle: vi.fn(),
            onOpenSettings: vi.fn(),
          }}
          persistentReminder={{
            isSupported: false,
            enabled: false,
            isLoading: false,
            onToggle: vi.fn(),
          }}
        />,
      )
    })
    expect(
      tree.root.findAll(
        (node: SettingsRowStubNode) =>
          node.type === 'SettingsRowStub' &&
          node.props.label === 'profile.colorScheme.title',
      ),
    ).toHaveLength(0)
  })
})
