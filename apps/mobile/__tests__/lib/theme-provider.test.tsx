import React, { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { profileKeys } from '@orbit/shared/query'
import type { Profile, ThemeMode } from '@orbit/shared/types/profile'
import { ThemeProvider, type ThemeContextValue } from '../../lib/theme-provider'
import { useProfile } from '@/hooks/use-profile'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { Animated } from 'react-native'
import { motionDurations, motionEasings, resolveMotionPreset, type MotionScenario } from '@orbit/shared/theme'
import { createTokensV2, getRuntimeTheme, setRuntimeTheme } from '@/lib/theme'
import { toAnimatedEasing } from '@/lib/motion'
import { useAppTheme } from '../../lib/use-app-theme'
import { RootNotificationHeader } from '@/components/navigation/root-notification-header'
import { Sun, Moon } from '@/components/ui/icons'

const motionState = vi.hoisted(() => ({ prefersReducedMotion: false }))
vi.mock('@/lib/motion', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/motion')>(),
  usePrefersReducedMotion: () => motionState.prefersReducedMotion,
  useResolvedMotionPreset: (scenario: MotionScenario) => resolveMotionPreset(scenario, motionState.prefersReducedMotion),
}))
vi.mock('@/lib/use-app-theme', async () => await import('../../lib/use-app-theme'))
vi.mock('@/components/navigation/notification-bell', () => ({ NotificationBell: () => null }))
vi.mock('@/lib/theme-provider', async () => await import('../../lib/theme-provider'))

