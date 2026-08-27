/**
 * A capture re-run changes locale and theme through the deep link, and applying a locale is
 * asynchronous. These tests pin both readiness boundaries: initial boot must not expose the app
 * tree, while a later tuple must keep the Expo Router navigator mounted and only withdraw its
 * route probe until the new locale is ready. Unmounting the warm navigator makes Expo Router loop.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { View } from 'react-native'

/** Read at module load by capture-mode, so it is set before the dynamic Providers import. */
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

/** Reached transitively through the auth storage wrapper; the native module has no test binding. */
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(() => Promise.resolve(null)),
  setItemAsync: vi.fn(() => Promise.resolve()),
  deleteItemAsync: vi.fn(() => Promise.resolve()),
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

vi.mock('@expo-google-fonts/rubik', () => ({
  useFonts: () => [true],
  Rubik_400Regular: 'Rubik_400Regular',
  Rubik_500Medium: 'Rubik_500Medium',
  Rubik_600SemiBold: 'Rubik_600SemiBold',
  Rubik_700Bold: 'Rubik_700Bold',
}))
vi.mock('@expo-google-fonts/inter', () => ({
  Inter_500Medium: 'Inter_500Medium',
  Inter_600SemiBold: 'Inter_600SemiBold',
  Inter_700Bold: 'Inter_700Bold',
}))
vi.mock('@expo-google-fonts/roboto', () => ({
  Roboto_400Regular: 'Roboto_400Regular',
  Roboto_500Medium: 'Roboto_500Medium',
  Roboto_700Bold: 'Roboto_700Bold',
}))

/**
 * A real QueryClient, so the real QueryClientProvider behaves normally; only the persistence
 * helpers are stubbed, since they reach storage this test has no business touching.
 */
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

/** Settles the newest boot first, so an older one resolves LAST and tries to publish its tuple. */
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

    /** The first tuple is still applying, so nothing capturable is on screen yet. */
    expect(childRendered(tree)).toBe(false)

    applyPendingLanguage()
    await flush()
    expect(childRendered(tree)).toBe(true)
    expect(childReadiness(tree)).toBe('ready')
    expect(changeLanguage).toHaveBeenCalledWith('en')
    expect(pendingSplashHides).toHaveLength(1)

    /** A capture re-run swaps the tuple. changeLanguage stays pending, so this render must gate. */
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

    /** Swap the tuple before the first boot finishes, so two boots are in flight at once. */
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

    /**
     * The CURRENT tuple settles first and the abandoned one settles last. Without the guard, that
     * late boot publishes 'en|dark' over 'pt-BR|light' and the tree never becomes ready again.
     */
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
