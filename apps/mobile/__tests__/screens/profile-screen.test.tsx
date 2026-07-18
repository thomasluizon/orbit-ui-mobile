import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'

import ProfileScreen from '@/app/(tabs)/profile'

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

const { mockUseGamificationProfile, mockRouterPush } = vi.hoisted(() => ({
  mockUseGamificationProfile: vi.fn(() => ({ profile: null })),
  mockRouterPush: vi.fn(),
}))

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
  }),
}))

vi.mock('react-i18next', () => ({
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

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { logout: () => void }) => unknown) =>
    selector({ logout: vi.fn() }),
}))

vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: true }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: new Proxy({}, { get: () => '#111111' }),
    currentScheme: 'purple',
    currentTheme: 'dark',
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
    glow: () => ({}),
    glowSm: () => ({}),
    glowLg: () => ({}),
  },
  shadowsV2: {
    shadow1: {},
    shadow2: {},
    shadow3: {},
  },
  tintFromPrimary: () => 'rgba(17, 17, 17, 0.1)',
  primaryGlow: () => ({}),
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: vi.fn(),
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
  ThemeToggle: () => null,
}))

vi.mock('@/components/ui/offline-unavailable-state', () => ({
  OfflineUnavailableState: () => null,
}))

vi.mock('@/components/ui/app-text-input', () => ({
  AppTextInput: () => null,
}))

vi.mock('@/components/ui/keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/ui/fresh-start-animation', () => ({
  FreshStartAnimation: () => null,
}))

vi.mock('@/components/tour/tour-replay-modal', () => ({
  TourReplayModal: ({ visible }: { visible: boolean }) =>
    visible ? React.createElement('TourReplayModalOpen', {}) : null,
}))

vi.mock('@/app/(tabs)/profile/_components/profile-nav-card', () => ({
  ProfileNavCard: () => null,
}))

vi.mock('@/app/(tabs)/profile/_components/profile-action-button', () => ({
  ProfileActionButton: () => null,
}))

vi.mock('@/components/profile/profile-nav-icon', () => ({
  ProfileNavIcon: () => null,
}))

vi.mock('@/components/gamification/streak-badge', () => ({
  StreakBadge: () => null,
}))

vi.mock('@/components/navigation/notification-bell', () => ({
  NotificationBell: () => null,
}))

vi.mock('@/components/ui/app-bar', () => ({
  AppBar: ({ trailing }: { trailing?: React.ReactNode }) => (
    <>{trailing}</>
  ),
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
  }
})

vi.mock('react-native-svg', () => ({
  __esModule: true,
  default: () => null,
  Path: () => null,
  Defs: () => null,
  LinearGradient: () => null,
  Stop: () => null,
  Rect: () => null,
}))

interface SettingsRowStubNode {
  type: unknown
  props: {
    label?: string
    hint?: string
    onPress?: () => void
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
    mockUseGamificationProfile.mockClear()
    mockRouterPush.mockClear()
  })

  it('disables the gamification profile query for free users', async () => {
    await TestRenderer.act(async () => {
      TestRenderer.create(<ProfileScreen />)
      await Promise.resolve()
    })

    expect(mockUseGamificationProfile).toHaveBeenCalledWith(false)
  })

  it('mounts the referral card on profile and opens the drawer when pressed', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ProfileScreen />)
      await Promise.resolve()
    })

    const [card] = tree!.root.findAll(
      (node: { type: unknown }) => node.type === 'ReferralCardStub',
    )
    expect(card).toBeTruthy()
    expect(
      tree!.root.findAll((node: { type: unknown }) => node.type === 'ReferralDrawerOpen'),
    ).toHaveLength(0)

    await TestRenderer.act(async () => {
      card.props.onPress()
      await Promise.resolve()
    })

    expect(
      tree!.root.findAll((node: { type: unknown }) => node.type === 'ReferralDrawerOpen'),
    ).toHaveLength(1)
  })

  it('renders every feature destination as a grouped settings row with its hint', async () => {
    const tree = await renderProfileScreen()

    expect(findRowByLabel(tree, 'tour.replay.title').props.hint).toBe(
      'explore.tourHint',
    )
    expect(findRowByLabel(tree, 'social.profileNav.title').props.hint).toBe(
      'social.profileNav.hint',
    )
    expect(findRowByLabel(tree, 'profile.retrospectiveTitle').props.hint).toBe(
      'profile.retrospectiveHint',
    )
    expect(findRowByLabel(tree, 'profile.wrappedTitle').props.hint).toBe(
      'profile.wrappedHint',
    )
    expect(findRowByLabel(tree, 'calendar.profileButton').props.hint).toBe(
      'calendar.profileHint',
    )
    expect(findRowByLabel(tree, 'profile.sections.aboutHelp').props.hint).toBe(
      'profile.sections.aboutHelpHint',
    )
    expect(findRowByLabel(tree, 'profile.sections.advanced').props.hint).toBe(
      'profile.sections.advancedHint',
    )
  })

  it('opens the tour replay modal from the discover row', async () => {
    const tree = await renderProfileScreen()

    expect(
      tree.root.findAll((node: { type: unknown }) => node.type === 'TourReplayModalOpen'),
    ).toHaveLength(0)

    await TestRenderer.act(async () => {
      findRowByLabel(tree, 'tour.replay.title').props.onPress?.()
      await Promise.resolve()
    })

    expect(
      tree.root.findAll((node: { type: unknown }) => node.type === 'TourReplayModalOpen'),
    ).toHaveLength(1)
  })

  it('redirects gated feature rows to upgrade for free users', async () => {
    const tree = await renderProfileScreen()

    await TestRenderer.act(async () => {
      findRowByLabel(tree, 'profile.retrospectiveTitle').props.onPress?.()
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
