import React from 'react'
import { expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { profileKeys } from '@orbit/shared/query'
import { Providers } from '@/lib/providers'
import { queryClient } from '@/lib/query-client'
import { captureAndroidUpdateCheck, captureAndroidUpdateSheetShown, posthog } from '@/lib/posthog'

const { refreshSession } = vi.hoisted(() => ({ refreshSession: vi.fn() }))
vi.mock('expo-router', () => ({ useGlobalSearchParams: () => ({}), useSegments: () => ['(tabs)'] }))
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
  const state = { isAuthenticated: true, user: { userId: 'a' }, initialize: async () => {} }
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

vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({}) }))

const gate = vi.hoisted(() => {
  process.env.EXPO_PUBLIC_POSTHOG_KEY = 'project-key'
  return { resolved: false, readPreference: vi.fn<() => Promise<string | null>>(), refetch: vi.fn() }
})
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: gate.readPreference, setItem: vi.fn() },
}))
vi.mock('@/hooks/use-config', () => ({ useConfig: () => ({
  config: { features: { analytics: { enabled: true } } },
  isFetchedAfterMount: gate.resolved, isFetching: !gate.resolved, refetch: gate.refetch,
}) }))
vi.mock('@/hooks/store-billing-provider', () => ({ StoreBillingProvider: ({ children }: { children: React.ReactNode }) => children }))

const TestRenderer = require('react-test-renderer')

function StartupUpdateEvents() {
  React.useEffect(() => {
    captureAndroidUpdateCheck({ outcome: 'success', play_status: 2, available_version_code: 181,
      installed_version_code: 178, play_error_code: null })
    captureAndroidUpdateSheetShown({ sheet: 'available', available_version_code: 181, installed_version_code: 178 })
  }, [])
  return null
}

it('delivers cold launch update events after the provider resolves config and the saved preference', async () => {
  queryClient.setQueryData(profileKeys.detail(), createMockProfile({ themePreference: 'light' }))
  let resolvePreference!: (value: string | null) => void
  gate.readPreference.mockImplementation(() => new Promise((resolve) => { resolvePreference = resolve }))
  let tree!: ReturnType<typeof TestRenderer.create>
  try {
    await TestRenderer.act(() => { tree = TestRenderer.create(<Providers><StartupUpdateEvents /></Providers>) })
    expect(gate.refetch).toHaveBeenCalledOnce()
    expect(gate.readPreference).toHaveBeenCalled()
    expect(posthog!.capture).not.toHaveBeenCalled()
    await TestRenderer.act(() => resolvePreference(null))
    expect(posthog!.capture).not.toHaveBeenCalled()
    gate.resolved = true
    await TestRenderer.act(() => { tree.update(<Providers><StartupUpdateEvents /></Providers>) })
    expect(posthog!.capture).toHaveBeenCalledTimes(2)
    expect(posthog!.capture).toHaveBeenNthCalledWith(1, 'android_update_checked', expect.objectContaining({ available_version_code: 181 }))
    expect(posthog!.capture).toHaveBeenNthCalledWith(2, 'android_update_sheet_shown', expect.objectContaining({ available_version_code: 181 }))
  } finally {
    await TestRenderer.act(() => tree?.unmount())
    queryClient.clear()
  }
})
