import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'

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
  mockAuthState,
  mockShareAsync,
  mockShellNoticeSlot,
  mockUseGamificationProfile,
  mockRouterPush,
} = vi.hoisted(() => ({
  mockApiClient: vi.fn(),
  mockShareAsync: vi.fn(),
  mockAuthState: {
    isAuthenticated: true,
    user: { userId: 'user-1' },
    logout: vi.fn(),
  },
  mockUseGamificationProfile: vi.fn(() => ({ profile: null })),
  mockShellNoticeSlot: vi.fn(),
  mockRouterPush: vi.fn(),
}))

vi.mock('expo-sharing', () => {
  return { shareAsync: mockShareAsync }
})

vi.mock('expo-device', () => ({
  __esModule: true,
  default: { isDevice: true },
  isDevice: true,
}))

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
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
  useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    clear: vi.fn(),
  }),
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: createMockProfile({ hasProAccess: false }),
    isLoading: false,
    error: null,
  }),
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

vi.mock('@/components/ui/list-row', () => ({
  ListRow: ({
    title,
    description,
    value,
    onClick,
    accessibilityLabel,
    chevron = true,
  }: {
    title: string
    description?: string
    value?: string
    onClick?: () => void
    accessibilityLabel?: string
    chevron?: boolean
  }) => React.createElement('SettingsRowStub', {
    label: title,
    hint: description,
    value,
    onPress: onClick,
    chevron,
    accessibilityRole: onClick ? 'button' : undefined,
    accessibilityLabel: accessibilityLabel ?? title,
  }),
}))

vi.mock('@/components/ui/icons', () => {
  const createIcon = (name: string) => () => React.createElement(name)
  return {
    LogOut: createIcon('LogOut'),
    RotateCcw: createIcon('RotateCcw'),
    Trash2: createIcon('Trash2'),
    ChevronRight: createIcon('ChevronRight'),
    Clock: createIcon('Clock'),
    BadgeCheck: createIcon('BadgeCheck'),
    Orbit: createIcon('Orbit'),
    X: createIcon('X'),
    Check: createIcon('Check'),
    Compass: createIcon('Compass'),
    CreditCard: createIcon('CreditCard'),
    User: createIcon('User'),
    ChevronLeft: createIcon('ChevronLeft'),
    Flame: createIcon('Flame'),
    Lock: createIcon('Lock'),
    Download: createIcon('Download'),
    Share2: createIcon('Share2'),
    Pencil: createIcon('Pencil'),
    UserX: createIcon('UserX'),
    TriangleAlert: createIcon('TriangleAlert'),
    BellRing: createIcon('BellRing'),
    Bell: createIcon('Bell'),
    Calendar: createIcon('Calendar'),
    Languages: createIcon('Languages'),
    Mail: createIcon('Mail'),
    MessageSquare: createIcon('MessageSquare'),
    Moon: createIcon('Moon'),
    Satellite: createIcon('Satellite'),
    Search: createIcon('Search'),
  }
})

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

describe('ProfileScreen', () => {
  beforeEach(() => {
    mockApiClient.mockReset()
    mockShareAsync.mockReset().mockResolvedValue(undefined)
    mockShellNoticeSlot.mockReset()
    mockUseGamificationProfile.mockClear()
    mockRouterPush.mockClear()
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

    expect(findRowByLabel(tree, 'profile.wrappedTitle').props.hint).toBe(
      'profile.wrappedHint',
    )
    expect(findRowByLabel(tree, 'calendar.profileButton').props.hint).toBe(
      'calendar.profileHint',
    )
    expect(findRowByLabel(tree, 'profile.sections.aboutHelp').props.hint).toBe(
      'profile.sections.aboutHelpHint',
    )

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
      'profile.settingsRows.dailyAllowance',
      'profile.proactiveAstra.title',
      'profile.aiSummary.title',
      'profile.settingsRows.apiKeysMcp',
      'profile.wrappedTitle',
      'calendar.profileButton',
      'profile.sections.aboutHelp',
      'dataExport.button',
      'shareCard.entry',
      'profile.freshStart.button',
      'profile.logout',
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

    await TestRenderer.act(async () => {
      findRowByLabel(tree, 'calendar.profileButton').props.onPress?.()
      await Promise.resolve()
    })

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/upgrade',
      params: { from: '/profile' },
    })
  })

  it('navigates directly to ungated feature rows', async () => {
    const tree = await renderProfileScreen()

    await TestRenderer.act(async () => {
      findRowByLabel(tree, 'profile.wrappedTitle').props.onPress?.()
      await Promise.resolve()
    })

    expect(mockRouterPush).toHaveBeenCalledWith('/wrapped')
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