const appearance = vi.hoisted((): { scheme: ThemeMode } => ({ scheme: 'dark' }))
vi.mock('react-native', async () => ({
  ...await import('../../test-mocks/react-native'),
  Appearance: { getColorScheme: () => appearance.scheme },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
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

function findThemeOverlays(renderer: ReturnType<typeof TestRenderer.create>) {
  return renderer.root.findAll(
    (node: { type: unknown; props: { pointerEvents?: string } }) => node.type === 'AnimatedView' && node.props.pointerEvents === 'none',
  )
}

async function setup(previous: ThemeMode, content?: ReactNode, storedPreference: ThemeMode | null = previous) {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  setRuntimeTheme({ scheme: 'orange', themeMode: previous })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(profileKeys.detail(), createMockProfile({ themePreference: storedPreference }))
  const chooser: { current: ThemeContextValue | null } = { current: null }
  const destination: { profile?: Profile; theme: ThemeContextValue | null } = { theme: null }
  const renderedThemes: (ThemeMode | undefined)[] = []
  let showDestination = () => {}
  function Destination() {
    destination.profile = useProfile({ enabled: false }).profile
    destination.theme = useAppTheme()
    return null
  }
  function Navigation() {
    chooser.current = useAppTheme()
    renderedThemes.push(chooser.current.currentTheme)
    const [mounted, setMounted] = useState(false)
    showDestination = () => setMounted(true)
    return mounted ? <Destination /> : null
  }
  let root!: ReturnType<typeof TestRenderer.create>
  await act(() => {
    root = TestRenderer.create(
      <QueryClientProvider client={client}>
        <ThemeProvider captureTheme={null}><Navigation />{content}</ThemeProvider>
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
  return { root, client, chooser, destination, mountDestination, flushNotifications, renderedThemes }
}

afterEach(async () => {
  await act(() => { for (const unmount of unmounts.splice(0)) unmount() })
  auth.isAuthenticated = true
  appearance.scheme = 'dark'
  motionState.prefersReducedMotion = false
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('mobile theme choice across profile consumers', () => {
  it.each([['dark', 'light'], ['light', 'dark']] as const)('shares %s to %s between two mounted theme hooks', async (previous, chosen) => {
    const { chooser, destination, mountDestination, flushNotifications } = await setup(previous)
    await mountDestination()
    expect(destination.theme?.currentTheme).toBe(previous)
    await act(() => chooser.current?.applyTheme(chosen))
    await flushNotifications()
    expect(chooser.current?.currentTheme).toBe(chosen)
    expect(destination.theme?.currentTheme).toBe(chosen)
    await act(() => destination.theme?.toggleTheme())
    await flushNotifications()
    expect(chooser.current?.currentTheme).toBe(previous)
    expect(destination.theme?.currentTheme).toBe(previous)
  })

  it('renders a restored light profile in light from its first frame on a dark system', async () => {
    const { chooser, renderedThemes } = await setup('light')
    expect(renderedThemes).toEqual(['light'])
    expect(chooser.current?.currentTheme).toBe('light')
    expect(getRuntimeTheme().themeMode).toBe('light')
  })

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

it('persists header presses through the native theme provider and keeps the target glyph in sync', async () => {
  const { root, client, flushNotifications } = await setup('dark', <RootNotificationHeader />)
  const button = root.root.findByType('Pressable')
  expect(button.props.accessibilityLabel).toBe('settings.theme.switchToLight')
  expect(root.root.findAllByType(Sun)).toHaveLength(1)
  await act(() => button.props.onPress())
  await flushNotifications()
  expect(button.props.accessibilityLabel).toBe('settings.theme.switchToDark')
  expect(root.root.findAllByType(Moon)).toHaveLength(1)
  expect(client.getQueryData(profileKeys.detail())).toMatchObject({ themePreference: 'light' })
  expect(getRuntimeTheme().themeMode).toBe('light')
  expect(performQueuedApiMutation).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'setThemePreference', payload: { themePreference: 'light' } }))
  await act(() => button.props.onPress())
  await flushNotifications()
  expect(button.props.accessibilityLabel).toBe('settings.theme.switchToLight')
  expect(client.getQueryData(profileKeys.detail())).toMatchObject({ themePreference: 'dark' })
})

it('crossfades a theme change in the provider root without presenting a native Modal', async () => {
  const { root, chooser } = await setup('dark')
  const frames: ((time: number) => void)[] = []
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: (time: number) => void) => frames.push(callback)))
  const fades: { config: Animated.TimingAnimationConfig; finish?: Animated.EndCallback }[] = []
  const timing = vi.spyOn(Animated, 'timing').mockImplementation((_value, config) => {
    const fade: (typeof fades)[number] = { config }
    fades.push(fade)
    return { start: (finish) => { fade.finish = finish }, stop: () => {}, reset: () => {} }
  })
  const previous = createTokensV2('orange', 'dark')
  const findOverlay = () => findThemeOverlays(root)

  expect(findOverlay()).toHaveLength(0)
  await act(() => chooser.current?.applyTheme('light'))

  expect(root.root.findAllByType('Modal')).toHaveLength(0)
  const [overlay] = findOverlay()
  expect(overlay).toBeDefined()
  const colours = overlay.findAllByType('View').map((node: { props: { style: { backgroundColor?: string }[] } }) => node.props.style[1]?.backgroundColor)
  expect(colours).toEqual([previous.bg])
  expect(frames).toHaveLength(1)
  await act(() => frames[0]?.(0))
  expect(fades).toHaveLength(1)
  const fade = fades[0]
  expect(fade?.config).toMatchObject({ toValue: 0, duration: motionDurations.theme, useNativeDriver: true })
  expect(fade?.config.easing?.(0.5)).toBeCloseTo(toAnimatedEasing(motionEasings.standard)(0.5))
  await act(() => fade?.finish?.({ finished: true }))
  expect(findOverlay()).toHaveLength(0)
  expect(root.root.findAllByType('Modal')).toHaveLength(0)
  timing.mockRestore()
})

it('changes the theme at once without an overlay when reduced motion is on', async () => {
  motionState.prefersReducedMotion = true
  const { root, chooser } = await setup('dark')
  const frames = vi.fn(() => 1)
  vi.stubGlobal('requestAnimationFrame', frames)
  const timing = vi.spyOn(Animated, 'timing')

  await act(() => chooser.current?.applyTheme('light'))

  expect(chooser.current?.currentTheme).toBe('light')
  expect(getRuntimeTheme().themeMode).toBe('light')
  expect(findThemeOverlays(root)).toHaveLength(0)
  expect(frames).not.toHaveBeenCalled()
  expect(timing).not.toHaveBeenCalled()
  timing.mockRestore()
})

it('crossfades a theme that reaches the profile after sign-in or from another device, like a chosen theme', async () => {
  const { root, client, chooser, flushNotifications } = await setup('dark')
  expect(findThemeOverlays(root)).toHaveLength(0)

  await act(() => { client.setQueryData(profileKeys.detail(), createMockProfile({ themePreference: 'light' })) })
  await flushNotifications()

  expect(chooser.current?.currentTheme).toBe('light')
  const [overlay] = findThemeOverlays(root)
  expect(overlay).toBeDefined()
  const colours = overlay.findAllByType('View').map((node: { props: { style: { backgroundColor?: string }[] } }) => node.props.style[1]?.backgroundColor)
  expect(colours).toEqual([createTokensV2('orange', 'dark').bg])
})

it('crossfades first-run detection when the system scheme differs from the first frame', async () => {
  appearance.scheme = 'light'
  const { root, chooser, flushNotifications, renderedThemes } = await setup('dark', undefined, null)
  await flushNotifications()

  expect(renderedThemes[0]).toBe('dark')
  expect(chooser.current?.currentTheme).toBe('light')
  expect(performQueuedApiMutation).toHaveBeenCalledWith(expect.objectContaining({ type: 'setThemePreference', payload: { themePreference: 'light' } }))
  expect(findThemeOverlays(root)).toHaveLength(1)
})
