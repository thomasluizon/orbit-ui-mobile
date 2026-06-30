import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { API } from '@orbit/shared/api'

import ProfileScreen from '@/app/(tabs)/profile'

vi.mock('@/components/referral/referral-card', () => ({
  ReferralCard: () => null,
}))
vi.mock('@/components/referral/referral-drawer', () => ({
  ReferralDrawer: () => null,
}))

const TestRenderer = require('react-test-renderer')

vi.hoisted(() => {
  ;(globalThis as { __DEV__?: boolean }).__DEV__ = false
})

const colorProxy = new Proxy(
  {},
  {
    get: (_target, prop: string) => (prop === 'white' ? '#ffffff' : '#111111'),
  },
)

const mocks = vi.hoisted(() => {
  const storage = new Map<string, string>()
  const router = { push: vi.fn(), replace: vi.fn() }
  const queryClient = {
    clear: vi.fn(),
    invalidateQueries: vi.fn(async () => {}),
  }

  return {
    storage,
    router,
    queryClient,
    apiClient: vi.fn(),
    logout: vi.fn(),
    useOffline: vi.fn(() => ({
      isOnline: true,
      pendingCount: 0,
      enqueue: vi.fn(),
      flush: vi.fn(),
      isFlushing: false,
    })),
    useProfile: vi.fn(() => ({
      profile: createMockProfile({
        hasProAccess: false,
        isTrialActive: false,
        isLifetimePro: false,
      }),
      isLoading: false,
      error: null,
    })),
    useGamificationProfile: vi.fn(() => ({ profile: null })),
    useHasProAccess: vi.fn(() => false),
    useIsYearlyPro: vi.fn(() => false),
    useTrialDaysLeft: vi.fn(() => 0),
    useTrialExpired: vi.fn(() => true),
    useTrialUrgent: vi.fn(() => false),
    useQueryClient: vi.fn(() => queryClient),
    useRouter: vi.fn(() => router),
    useLocalSearchParams: vi.fn(() => ({})),
    useTranslation: vi.fn(() => ({
      t: (key: string, params?: Record<string, unknown>) =>
        params ? `${key}(${JSON.stringify(params)})` : key,
      i18n: { language: 'en' },
    })),
    useAppTheme: vi.fn(() => ({
      colors: colorProxy,
      currentScheme: 'purple',
      currentTheme: 'dark',
    })),
    asyncStorageGetItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    asyncStorageSetItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value)
    }),
    asyncStorageRemoveItem: vi.fn(async (key: string) => {
      storage.delete(key)
    }),
    clearChecklistTemplates: vi.fn(async () => {}),
    clearPersistedQueryCache: vi.fn(async () => {}),
    plural: vi.fn((value: string) => value),
  }
})

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: mocks.asyncStorageGetItem,
    setItem: mocks.asyncStorageSetItem,
    removeItem: mocks.asyncStorageRemoveItem,
  },
}))

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>()
  const keyboardListener = { remove: vi.fn() }
  return {
    ...actual,
    KeyboardAvoidingView: actual.View,
    Keyboard: {
      ...actual.Keyboard,
      addListener: vi.fn(() => keyboardListener),
      dismiss: vi.fn(),
    },
  }
})

vi.mock('expo', () => ({
  __esModule: true,
  requireNativeModule: vi.fn(() => ({})),
}))

vi.mock('expo-router', () => ({
  useRouter: mocks.useRouter,
  useLocalSearchParams: mocks.useLocalSearchParams,
}))

vi.mock('react-i18next', () => ({
  useTranslation: mocks.useTranslation,
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: mocks.useQueryClient,
  useQuery: () => ({ data: undefined, isLoading: false, error: null }),
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: mocks.useAppTheme,
}))

vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return {
    ...actual,
    createColors: () => colorProxy,
    createTokensV2: () => colorProxy,
  }
})

vi.mock('@/components/gamification/streak-badge', () => ({
  StreakBadge: () => null,
}))

vi.mock('@/components/navigation/notification-bell', () => ({
  NotificationBell: () => null,
}))

vi.mock('@/components/ui/theme-toggle', () => ({
  ThemeToggle: () => null,
}))

vi.mock('@/components/ui/app-bar', () => ({
  AppBar: ({ trailing }: { trailing?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, trailing as React.ReactNode),
}))

vi.mock('@/components/ui/section-label', () => ({
  SectionLabel: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}))

vi.mock('@/components/ui/settings-row', () => ({
  SettingsRow: () => null,
}))

vi.mock('@/components/ui/app-text-input', () => {
  const AppTextInput = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ focus: () => {} }))
    return React.createElement('TextInput', props)
  })
  AppTextInput.displayName = 'AppTextInput'
  return { AppTextInput }
})

