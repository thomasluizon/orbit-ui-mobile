import React from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/lib/i18n'
import { Providers } from '@/lib/providers'
import { useAppToastStore } from '@/stores/app-toast-store'
import type { DroppedMutation } from '@/lib/offline-mutations'

const TestRenderer = require('react-test-renderer')

vi.unmock('react-i18next')

const mocks = vi.hoisted(() => {
  const mutationScope: { current: string | null } = { current: 'habits' }
  return {
    queue: { pendingCount: 1, isFlushing: true },
    droppedListener: undefined as ((mutation: DroppedMutation) => void) | undefined,
    initialize: vi.fn(() => Promise.resolve()),
    mutationScope,
  }
})

vi.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: vi.fn(() => Promise.resolve()),
  hideAsync: vi.fn(() => Promise.resolve()),
}))
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(() => Promise.resolve(null)),
  setItemAsync: vi.fn(() => Promise.resolve()),
  deleteItemAsync: vi.fn(() => Promise.resolve()),
}))
vi.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '1' }))
vi.mock('@tanstack/react-query', () => ({
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
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
vi.mock('@/lib/session-resume', () => ({ reconcileSessionOnForeground: vi.fn() }))
vi.mock('@/lib/query-client', () => ({
  queryClient: { clear: vi.fn() },
  restoreQueryCache: vi.fn(() => Promise.resolve()),
  persistQueryCache: vi.fn(() => Promise.resolve()),
  clearPersistedQueryCache: vi.fn(() => Promise.resolve()),
}))
vi.mock('@/lib/orbit-widget', () => ({ syncWidgetData: vi.fn(() => Promise.resolve()) }))
vi.mock('@/stores/auth-store', () => {
  const state = { initialize: mocks.initialize, isAuthenticated: true }
  const useAuthStore = (selector: (value: typeof state) => unknown) => selector(state)
  useAuthStore.getState = () => state
  return { useAuthStore }
})
vi.mock('@/lib/theme', () => ({
  getRuntimeTheme: () => ({ scheme: 'purple', themeMode: 'dark' }),
  createTokensV2: () => ({ bg: '#000' }),
}))
vi.mock('@/lib/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('../../lib/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => mocks.queue }))
vi.mock('@/lib/offline-mutations', () => ({
  getMutationScope: () => mocks.mutationScope.current,
  subscribeDroppedMutations: (listener: (mutation: DroppedMutation) => void) => {
    mocks.droppedListener = listener
    return () => { mocks.droppedListener = undefined }
  },
}))
vi.mock('@/stores/onboarding-draft-store', () => ({ useOnboardingDraftHydrated: () => true }))

function renderProviders() {
  return TestRenderer.create(
    <I18nextProvider i18n={i18n}>
      <Providers><span>ready</span></Providers>
    </I18nextProvider>,
  )
}

describe('offline terminal notice', () => {
  let tree: ReturnType<typeof TestRenderer.create>

  beforeEach(async () => {
    Object.assign(mocks.queue, { pendingCount: 1, isFlushing: true })
    mocks.droppedListener = undefined
    mocks.mutationScope.current = 'habits'
    mocks.initialize.mockClear()
    useAppToastStore.setState({ currentToast: null, queue: [] })
    await i18n.changeLanguage('pt-BR')
  })

  afterEach(() => {
    TestRenderer.act(() => tree.update(<></>))
  })

  it('renders one terminal message without following it with queued or synced feedback', async () => {
    await TestRenderer.act(async () => {
      tree = renderProviders()
      await Promise.resolve()
    })

    TestRenderer.act(() => {
      mocks.droppedListener?.({
        id: 'failed-1',
        type: 'updateHabit',
        lastError: 'Network request failed',
      })
    })
    Object.assign(mocks.queue, { pendingCount: 0, isFlushing: false })
    await TestRenderer.act(async () => {
      tree!.update(
        <I18nextProvider i18n={i18n}>
          <Providers><span>ready</span></Providers>
        </I18nextProvider>,
      )
      await Promise.resolve()
    })

    const messages = [
      useAppToastStore.getState().currentToast,
      ...useAppToastStore.getState().queue,
    ].filter((toast) => toast !== null)
    expect(messages).toEqual([expect.objectContaining({
      variant: 'error',
      message: 'A alteração em hábito não subiu e foi descartada. Tentar esta alteração de novo',
    })])
  })

  it('renders generic terminal feedback for a retired mutation type', async () => {
    mocks.mutationScope.current = null
    await TestRenderer.act(async () => {
      tree = renderProviders()
      await Promise.resolve()
    })

    TestRenderer.act(() => {
      mocks.droppedListener?.({
        id: 'failed-retired',
        type: 'retiredMutation',
        lastError: 'Unsupported mutation type',
      })
    })
    Object.assign(mocks.queue, { pendingCount: 0, isFlushing: false })
    await TestRenderer.act(async () => {
      tree!.update(
        <I18nextProvider i18n={i18n}>
          <Providers><span>ready</span></Providers>
        </I18nextProvider>,
      )
      await Promise.resolve()
    })

    const messages = [
      useAppToastStore.getState().currentToast,
      ...useAppToastStore.getState().queue,
    ].filter((toast) => toast !== null)
    expect(messages).toEqual([expect.objectContaining({
      variant: 'error',
      message: 'Uma alteração na fila não pôde ser sincronizada e foi descartada. Tentar esta alteração de novo',
    })])
  })
})
