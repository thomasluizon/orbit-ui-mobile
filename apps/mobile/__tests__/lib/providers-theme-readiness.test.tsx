import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onlineManager, QueryClient } from '@tanstack/react-query'
import { View } from 'react-native'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { profileKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { Providers } from '@/lib/providers'
import { useThemeContext } from '../../lib/theme-provider'
import { queryClient } from '@/lib/query-client'
import { apiClient } from '@/lib/api-client'
import { hideAsync } from 'expo-splash-screen'

const { refreshSession } = vi.hoisted(() => ({ refreshSession: vi.fn() }))
vi.mock('expo-router', () => ({ useGlobalSearchParams: () => ({}) }))
vi.mock('expo-font', () => ({ useFonts: () => [true] }))
vi.mock('expo-splash-screen', () => ({ preventAutoHideAsync: vi.fn(), hideAsync: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@expo-google-fonts/geist', () => ({ Geist_400Regular: '', Geist_500Medium: '', Geist_600SemiBold: '' }))
vi.mock('@expo-google-fonts/geist-mono', () => ({ GeistMono_400Regular: '', GeistMono_500Medium: '' }))
vi.mock('@expo-google-fonts/space-grotesk', () => ({ SpaceGrotesk_500Medium: '', SpaceGrotesk_600SemiBold: '' }))
vi.mock('@/lib/query-client', () => ({
  queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  restoreQueryCache: vi.fn().mockResolvedValue(undefined),
  persistQueryCache: vi.fn().mockResolvedValue(undefined),
  clearPersistedQueryCache: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/stores/auth-store', () => {
  const state = { isAuthenticated: true, initialize: async () => {} }
  const useAuthStore = (select: (snapshot: typeof state) => unknown) => select(state)
  useAuthStore.getState = () => state
  return {
    useAuthStore,
    getSessionGeneration: () => ({ epoch: 0, credentialVersion: 0 }),
    isAuthTransitionInFlight: () => false,
    refreshSession,
  }
})
vi.mock('@/lib/secure-store', () => ({ getToken: () => Promise.resolve('session-token') }))
vi.mock('@/lib/app-version', () => ({ buildAppVersionHeaders: () => ({}) }))
vi.mock('@/stores/onboarding-draft-store', () => ({ useOnboardingDraftHydrated: () => true }))
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/lib/theme-provider', async () => await import('../../lib/theme-provider'))
vi.mock('@/lib/i18n', () => ({ i18n: { language: 'en' } }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' } }) }))
vi.mock('@/lib/queued-api-mutation', () => ({ performQueuedApiMutation: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/orbit-widget', () => ({ syncWidgetData: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/account-event-connection', () => ({ AccountEventConnection: () => null }))
vi.mock('@/lib/session-resume', () => ({ reconcileSessionOnForeground: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/retired-persistent-reminder', () => ({ retirePersistentReminder: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/posthog', () => ({ posthog: null }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({}) }))

const TestRenderer = require('react-test-renderer')
const unmounts: (() => void)[] = []
const renderedThemes: string[] = []
function ThemeDestination() {
  const theme = useThemeContext()!.currentTheme
  renderedThemes.push(theme)
  return <View testID="theme-destination" accessibilityLabel={theme} />
}

async function mountProviders() {
  let tree: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    tree = TestRenderer.create(<Providers><ThemeDestination /></Providers>)
    unmounts.push(() => tree.unmount())
  })
  return tree!
}

beforeEach(() => {
  queryClient.clear()
  renderedThemes.length = 0
  vi.clearAllMocks()
})
afterEach(async () => {
  await TestRenderer.act(() => { for (const unmount of unmounts.splice(0)) unmount() })
  onlineManager.setOnline(true)
  queryClient.clear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('native profile theme readiness', () => {
  it('holds the destination and splash until a cold light profile is loaded', async () => {
    const profile = createMockProfile({ themePreference: 'light' })
    let resolveProfile: (value: typeof profile) => void = () => {}
    vi.mocked(apiClient).mockImplementation(() => new Promise((resolve) => { resolveProfile = resolve }))
    const tree = await mountProviders()
    expect(renderedThemes).toEqual([])
    expect(hideAsync).not.toHaveBeenCalled()
    await TestRenderer.act(() => resolveProfile(profile))
    expect(tree.root.findByProps({ testID: 'theme-destination' }).props.accessibilityLabel).toBe('light')
    expect(renderedThemes.every((theme) => theme === 'light')).toBe(true)
    expect(hideAsync).toHaveBeenCalledTimes(1)
    expect(vi.mocked(apiClient).mock.calls[0]?.[0]).toBe(API.profile.get)
  })

  it('keeps the cached light profile and releases startup after an offline read fails', async () => {
    queryClient.setQueryData(profileKeys.detail(), createMockProfile({ themePreference: 'light' }), { updatedAt: 1 })
    onlineManager.setOnline(false)
    vi.mocked(apiClient).mockRejectedValue(new TypeError('Network request failed'))
    const tree = await mountProviders()
    expect(tree.root.findByProps({ testID: 'theme-destination' }).props.accessibilityLabel).toBe('light')
    expect(renderedThemes.every((theme) => theme === 'light')).toBe(true)
    expect(hideAsync).toHaveBeenCalledTimes(1)
  })

  it('releases startup in the system theme when a cold profile read times out', async () => {
    vi.useFakeTimers()
    vi.mocked(apiClient).mockImplementation((_path, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('Profile read aborted')), { once: true })
    }))
    const tree = await mountProviders()
    expect(renderedThemes).toEqual([])
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(10000) })
    expect(tree.root.findByProps({ testID: 'theme-destination' }).props.accessibilityLabel).toBe('dark')
    expect(hideAsync).toHaveBeenCalledTimes(1)
  })

  it('releases startup after a profile 401 without waiting for session recovery', async () => {
    vi.useFakeTimers()
    const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
    vi.mocked(apiClient).mockImplementation(actual.apiClient)
    refreshSession.mockImplementation(() => new Promise(() => {}))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
    const tree = await mountProviders()
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(10000) })
    expect(fetch).toHaveBeenCalled()
    expect(refreshSession).toHaveBeenCalled()
    expect(hideAsync).toHaveBeenCalledTimes(1)
    expect(tree.root.findByProps({ testID: 'theme-destination' }).props.accessibilityLabel).toBe('dark')
  })
})