vi.mock('@/components/ui/keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}))

vi.mock('@/app/(tabs)/profile/_components/profile-nav-card', () => ({
  ProfileNavCard: () => null,
}))

vi.mock('@/app/(tabs)/profile/_components/profile-nav-icon', () => ({
  ProfileNavIcon: () => null,
}))

vi.mock('@/components/ui/fresh-start-animation', () => ({
  FreshStartAnimation: () => null,
}))

vi.mock('@/components/tour/tour-replay-modal', () => ({
  TourReplayModal: () => null,
}))

vi.mock('@/hooks/use-offline', () => ({
  useOffline: mocks.useOffline,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: mocks.useProfile,
  useHasProAccess: mocks.useHasProAccess,
  useTrialDaysLeft: mocks.useTrialDaysLeft,
  useTrialExpired: mocks.useTrialExpired,
  useTrialUrgent: mocks.useTrialUrgent,
  useIsYearlyPro: mocks.useIsYearlyPro,
}))

vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: mocks.useGamificationProfile,
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { logout: () => void }) => unknown) =>
    selector({ logout: mocks.logout }),
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

vi.mock('@/lib/checklist-template-storage', () => ({
  clearChecklistTemplates: mocks.clearChecklistTemplates,
}))

vi.mock('@/lib/query-client', () => ({
  clearPersistedQueryCache: mocks.clearPersistedQueryCache,
}))

vi.mock('@/lib/offline-mutations', () => ({
  buildQueuedMutation: vi.fn((mutation: Record<string, unknown>) => mutation),
  createQueuedAck: vi.fn((queuedMutationId: string) => ({ queued: true, queuedMutationId })),
  isQueuedResult: vi.fn(() => false),
  queueOrExecute: vi.fn(async () => ({ queued: false, queuedMutationId: 'mutation-1' })),
}))

vi.mock('@/lib/offline-queue', () => ({
  clear: vi.fn(),
  count: vi.fn(() => 0),
  enqueue: vi.fn(),
}))

vi.mock('@/lib/plural', () => ({
  plural: mocks.plural,
}))

vi.mock('lucide-react-native', () => {
  const iconNames = [
    'AlertTriangle',
    'ArrowLeft',
    'BadgeCheck',
    'BarChart3',
    'CalendarDays',
    'Check',
    'CheckCircle',
    'CheckCircle2',
    'ChevronLeft',
    'ChevronRight',
    'Clock',
    'Compass',
    'CreditCard',
    'Download',
    'Flame',
    'Info',
    'List',
    'Lock',
    'LogOut',
    'MessageCircle',
    'MessageSquare',
    'Orbit',
    'Palette',
    'Pencil',
    'Play',
    'Plus',
    'RotateCcw',
    'Send',
    'Settings',
    'ShieldCheck',
    'Smartphone',
    'Sparkles',
    'Tag',
    'Target',
    'TriangleAlert',
    'Trash2',
    'User',
    'UserX',
    'Share2',
    'WifiOff',
    'Wrench',
    'X',
  ]
  const createIcon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props)
  const stubbed: Record<string, unknown> = {}
  for (const name of iconNames) {
    stubbed[name] = createIcon(name)
  }
  return stubbed
})

vi.mock('@/components/ui/settings-group', () => ({
  SettingsGroup: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  SettingsGroupRow: () => null,
}))

vi.mock('react-native-svg', () => {
  const createSvg = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props)
  return {
    __esModule: true,
    default: createSvg('Svg'),
    Defs: createSvg('Defs'),
    LinearGradient: createSvg('LinearGradient'),
    Path: createSvg('Path'),
    Rect: createSvg('Rect'),
    Stop: createSvg('Stop'),
  }
})

function flattenText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (typeof node === 'object' && 'props' in (node as Record<string, unknown>)) {
    return flattenText((node as { props: { children?: unknown } }).props.children)
  }
  return ''
}

function screenTexts(tree: { root: { findAllByType: (type: string) => unknown[] } }): string[] {
  return tree.root
    .findAllByType('Text')
    .map((node) => flattenText((node as { props: { children?: unknown } }).props.children))
}

async function renderScreen(element: React.ReactElement) {
  let tree: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(element)
    await Promise.resolve()
    await Promise.resolve()
  })
  return tree
}

function openDeleteModal(tree: { root: { findAll: (predicate: (node: any) => boolean) => any[] } }) {
  const deleteButton = tree.root.findAll(
    (node) =>
      typeof node.props?.onPress === 'function' &&
      node.props?.accessibilityLabel === 'profile.deleteAccount.button',
  )[0]
  return deleteButton
}

