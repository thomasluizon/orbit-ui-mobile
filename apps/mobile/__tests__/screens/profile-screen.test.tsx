import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'

import ProfileScreen from '@/app/(tabs)/profile'

const TestRenderer = require('react-test-renderer')

const { mockUseGamificationProfile } = vi.hoisted(() => ({
  mockUseGamificationProfile: vi.fn(() => ({ profile: null })),
}))

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    push: vi.fn(),
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
  TourReplayModal: () => null,
}))

vi.mock('@/app/(tabs)/profile/_components/profile-nav-card', () => ({
  ProfileNavCard: () => null,
}))

vi.mock('@/app/(tabs)/profile/_components/profile-action-button', () => ({
  ProfileActionButton: () => null,
}))

vi.mock('@/app/(tabs)/profile/_components/profile-nav-icon', () => ({
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
  SettingsGroupRow: () => null,
}))

vi.mock('lucide-react-native', () => {
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
    Download: createIcon('Download'),
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

describe('ProfileScreen', () => {
  beforeEach(() => {
    mockUseGamificationProfile.mockClear()
  })

  it('disables the gamification profile query for free users', async () => {
    await TestRenderer.act(async () => {
      TestRenderer.create(<ProfileScreen />)
      await Promise.resolve()
    })

    expect(mockUseGamificationProfile).toHaveBeenCalledWith(false)
  })
})
