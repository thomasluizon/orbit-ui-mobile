import { beforeEach, describe, expect, it, vi } from 'vitest'
import { View } from 'react-native'

process.env.EXPO_PUBLIC_CAPTURE_MODE = 'true'

const TestRenderer = require('react-test-renderer')

let searchParameters: Record<string, string | string[]> = {}
let pendingLanguageChanges: (() => void)[] = []
let pendingSplashHides: (() => void)[] = []

const changeLanguage = vi.fn(
  (_locale: string) =>
    new Promise<void>((resolve) => {
      pendingLanguageChanges.push(resolve)
    }),
)

vi.mock('expo-router', () => ({
  useGlobalSearchParams: () => searchParameters,
}))

vi.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '1' }))

vi.mock('@/lib/i18n', () => ({
  i18n: { changeLanguage: (locale: string) => changeLanguage(locale) },
}))

vi.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: vi.fn(() => Promise.resolve()),
  hideAsync: vi.fn(
    () =>
      new Promise<void>((resolve) => {
        pendingSplashHides.push(resolve)
      }),
  ),
}))

vi.mock('expo-font', () => ({ useFonts: () => [true] }))
vi.mock('@expo-google-fonts/geist', () => ({
  Geist_400Regular: 'Geist_400Regular',
  Geist_500Medium: 'Geist_500Medium',
  Geist_600SemiBold: 'Geist_600SemiBold',
}))
vi.mock('@expo-google-fonts/geist-mono', () => ({
  GeistMono_400Regular: 'GeistMono_400Regular',
  GeistMono_500Medium: 'GeistMono_500Medium',
}))
vi.mock('@expo-google-fonts/space-grotesk', () => ({
  SpaceGrotesk_500Medium: 'SpaceGrotesk_500Medium',
  SpaceGrotesk_600SemiBold: 'SpaceGrotesk_600SemiBold',
}))

vi.mock('@/lib/query-client', async () => {
  const { QueryClient } = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    queryClient: new QueryClient(),
    restoreQueryCache: vi.fn(() => Promise.resolve()),
    persistQueryCache: vi.fn(() => Promise.resolve()),
    clearPersistedQueryCache: vi.fn(() => Promise.resolve()),
  }
})