describe('ProfileScreen account-deletion state machine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.storage.clear()
    mocks.useOffline.mockReturnValue({
      isOnline: true,
      pendingCount: 0,
      enqueue: vi.fn(),
      flush: vi.fn(),
      isFlushing: false,
    })
    mocks.useProfile.mockReturnValue({
      profile: createMockProfile({
        hasProAccess: false,
        isTrialActive: false,
        isLifetimePro: false,
      }),
      isLoading: false,
      error: null,
    })
    mocks.useGamificationProfile.mockReturnValue({ profile: null })
    mocks.useHasProAccess.mockReturnValue(false)
    mocks.apiClient.mockResolvedValue({ scheduledDeletionAt: '2026-07-01T00:00:00Z' })
  })

  it('opens on the confirm step with the warning copy and no code inputs', async () => {
    const tree = await renderScreen(<ProfileScreen />)

    await TestRenderer.act(async () => {
      openDeleteModal(tree).props.onPress()
      await Promise.resolve()
    })

    expect(screenTexts(tree)).toContain('profile.deleteAccount.warningFree')
    expect(tree.root.findAllByType('TextInput')).toHaveLength(0)
  })

  it('requests deletion and advances to the code step with six inputs', async () => {
    const tree = await renderScreen(<ProfileScreen />)

    await TestRenderer.act(async () => {
      openDeleteModal(tree).props.onPress()
      await Promise.resolve()
    })

    const sendButton = tree.root.findAll(
      (node: any) =>
        typeof node.props?.onPress === 'function' &&
        flattenText(node.props?.children).includes('profile.deleteAccount.sendCode'),
    )[0]

    await TestRenderer.act(async () => {
      sendButton.props.onPress()
      await Promise.resolve()
    })

    expect(mocks.apiClient).toHaveBeenCalledWith(API.auth.requestDeletion, {
      method: 'POST',
    })
    expect(screenTexts(tree)).toContain('profile.deleteAccount.codeInstructions')
    expect(tree.root.findAllByType('TextInput')).toHaveLength(6)
  })

  it('surfaces an error when requesting deletion fails and stays on confirm', async () => {
    mocks.apiClient.mockRejectedValueOnce(new Error('boom'))
    const tree = await renderScreen(<ProfileScreen />)

    await TestRenderer.act(async () => {
      openDeleteModal(tree).props.onPress()
      await Promise.resolve()
    })
    const sendButton = tree.root.findAll(
      (node: any) =>
        typeof node.props?.onPress === 'function' &&
        flattenText(node.props?.children).includes('profile.deleteAccount.sendCode'),
    )[0]
    await TestRenderer.act(async () => {
      sendButton.props.onPress()
      await Promise.resolve()
    })

    expect(screenTexts(tree)).toContain('profile.deleteAccount.errorGeneric')
    expect(screenTexts(tree)).not.toContain('boom')
    expect(tree.root.findAllByType('TextInput')).toHaveLength(0)
  })

  it('confirms with a six-digit code and advances to the deactivated step', async () => {
    const tree = await renderScreen(<ProfileScreen />)

    await TestRenderer.act(async () => {
      openDeleteModal(tree).props.onPress()
      await Promise.resolve()
    })
    const sendButton = tree.root.findAll(
      (node: any) =>
        typeof node.props?.onPress === 'function' &&
        flattenText(node.props?.children).includes('profile.deleteAccount.sendCode'),
    )[0]
    await TestRenderer.act(async () => {
      sendButton.props.onPress()
      await Promise.resolve()
    })

    const inputs = tree.root.findAllByType('TextInput')
    await TestRenderer.act(async () => {
      inputs.forEach((input: any, index: number) => {
        input.props.onChangeText(String(index + 1))
      })
      await Promise.resolve()
    })

    const confirmButton = tree.root.findAll(
      (node: any) =>
        typeof node.props?.onPress === 'function' &&
        flattenText(node.props?.children).includes('profile.deleteAccount.confirmDelete'),
    )[0]
    await TestRenderer.act(async () => {
      confirmButton.props.onPress()
      await Promise.resolve()
    })

    expect(mocks.apiClient).toHaveBeenCalledWith(API.auth.confirmDeletion, {
      method: 'POST',
      body: JSON.stringify({ code: '123456' }),
    })
    expect(screenTexts(tree)).toContain('profile.logout')
  })

  it('logs out from the deactivated step', async () => {
    const tree = await renderScreen(<ProfileScreen />)

    await TestRenderer.act(async () => {
      openDeleteModal(tree).props.onPress()
      await Promise.resolve()
    })
    const sendButton = tree.root.findAll(
      (node: any) =>
        typeof node.props?.onPress === 'function' &&
        flattenText(node.props?.children).includes('profile.deleteAccount.sendCode'),
    )[0]
    await TestRenderer.act(async () => {
      sendButton.props.onPress()
      await Promise.resolve()
    })
    const inputs = tree.root.findAllByType('TextInput')
    await TestRenderer.act(async () => {
      inputs.forEach((input: any, index: number) => {
        input.props.onChangeText(String(index + 1))
      })
      await Promise.resolve()
    })
    const confirmButton = tree.root.findAll(
      (node: any) =>
        typeof node.props?.onPress === 'function' &&
        flattenText(node.props?.children).includes('profile.deleteAccount.confirmDelete'),
    )[0]
    await TestRenderer.act(async () => {
      confirmButton.props.onPress()
      await Promise.resolve()
    })

    const logoutButton = tree.root.findAll(
      (node: any) =>
        typeof node.props?.onPress === 'function' &&
        flattenText(node.props?.children).includes('profile.logout'),
    )[0]
    await TestRenderer.act(async () => {
      logoutButton.props.onPress()
      await Promise.resolve()
    })

    expect(mocks.logout).toHaveBeenCalledTimes(1)
  })
})
