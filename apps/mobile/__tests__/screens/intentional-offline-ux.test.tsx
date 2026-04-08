import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'

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
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
  }
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
      isOnline: false,
      pendingCount: 0,
      enqueue: vi.fn(),
      flush: vi.fn(),
      isFlushing: false,
    })),
    useProfile: vi.fn(() => ({
      profile: createMockProfile({
        hasProAccess: true,
        isTrialActive: false,
        isLifetimePro: false,
      }),
      isLoading: false,
      error: null,
    })),
    useGamificationProfile: vi.fn(() => ({ profile: null })),
    useHasProAccess: vi.fn(() => true),
    useIsYearlyPro: vi.fn(() => true),
    useTrialDaysLeft: vi.fn(() => 0),
    useTrialExpired: vi.fn(() => false),
    useTrialUrgent: vi.fn(() => false),
    useRetrospective: vi.fn(() => ({
      retrospective: null,
      setRetrospective: vi.fn(),
      isLoading: false,
      error: null,
      setError: vi.fn(),
      fromCache: false,
      period: 'week',
      setPeriod: vi.fn(),
      generate: vi.fn(),
    })),
    useSubscriptionPlans: vi.fn(() => ({
      plans: null,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
      discountedAmount: (value: number) => value,
    })),
    useBilling: vi.fn(() => ({
      billing: null,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    })),
    useQueryClient: vi.fn(() => queryClient),
    useRouter: vi.fn(() => router),
    useLocalSearchParams: vi.fn(() => ({})),
    useTranslation: vi.fn(() => ({
      t: (key: string, params?: Record<string, unknown>) =>
        params ? `${key}(${JSON.stringify(params)})` : key,
      i18n: { language: 'en' },
    })),
    useAppTheme: vi.fn(() => ({ colors: colorProxy })),
    asyncStorageGetItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    asyncStorageSetItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value)
    }),
    asyncStorageRemoveItem: vi.fn(async (key: string) => {
      storage.delete(key)
    }),
    buildQueuedMutation: vi.fn((mutation: Record<string, unknown>) => mutation),
    createQueuedAck: vi.fn((queuedMutationId: string) => ({ queued: true, queuedMutationId })),
    isQueuedResult: vi.fn(() => false),
    queueOrExecute: vi.fn(async () => ({ queued: false, queuedMutationId: 'mutation-1' })),
    clearChecklistTemplates: vi.fn(async () => {}),
    clearPersistedQueryCache: vi.fn(async () => {}),
    plural: vi.fn((value: string) => value),
    themeToggle: vi.fn(() => React.createElement('ThemeToggle')),
    freshStartAnimation: vi.fn(() => null),
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
  return {
    ...actual,
    KeyboardAvoidingView: actual.View,
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
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: mocks.useAppTheme,
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

vi.mock('@/hooks/use-retrospective', () => ({
  useRetrospective: mocks.useRetrospective,
}))

vi.mock('@/hooks/use-subscription-plans', () => ({
  useSubscriptionPlans: mocks.useSubscriptionPlans,
  formatPrice: (amount: number, currency: string) => `${currency}:${amount}`,
  monthlyEquivalent: (amount: number) => amount,
}))

vi.mock('@/hooks/use-billing', () => ({
  useBilling: mocks.useBilling,
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { logout: () => void }) => unknown) =>
    selector({ logout: mocks.logout }),
}))

vi.mock('@/components/ui/theme-toggle', () => ({
  ThemeToggle: mocks.themeToggle,
}))

vi.mock('@/components/ui/fresh-start-animation', () => ({
  FreshStartAnimation: mocks.freshStartAnimation,
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
  buildQueuedMutation: mocks.buildQueuedMutation,
  createQueuedAck: mocks.createQueuedAck,
  isQueuedResult: mocks.isQueuedResult,
  queueOrExecute: mocks.queueOrExecute,
}))

vi.mock('@/lib/offline-queue', () => ({
  clear: vi.fn(),
  count: vi.fn(() => 0),
  dequeue: vi.fn(() => null),
  enqueue: vi.fn(),
  getAll: vi.fn(() => []),
  getById: vi.fn(() => null),
  incrementRetries: vi.fn(),
  remove: vi.fn(),
  replaceEntityReferences: vi.fn(),
  subscribeQueueCount: vi.fn(() => () => {}),
  update: vi.fn(),
}))

vi.mock('@/lib/plural', () => ({
  plural: mocks.plural,
}))

