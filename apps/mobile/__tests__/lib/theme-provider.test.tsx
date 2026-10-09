import React, { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { profileKeys } from '@orbit/shared/query'
import type { Profile, ThemeMode } from '@orbit/shared/types/profile'
import { ThemeProvider, useThemeContext, type ThemeContextValue } from '../../lib/theme-provider'
import { useProfile } from '@/hooks/use-profile'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { getRuntimeTheme, setRuntimeTheme } from '@/lib/theme'

vi.mock('react-native', async () => ({
  ...await import('../../test-mocks/react-native'),
  Appearance: { getColorScheme: () => 'dark' },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en' } }),
}))
const auth = vi.hoisted(() => ({ isAuthenticated: true }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (select: (state: { isAuthenticated: boolean }) => unknown) => select(auth),
}))
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/lib/queued-api-mutation', () => ({ performQueuedApiMutation: vi.fn().mockResolvedValue(undefined) }))

const TestRenderer = require('react-test-renderer')
const act = TestRenderer.act
const unmounts: (() => void)[] = []

async function setup(previous: ThemeMode) {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  setRuntimeTheme({ scheme: 'orange', themeMode: previous })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(profileKeys.detail(), createMockProfile({ themePreference: previous }))
  const chooser: { current: ThemeContextValue | null } = { current: null }
  const destination: { profile?: Profile; theme: ThemeContextValue | null } = { theme: null }
  let showDestination = () => {}
  function Destination() {
    destination.profile = useProfile({ enabled: false }).profile
    destination.theme = useThemeContext()
    return null
  }
  function Navigation() {
    chooser.current = useThemeContext()
    const [mounted, setMounted] = useState(false)
    showDestination = () => setMounted(true)
    return mounted ? <Destination /> : null
  }
  await act(() => {
    const root = TestRenderer.create(
      <QueryClientProvider client={client}>
        <ThemeProvider captureTheme={null}><Navigation /></ThemeProvider>
      </QueryClientProvider>,
    )
    unmounts.push(() => root.unmount())
  })
  const mountDestination = async () => {
    await act(() => showDestination())
  }
  const flushNotifications = async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  }
  return { client, chooser, destination, mountDestination, flushNotifications }
}

afterEach(async () => {
  await act(() => { for (const unmount of unmounts.splice(0)) unmount() })
  auth.isAuthenticated = true
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('mobile theme choice across profile consumers', () => {
  it('waits for stored-session validation before persisting a missing theme', async () => {
    auth.isAuthenticated = false
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(profileKeys.detail(), createMockProfile({ themePreference: null }))
    let root: ReturnType<typeof TestRenderer.create>
    const tree = <QueryClientProvider client={client}><ThemeProvider captureTheme={null}><React.Fragment /></ThemeProvider></QueryClientProvider>
    await act(() => {
      root = TestRenderer.create(tree)
      unmounts.push(() => root.unmount())
    })
    expect(performQueuedApiMutation).not.toHaveBeenCalled()
    auth.isAuthenticated = true
    await act(() => root.update(<QueryClientProvider client={client}><ThemeProvider captureTheme={null}><React.Fragment /></ThemeProvider></QueryClientProvider>))
    expect(performQueuedApiMutation).toHaveBeenCalledWith(expect.objectContaining({ type: 'setThemePreference' }))
  })

  it.each([['dark', 'light'], ['light', 'dark']] as const)(
    'keeps %s to %s after mounting another profile consumer', async (previous, chosen) => {
      let resolveSave: () => void = () => {}
      vi.mocked(performQueuedApiMutation).mockImplementationOnce(() => new Promise<void>((resolve) => { resolveSave = resolve }))
      const { client, chooser, destination, mountDestination, flushNotifications } = await setup(previous)
      await act(() => chooser.current?.applyTheme(chosen))
      await mountDestination()
      await flushNotifications()

      expect(destination.theme?.currentTheme).toBe(chosen)
      expect(destination.profile?.themePreference).toBe(chosen)
      expect(client.getQueryData<Profile>(profileKeys.detail())?.themePreference).toBe(chosen)
      expect(getRuntimeTheme().themeMode).toBe(chosen)
      await act(() => resolveSave())
      expect(chooser.current?.currentTheme).toBe(chosen)
    },
  )

  it('restores provider, runtime and cached themes after a failed save', async () => {
    let rejectSave: (error: Error) => void = () => {}
    vi.mocked(performQueuedApiMutation).mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectSave = reject }))
    const { client, chooser, destination, mountDestination, flushNotifications } = await setup('dark')
    await act(() => chooser.current?.applyTheme('light'))
    await mountDestination()
    await flushNotifications()
    expect(destination.profile?.themePreference).toBe('light')
    await act(() => rejectSave(new Error('Save failed')))

    await flushNotifications()
    expect(destination.theme?.currentTheme).toBe('dark')
    expect(chooser.current?.currentTheme).toBe('dark')
    expect(client.getQueryData<Profile>(profileKeys.detail())?.themePreference).toBe('dark')
    expect(getRuntimeTheme().themeMode).toBe('dark')
  })
})