vi.mock('@/lib/orbit-widget', () => ({ syncWidgetData: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/account-event-connection', () => ({ AccountEventConnection: () => null }))
vi.mock('@/lib/session-resume', () => ({ reconcileSessionOnForeground: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/capture-animation-pin', () => ({ pinCaptureAnimationDurations: vi.fn() }))

vi.mock('@/lib/theme-provider', () => ({
  useThemeContext: () => null,
  ThemeProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ pendingCount: 0, isFlushing: false }) }))
vi.mock('@/lib/offline-mutations', () => ({
  subscribeDroppedMutations: () => () => {},
  getMutationScope: () => null,
}))
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showInfo: vi.fn(), showQueued: vi.fn(), showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock('@/stores/onboarding-draft-store', () => {
  const useOnboardingDraftStore = (selector?: (state: object) => unknown) =>
    selector ? selector({}) : {}
  useOnboardingDraftStore.getState = () => ({})
  return { useOnboardingDraftStore, useOnboardingDraftHydrated: () => true }
})

const initialize = vi.fn(() => Promise.resolve())
vi.mock('@/stores/auth-store', () => {
  const useAuthStore = (selector: (state: { initialize: typeof initialize }) => unknown) =>
    selector({ initialize })
  useAuthStore.getState = () => ({ isAuthenticated: false })
  return { useAuthStore }
})

const CHILD = 'capture-readiness-child'

async function flush() {
  await TestRenderer.act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function applyPendingLanguage() {
  const resolvers = pendingLanguageChanges
  pendingLanguageChanges = []
  for (const resolve of resolvers) resolve()
}

function applyPendingLanguageNewestFirst() {
  const resolvers = pendingLanguageChanges.slice().reverse()
  pendingLanguageChanges = []
  return resolvers
}

function childRendered(tree: { root: { findAllByProps: (p: object) => unknown[] } }) {
  return tree.root.findAllByProps({ testID: CHILD }).length > 0
}

function childReadiness(
  tree: { root: { findAllByProps: (p: object) => { props: { accessibilityLabel?: string } }[] } },
) {
  return tree.root.findAllByProps({ testID: CHILD })[0]?.props.accessibilityLabel ?? null
}

describe('capture readiness gating', () => {
  beforeEach(() => {
    searchParameters = { captureLocale: 'en', captureTheme: 'dark' }
    pendingLanguageChanges = []
    pendingSplashHides = []
    changeLanguage.mockClear()
  })

  it('keeps the warm navigator mounted while splash settlement and the later tuple are pending', async () => {
    const { Providers, useCaptureReady } = await import('@/lib/providers')
    const CaptureChild = () => (
      <View testID={CHILD} accessibilityLabel={useCaptureReady() ? 'ready' : 'waiting'} />
    )

    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Providers>
          <CaptureChild />
        </Providers>,
      )
      await Promise.resolve()
    })

    expect(childRendered(tree)).toBe(false)
    expect(tree.root.findAll((node: any) => node.type === 'View' && node.props.testID === 'startup-canvas')).toHaveLength(1)
    expect(tree.root.findAll((node: any) => node.type === 'ActivityIndicator')).toHaveLength(0)

    applyPendingLanguage()
    await flush()
    expect(childRendered(tree)).toBe(true)
    expect(childReadiness(tree)).toBe('ready')
    expect(changeLanguage).toHaveBeenCalledWith('en')
    expect(pendingSplashHides).toHaveLength(1)

    searchParameters = { captureLocale: 'pt-BR', captureTheme: 'dark' }
    await TestRenderer.act(async () => {
      tree.update(
        <Providers>
          <CaptureChild />
        </Providers>,
      )
      await Promise.resolve()
    })

    expect(childRendered(tree)).toBe(true)
    expect(childReadiness(tree)).toBe('waiting')
    expect(pendingSplashHides).toHaveLength(1)
    expect(tree.root.findAll((node: any) => node.type === 'View' && node.props.testID === 'shell-skeleton')).toHaveLength(1)
    expect(tree.root.findAll((node: any) => node.type === 'ActivityIndicator')).toHaveLength(0)

    applyPendingLanguage()
    await flush()
    expect(childRendered(tree)).toBe(true)
    expect(childReadiness(tree)).toBe('ready')
    expect(changeLanguage).toHaveBeenLastCalledWith('pt-BR')
  })

  it('keeps an abandoned boot from marking a superseded tuple as applied', async () => {
    const { Providers, useCaptureReady } = await import('@/lib/providers')
    const CaptureChild = () => (
      <View testID={CHILD} accessibilityLabel={useCaptureReady() ? 'ready' : 'waiting'} />
    )

    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Providers>
          <CaptureChild />
        </Providers>,
      )
      await Promise.resolve()
    })

    searchParameters = { captureLocale: 'pt-BR', captureTheme: 'light' }
    await TestRenderer.act(async () => {
      tree.update(
        <Providers>
          <CaptureChild />
        </Providers>,
      )
      await Promise.resolve()
    })

    expect(changeLanguage).toHaveBeenCalledTimes(2)

    const resolvers = applyPendingLanguageNewestFirst()
    expect(resolvers).toHaveLength(2)
    await TestRenderer.act(async () => {
      for (const resolve of resolvers) {
        resolve()
        await Promise.resolve()
        await Promise.resolve()
      }
    })

    expect(childRendered(tree)).toBe(true)
    expect(childReadiness(tree)).toBe('ready')
    expect(changeLanguage).toHaveBeenLastCalledWith('pt-BR')
  })

  it('does not restart capture boot when router arrays keep their semantic values', async () => {
    const { Providers, useCaptureReady } = await import('@/lib/providers')
    const CaptureChild = () => (
      <View testID={CHILD} accessibilityLabel={useCaptureReady() ? 'ready' : 'waiting'} />
    )

    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Providers>
          <CaptureChild />
        </Providers>,
      )
      await Promise.resolve()
    })

    applyPendingLanguage()
    await flush()
    expect(childRendered(tree)).toBe(true)
    expect(childReadiness(tree)).toBe('ready')
    expect(changeLanguage).toHaveBeenCalledTimes(1)

    for (let render = 0; render < 3; render += 1) {
      searchParameters = { captureLocale: ['en'], captureTheme: ['dark'] }
      await TestRenderer.act(async () => {
        tree.update(
          <Providers>
            <CaptureChild />
          </Providers>,
        )
        await Promise.resolve()
      })
    }

    expect(childRendered(tree)).toBe(true)
    expect(changeLanguage).toHaveBeenCalledTimes(1)
    expect(pendingLanguageChanges).toHaveLength(0)
  })
})