vi.mock('lucide-react-native', () => {
  const createIcon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props)

  return {
    AlertTriangle: createIcon('AlertTriangle'),
    ArrowLeft: createIcon('ArrowLeft'),
    BadgeCheck: createIcon('BadgeCheck'),
    BarChart3: createIcon('BarChart3'),
    Check: createIcon('Check'),
    CheckCircle2: createIcon('CheckCircle2'),
    ChevronRight: createIcon('ChevronRight'),
    Clock: createIcon('Clock'),
    CreditCard: createIcon('CreditCard'),
    Download: createIcon('Download'),
    Flame: createIcon('Flame'),
    Info: createIcon('Info'),
    Lock: createIcon('Lock'),
    LogOut: createIcon('LogOut'),
    MessageSquare: createIcon('MessageSquare'),
    Palette: createIcon('Palette'),
    RotateCcw: createIcon('RotateCcw'),
    Settings: createIcon('Settings'),
    ShieldCheck: createIcon('ShieldCheck'),
    Sparkles: createIcon('Sparkles'),
    Send: createIcon('Send'),
    Tag: createIcon('Tag'),
    Trash2: createIcon('Trash2'),
    WifiOff: createIcon('WifiOff'),
    Wrench: createIcon('Wrench'),
    X: createIcon('X'),
  }
})

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

import UpgradeScreen from '@/app/upgrade'
import RetrospectiveScreen from '@/app/retrospective'
import SupportScreen from '@/app/support'
import ProfileScreen from '@/app/(tabs)/profile'

function flattenText(node: any): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (typeof node === 'object' && 'props' in node) return flattenText(node.props.children)
  return ''
}

async function renderScreen(element: React.ReactElement) {
  let tree: any

  await TestRenderer.act(async () => {
    tree = TestRenderer.create(element)
    await Promise.resolve()
    await Promise.resolve()
  })

  return tree
}

describe('intentional offline UX screens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.storage.clear()
    mocks.useOffline.mockReturnValue({
      isOnline: false,
      pendingCount: 0,
      enqueue: vi.fn(),
      flush: vi.fn(),
      isFlushing: false,
    })
    mocks.useProfile.mockReturnValue({
      profile: createMockProfile({
        hasProAccess: true,
        isTrialActive: false,
        isLifetimePro: false,
      }),
      isLoading: false,
      error: null,
    })
    mocks.useGamificationProfile.mockReturnValue({ profile: null })
    mocks.useHasProAccess.mockReturnValue(true)
    mocks.useIsYearlyPro.mockReturnValue(true)
    mocks.useTrialDaysLeft.mockReturnValue(0)
    mocks.useTrialExpired.mockReturnValue(false)
    mocks.useTrialUrgent.mockReturnValue(false)
    mocks.useRetrospective.mockReturnValue({
      retrospective: null,
      setRetrospective: vi.fn(),
      isLoading: false,
      error: null,
      setError: vi.fn(),
      fromCache: false,
      period: 'week',
      setPeriod: vi.fn(),
      generate: vi.fn(),
    })
    mocks.useSubscriptionPlans.mockReturnValue({
      plans: null,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
      discountedAmount: (value: number) => value,
    })
    mocks.useBilling.mockReturnValue({
      billing: null,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    })
    mocks.router.push.mockClear()
    mocks.router.replace.mockClear()
    mocks.apiClient.mockClear()
    mocks.logout.mockClear()
  })

  it('renders cached retrospective content offline when a cached read exists', async () => {
    mocks.storage.set('orbit_retrospective_cache_week', 'Cached retrospective summary')

    const tree = await renderScreen(<RetrospectiveScreen />)

    expect(tree.root.findAll((node: any) => node.props?.accessibilityRole === 'alert').length).toBeGreaterThan(0)

    const texts = tree.root.findAllByType('Text').map((node: any) => flattenText(node.props.children))
    expect(texts).toContain('Cached retrospective summary')
    expect(texts).toContain('retrospective.cached')
  })

  it('shows an explicit offline-unavailable state for delete-account instead of live actions', async () => {
    const tree = await renderScreen(<ProfileScreen />)

    const deleteButton = tree.root.findAll((node: any) =>
      node.type === 'TouchableOpacity' && flattenText(node.props.children).includes('profile.deleteAccount.button'),
    )[0]

    await TestRenderer.act(async () => {
      deleteButton.props.onPress()
      await Promise.resolve()
    })

    const alerts = tree.root.findAll((node: any) => node.props?.accessibilityRole === 'alert')
    expect(alerts.length).toBeGreaterThan(0)
    expect(tree.root.findAllByType('TextInput')).toHaveLength(0)
  })

  it('suppresses live-only billing and plan error cards while offline', async () => {
    const tree = await renderScreen(<UpgradeScreen />)

    const texts = tree.root.findAllByType('Text').map((node: any) => flattenText(node.props.children))
    expect(texts).toContain('calendarSync.notConnected')
    expect(texts).not.toContain('upgrade.plans.error')
    expect(texts).not.toContain('upgrade.billing.error')
  })

  it('renders an explicit offline state for support instead of sending live requests', async () => {
    const tree = await renderScreen(<SupportScreen />)

    const texts = tree.root.findAllByType('Text').map((node: any) => flattenText(node.props.children))
    expect(texts).toContain('calendarSync.notConnected')
    expect(texts).toContain('profile.support.send')
  })
})
