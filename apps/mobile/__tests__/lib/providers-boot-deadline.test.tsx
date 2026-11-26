import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { View } from 'react-native'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { profileKeys } from '@orbit/shared/query'
import { BOOT_DEADLINE_MS, Providers } from '@/lib/providers'
import { queryClient } from '@/lib/query-client'
import { apiClient } from '@/lib/api-client'
import { hideAsync } from 'expo-splash-screen'

const stalled = vi.hoisted(() => ({
  fontsLoaded: true,
  fontError: null as Error | null,
  draftHydrated: true,
  initialize: async () => {},
  restoreQueryCache: async () => {},
}))
const never = () => new Promise<never>(() => {})

vi.mock('expo-router', () => ({ useGlobalSearchParams: () => ({}) }))
vi.mock('expo-font', () => ({ useFonts: () => [stalled.fontsLoaded, stalled.fontError] }))
vi.mock('expo-splash-screen', () => ({ preventAutoHideAsync: vi.fn(), hideAsync: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@expo-google-fonts/geist', () => ({ Geist_400Regular: '', Geist_500Medium: '', Geist_600SemiBold: '' }))
vi.mock('@expo-google-fonts/geist-mono', () => ({ GeistMono_400Regular: '', GeistMono_500Medium: '' }))
vi.mock('@expo-google-fonts/space-grotesk', () => ({ SpaceGrotesk_500Medium: '', SpaceGrotesk_600SemiBold: '' }))
vi.mock('@/lib/query-client', () => ({
  queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  restoreQueryCache: () => stalled.restoreQueryCache(),
  persistQueryCache: vi.fn().mockResolvedValue(undefined),
  clearPersistedQueryCache: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/stores/auth-store', () => {
  const state = { isAuthenticated: true, user: { userId: 'a' }, initialize: () => stalled.initialize() }
  const useAuthStore = (select: (snapshot: typeof state) => unknown) => select(state)
  useAuthStore.getState = () => state
  return { useAuthStore }
})
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/stores/onboarding-draft-store', () => ({ useOnboardingDraftHydrated: () => stalled.draftHydrated }))
vi.mock('@/lib/i18n', () => ({ i18n: { language: 'en' } }))
vi.mock('@/lib/orbit-widget', () => ({ syncWidgetData: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/account-event-connection', () => ({ AccountEventConnection: () => null }))
vi.mock('@/lib/session-resume', () => ({ reconcileSessionOnForeground: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/retired-persistent-reminder', () => ({ retirePersistentReminder: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/posthog', () => ({ posthog: null }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({}) }))
vi.mock('@/hooks/store-billing-provider', () => ({ StoreBillingProvider: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/components/ui/shell-skeleton', () => ({ ShellSkeleton: () => <View testID="shell-skeleton" /> }))

const TestRenderer = require('react-test-renderer')

async function mountProviders() {
  let tree: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    tree = TestRenderer.create(<Providers><View testID="destination" /></Providers>)
  })
  return tree!
}

const has = (tree: ReturnType<typeof TestRenderer.create>, testID: string) =>
  tree.root.findAllByProps({ testID }).length > 0

async function passBootDeadline() {
  await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(BOOT_DEADLINE_MS) })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  queryClient.clear()
  queryClient.setQueryData(profileKeys.detail(), createMockProfile({ themePreference: 'light' }), { updatedAt: Date.now() })
  stalled.fontsLoaded = true
  stalled.fontError = null
  stalled.draftHydrated = true
  stalled.initialize = async () => {}
  stalled.restoreQueryCache = async () => {}
  vi.mocked(apiClient).mockResolvedValue(createMockProfile({ themePreference: 'light' }))
})
afterEach(() => {
  vi.useRealTimers()
  queryClient.clear()
})

describe('startup deadline', () => {
  it('holds the splash while startup is inside the deadline', async () => {
    stalled.initialize = never
    const tree = await mountProviders()
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(BOOT_DEADLINE_MS - 1) })
    expect(hideAsync).not.toHaveBeenCalled()
    expect(has(tree, 'destination')).toBe(false)
  })

  it('renders the shell with its skeleton when the auth check never settles', async () => {
    stalled.initialize = never
    const tree = await mountProviders()
    await passBootDeadline()
    expect(hideAsync).toHaveBeenCalledTimes(1)
    expect(has(tree, 'destination')).toBe(true)
    expect(has(tree, 'shell-skeleton')).toBe(true)
  })

  it('renders the shell with its skeleton when the cache restore never settles', async () => {
    stalled.restoreQueryCache = never
    const tree = await mountProviders()
    await passBootDeadline()
    expect(hideAsync).toHaveBeenCalledTimes(1)
    expect(has(tree, 'destination')).toBe(true)
    expect(has(tree, 'shell-skeleton')).toBe(true)
  })

  it('renders the shell when the onboarding draft never hydrates', async () => {
    stalled.draftHydrated = false
    const tree = await mountProviders()
    await passBootDeadline()
    expect(hideAsync).toHaveBeenCalledTimes(1)
    expect(has(tree, 'destination')).toBe(true)
    expect(has(tree, 'shell-skeleton')).toBe(false)
  })

  it('renders the shell when the fonts never load', async () => {
    stalled.fontsLoaded = false
    const tree = await mountProviders()
    await passBootDeadline()
    expect(hideAsync).toHaveBeenCalledTimes(1)
    expect(has(tree, 'destination')).toBe(true)
    expect(has(tree, 'shell-skeleton')).toBe(false)
  })

  it('releases the splash without the deadline when a font fails to load', async () => {
    stalled.fontsLoaded = false
    stalled.fontError = new Error('font asset missing')
    const tree = await mountProviders()
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(hideAsync).toHaveBeenCalledTimes(1)
    expect(has(tree, 'destination')).toBe(true)
    expect(has(tree, 'shell-skeleton')).toBe(false)
  })

  it('finishes startup in the background and drops the skeleton', async () => {
    let finishAuth: () => void = () => {}
    stalled.initialize = () => new Promise<void>((resolve) => { finishAuth = resolve })
    const tree = await mountProviders()
    await passBootDeadline()
    expect(has(tree, 'shell-skeleton')).toBe(true)
    await TestRenderer.act(async () => { finishAuth(); await vi.advanceTimersByTimeAsync(0) })
    expect(has(tree, 'shell-skeleton')).toBe(false)
    expect(hideAsync).toHaveBeenCalledTimes(1)
  })
})
