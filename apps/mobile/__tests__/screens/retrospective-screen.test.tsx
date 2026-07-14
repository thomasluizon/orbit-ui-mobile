import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'

import RetrospectiveScreen from '@/app/retrospective'

const TestRenderer = require('react-test-renderer')

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
  openURL: vi.fn(),
  getItem: vi.fn(),
  setItem: vi.fn(),
  isOnline: true,
  profile: null as ReturnType<typeof createMockProfile> | null,
  hasProAccess: true,
  isYearlyPro: true,
  router: { push: vi.fn(), replace: vi.fn() },
  goBack: vi.fn(),
  retro: {
    data: null as unknown,
    setData: vi.fn(),
    isLoading: false,
    error: null as string | null,
    setError: vi.fn(),
    noData: false,
    setNoData: vi.fn(),
    fromCache: false,
    period: 'week' as string,
    setPeriod: vi.fn(),
    generate: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('expo-router', () => ({ useRouter: () => mocks.router }))
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>()
  return { ...actual, Linking: { openURL: (...args: unknown[]) => mocks.openURL(...args) } }
})
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (...args: unknown[]) => mocks.getItem(...args),
    setItem: (...args: unknown[]) => mocks.setItem(...args),
    removeItem: vi.fn(),
  },
}))
vi.mock('@/lib/api-client', () => ({ apiClient: (...args: unknown[]) => mocks.apiClient(...args) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.isOnline }) }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => mocks.goBack }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profile }),
  useHasProAccess: () => mocks.hasProAccess,
  useIsYearlyPro: () => mocks.isYearlyPro,
}))
vi.mock('@/hooks/use-retrospective', () => ({ useRetrospective: () => mocks.retro }))

const tokensProxy = new Proxy({}, { get: () => '#111111' }) as Record<string, string>
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))
vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createTokensV2: () => tokensProxy }
})
vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('@/components/ui/offline-unavailable-state', () => ({
  OfflineUnavailableState: () => React.createElement('OfflineUnavailableState'),
}))
vi.mock('@/components/ui/chip', () => ({
  Chip: (props: Record<string, unknown>) => React.createElement('Chip', props, props.children as never),
}))
vi.mock('@/app/retrospective-locked-states', () => ({
  RetrospectiveLockedYearly: (props: Record<string, unknown>) =>
    React.createElement('RetrospectiveLockedYearly', props),
}))
vi.mock('@/app/retrospective-view', () => ({
  RetrospectiveContent: (props: Record<string, unknown>) =>
    React.createElement('RetrospectiveContent', props),
}))
vi.mock('@/app/retrospective-styles', () => ({ styles: new Proxy({}, { get: () => ({}) }) }))

async function renderScreen() {
  let tree: { root: TestNode; update: (element: React.ReactElement) => void } | undefined
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<RetrospectiveScreen />)
    await Promise.resolve()
    await Promise.resolve()
  })
  return tree!
}

function findByType(root: TestNode, type: string) {
  return root.findAll((node) => node.type === type)[0]!
}

describe('RetrospectiveScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isOnline = true
    mocks.profile = createMockProfile({ isTrialActive: false })
    mocks.hasProAccess = true
    mocks.isYearlyPro = true
    mocks.retro.data = null
    mocks.retro.isLoading = false
    mocks.retro.error = null
    mocks.retro.noData = false
    mocks.retro.fromCache = false
    mocks.retro.period = 'week'
    mocks.getItem.mockResolvedValue(null)
    mocks.setItem.mockResolvedValue(undefined)
  })

  it('redirects a non-pro user to the upgrade screen', async () => {
    mocks.hasProAccess = false
    await renderScreen()
    expect(mocks.router.replace).toHaveBeenCalledTimes(1)
  })

  it('selects a period and resets the retrospective state', async () => {
    const tree = await renderScreen()
    const monthChip = tree.root.findAll(
      (node) => node.type === 'Chip' && node.props.children === 'retrospective.periods.month',
    )[0]!
    await TestRenderer.act(async () => {
      ;(monthChip.props.onPress as () => void)()
    })
    expect(mocks.retro.setPeriod).toHaveBeenCalledWith('month')
    expect(mocks.retro.setData).toHaveBeenCalledWith(null)
    expect(mocks.retro.setError).toHaveBeenCalledWith(null)
    expect(mocks.retro.setNoData).toHaveBeenCalledWith(false)
  })

  it('generates online but shows the offline message when disconnected', async () => {
    const tree = await renderScreen()
    await TestRenderer.act(async () => {
      ;(findByType(tree.root, 'RetrospectiveContent').props.onGenerate as () => void)()
    })
    expect(mocks.retro.generate).toHaveBeenCalledTimes(1)

    mocks.isOnline = false
    const offlineTree = await renderScreen()
    await TestRenderer.act(async () => {
      ;(findByType(offlineTree.root, 'RetrospectiveContent').props.onGenerate as () => void)()
    })
    expect(mocks.retro.setError).toHaveBeenCalledWith('offline.title')
  })

  it('falls back to the cached retrospective while offline', async () => {
    mocks.isOnline = false
    mocks.getItem.mockResolvedValue(JSON.stringify({ summary: 'cached recap' }))
    const tree = await renderScreen()
    const content = findByType(tree.root, 'RetrospectiveContent')
    expect(content.props.displayedFromCache).toBe(true)
    expect(content.props.displayedData).toEqual({ summary: 'cached recap' })
  })

  it('ignores a corrupted cache entry without throwing', async () => {
    mocks.isOnline = false
    mocks.getItem.mockResolvedValue('{ broken')
    const tree = await renderScreen()
    expect(findByType(tree.root, 'RetrospectiveContent').props.displayedData).toBeNull()
  })

  it('persists freshly generated data to the cache', async () => {
    mocks.retro.data = { summary: 'fresh' }
    await renderScreen()
    expect(mocks.setItem).toHaveBeenCalledTimes(1)
    expect(mocks.setItem.mock.calls[0]![1]).toBe(JSON.stringify({ summary: 'fresh' }))
  })

  it('opens the billing portal and subscribes from the locked-yearly panel', async () => {
    mocks.isYearlyPro = false
    mocks.apiClient.mockResolvedValue({ url: 'https://portal.test' })
    const tree = await renderScreen()
    const locked = findByType(tree.root, 'RetrospectiveLockedYearly')
    await TestRenderer.act(async () => {
      ;(locked.props.onOpenPortal as () => void)()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
    expect(mocks.openURL).toHaveBeenCalledWith('https://portal.test')
    await TestRenderer.act(async () => {
      ;(locked.props.onSubscribe as () => void)()
    })
    expect(mocks.router.push).toHaveBeenCalledTimes(1)
  })

  it('reports offline when opening the portal without a connection', async () => {
    mocks.isYearlyPro = false
    mocks.isOnline = false
    const tree = await renderScreen()
    await TestRenderer.act(async () => {
      ;(findByType(tree.root, 'RetrospectiveLockedYearly').props.onOpenPortal as () => void)()
      await Promise.resolve()
    })
    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(findByType(tree.root, 'RetrospectiveLockedYearly').props.portalError).toBe('offline.title')
  })
})
