import React from 'react'
import { I18nextProvider } from 'react-i18next'
import { i18n } from '@/lib/i18n'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { googleCodeAuthResponseSchema } from '@orbit/shared/types/auth'
import { DEFAULT_CONFIG } from '@orbit/shared/types/config'
import { AUTH_BACKEND_ERROR_MAP } from '@orbit/shared/utils'
import { API } from '@orbit/shared/api'
import AuthCallbackScreen from '@/app/auth-callback'
import { CalendarImportContent } from '@/components/calendar-sync/calendar-import-content'
import { useLoginFlow } from '@/app/use-login-flow'
import { useConfig } from '@/hooks/use-config'
import { apiClient } from '@/lib/api-client'
import * as authSession from '@/stores/auth-store'
import { getSessionGeneration, useAuthStore } from '@/stores/auth-store'
import { reconcileSessionOnForeground } from '@/lib/session-resume'
import { clearAllTokens, getToken, setToken } from '@/lib/secure-store'
import { createAuthReturnUrlAttempt, getStoredReferralCode } from '@/lib/auth-flow'
import {
  AUTH_CALLBACK_URL, clearPendingGoogleAuthSession, getPendingGoogleAuthVerifier,
  markPendingGoogleAuthSession, setPendingGoogleAuthCallbackUrl,
} from '@/lib/google-auth-callback'

vi.unmock('react-i18next')

const TestRenderer = require('react-test-renderer')
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), replace: vi.fn(), showError: vi.fn(), openAuthSession: vi.fn(),
  clearCache: vi.fn(async () => {}), resetQueries: vi.fn(async () => {}),
  resetAccount: vi.fn(async () => {}), clearOffline: vi.fn(async () => {}),
  referral: vi.fn(),
}))

vi.mock('@react-native-async-storage/async-storage', () => {
  const entries = new Map<string, string>()
  return { default: {
    getItem: (key: string) => Promise.resolve(entries.get(key) ?? null),
    setItem: (key: string, value: string) => { entries.set(key, value); return Promise.resolve() },
    removeItem: (key: string) => { entries.delete(key); return Promise.resolve() },
    clear: () => { entries.clear(); return Promise.resolve() },
  } }
})
vi.mock('expo-router', () => ({
  router: { replace: mocks.replace },
  useRouter: () => ({ replace: mocks.replace, push: vi.fn(), canGoBack: () => false }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}))
vi.mock('expo-linking', () => ({ useLinkingURL: () => null }))
vi.mock('expo-web-browser', () => ({
  openAuthSessionAsync: mocks.openAuthSession,
  WebBrowserResultType: { CANCEL: 'cancel', DISMISS: 'dismiss' },
}))
vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: () => Promise.resolve(new Uint8Array(32).fill(1)),
  digestStringAsync: (_algorithm: string, value: string) => Promise.resolve(createHash('sha256').update(value).digest('base64')),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, CryptoEncoding: { BASE64: 'base64' },
}))
vi.mock('@/lib/auth-flow', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/auth-flow')>(), getStoredReferralCode: mocks.referral,
}))
vi.mock('@/lib/app-version', () => ({ buildAppVersionHeaders: () => ({}) }))
vi.mock('@/lib/orbit-widget', () => ({ clearWidgetToken: vi.fn(async () => {}), saveWidgetToken: vi.fn(async () => {}) }))
vi.mock('@/lib/offline-queue', () => ({ clear: vi.fn(), retainAccount: vi.fn() }))
vi.mock('@/lib/offline-mutations', () => ({ cancelScheduledFlush: vi.fn(), resumeOfflineReplay: vi.fn() }))
vi.mock('@/lib/offline-state', () => ({ clearOfflineState: mocks.clearOffline }))
vi.mock('@/lib/account-scoped-state', () => ({ startAccountScopedSession: mocks.resetAccount }))
vi.mock('@/lib/query-client', async () => ({
  queryClient: new (await import('@tanstack/react-query')).QueryClient(),
  clearPersistedQueryCache: mocks.clearCache, setQueryCacheScope: vi.fn(async () => {}),
}))
vi.mock('@orbit/shared/query', async (importOriginal) => ({
  ...await importOriginal<typeof import('@orbit/shared/query')>(), resetAccountQueries: mocks.resetQueries,
}))
vi.mock('@/stores/chat-store', () => ({ useChatStore: { getState: () => ({ resetAccountScopedChat: vi.fn(async () => {}) }) } }))
vi.mock('@/stores/review-reminder-store', () => ({ useReviewReminderStore: { getState: () => ({ setAccountScope: vi.fn() }) } }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: mocks.showError }) }))
vi.mock('@/components/auth/turnstile-widget', () => ({ TurnstileWidget: () => null }))
vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) =>
    React.createElement('PillButton', { onClick }, children),
}))
vi.mock('@/lib/motion', () => ({ toAnimatedEasing: (value: unknown) => value, usePrefersReducedMotion: () => true }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { hasProAccess: true }, isLoading: false }) }))
vi.mock('@/hooks/use-habits', () => ({ useBulkCreateHabits: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/hooks/use-calendar-events', () => ({ useCalendarEvents: () => ({ data: { status: 'not-connected' }, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-calendar-auto-sync', () => ({
  useCalendarAutoSyncState: () => ({ data: { hasGoogleConnection: false }, isLoading: false }),
  useCalendarSyncSuggestions: () => ({ data: [] }),
  useSetCalendarAutoSync: () => ({ mutate: vi.fn() }),
  useRunCalendarSyncNow: () => ({ mutate: vi.fn() }),
  useDismissCalendarSuggestion: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/use-calendars', () => ({
  useCalendars: () => ({ data: [], isLoading: false }), useSetSelectedCalendars: () => ({ mutate: vi.fn() }),
}))

const profile = createMockProfile()
const success = googleCodeAuthResponseSchema.parse({
  token: 'google-token', refreshToken: 'google-refresh', userId: 'user-1',
  name: profile.name, email: profile.email, wasReactivated: false,
})
const renderers: ReturnType<typeof TestRenderer.create>[] = []
let queryClient: QueryClient

async function mount(children: React.ReactNode) {
  let renderer!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    renderer = TestRenderer.create(<I18nextProvider i18n={i18n}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></I18nextProvider>)
    renderers.push(renderer)
  })
  return renderer
}

function requestCount(path: string): number {
  return mocks.fetch.mock.calls.filter(([url]) => new URL(url).pathname === path).length
}

function expectNoTeardown() {
  expect(mocks.clearCache).not.toHaveBeenCalled()
  expect(mocks.resetQueries).not.toHaveBeenCalled()
  expect(mocks.resetAccount).not.toHaveBeenCalled()
  expect(mocks.clearOffline).not.toHaveBeenCalled()
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mocks.fetch)
  vi.stubEnv('EXPO_PUBLIC_GOOGLE_CLIENT_ID', 'test-client')
  vi.stubEnv('EXPO_PUBLIC_TURNSTILE_SITE_KEY', '')
  await clearAllTokens()
  await AsyncStorage.clear()
  await clearPendingGoogleAuthSession()
  useAuthStore.setState({ sessionPhase: 'signed-out', isAuthenticated: false, isLoading: false, user: null, expiresAt: null })
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  mocks.referral.mockResolvedValue(null)
  mocks.fetch.mockImplementation((url: string) => {
    const path = new URL(url).pathname
    if (path === API.config.get) return Promise.resolve(new Response(null, { status: 401 }))
    if (path === API.auth.verifyCode) {
      const error = Object.entries(AUTH_BACKEND_ERROR_MAP).find(([, key]) => key === 'auth.errors.invalidCode')?.[0]
      return Promise.resolve(new Response(JSON.stringify({ error }), { status: 401 }))
    }
    if (path === API.auth.googleCode) return Promise.resolve(new Response(JSON.stringify(success)))
    if (path === API.profile.get) return Promise.resolve(new Response(JSON.stringify(profile)))
    throw new Error(`Unexpected request: ${path}`)
  })
})

afterEach(async () => {
  await TestRenderer.act(() => { renderers.splice(0).forEach((renderer) => renderer.unmount()) })
  queryClient.clear()
  await clearPendingGoogleAuthSession()
  await clearAllTokens()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it.each([1, 2])('completes one Google exchange after %i foreground checks while the referral read is pending', async (foregroundEvents) => {
  let releaseReferral!: (code: null) => void
  mocks.referral.mockReturnValue(new Promise<null>((resolve) => { releaseReferral = resolve }))
  const attemptId = createAuthReturnUrlAttempt()
  await markPendingGoogleAuthSession(attemptId, 'verifier', 'state')
  expect(setPendingGoogleAuthCallbackUrl(`${AUTH_CALLBACK_URL}?code=one-use&state=state`, attemptId)).toBe(true)
  const generation = getSessionGeneration()
  await mount(<><AuthCallbackScreen /><AuthCallbackScreen /></>)
  expect(getStoredReferralCode).toHaveBeenCalledTimes(3)
  expect(requestCount(API.auth.googleCode)).toBe(0)

  await TestRenderer.act(async () => {
    for (let index = 0; index < foregroundEvents; index += 1) await reconcileSessionOnForeground()
    releaseReferral(null)
  })

  expect(requestCount(API.auth.googleCode)).toBe(1)
  expect(useAuthStore.getState()).toMatchObject({ sessionPhase: 'signed-in', user: { userId: success.userId } })
  await expect(getToken()).resolves.toBe(success.token)
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/')
  expect(getSessionGeneration().epoch).toBe(generation.epoch + 1)
})

it('keeps the config defaults and onboarding destination after an anonymous config 401', async () => {
  let config: ReturnType<typeof useConfig> | undefined
  function ConfigProbe() { config = useConfig(); return null }
  const generation = getSessionGeneration()
  await mount(<ConfigProbe />)
  await vi.waitFor(() => expect(config?.isPlaceholderData).toBe(false))

  expect(config?.config).toEqual(DEFAULT_CONFIG)
  expect(requestCount(API.config.get)).toBe(1)
  expect(requestCount(API.auth.refresh)).toBe(0)
  expect(mocks.replace).not.toHaveBeenCalled()
  expect(getSessionGeneration()).toEqual(generation)
  expectNoTeardown()
})

it('survives both the anonymous config 401 and foreground check during the same Google callback', async () => {
  let releaseReferral!: (code: null) => void
  mocks.referral.mockReturnValue(new Promise<null>((resolve) => { releaseReferral = resolve }))
  const attemptId = createAuthReturnUrlAttempt()
  await markPendingGoogleAuthSession(attemptId, 'verifier', 'state')
  setPendingGoogleAuthCallbackUrl(`${AUTH_CALLBACK_URL}?code=one-use&state=state`, attemptId)
  function ConfigProbe() { useConfig(); return null }
  await mount(<><ConfigProbe /><AuthCallbackScreen /></>)
  await vi.waitFor(() => expect(queryClient.getQueryCache().getAll()[0]?.state.status).toBe('success'))
  await TestRenderer.act(async () => {
    await reconcileSessionOnForeground()
    releaseReferral(null)
  })

  expect(requestCount(API.auth.googleCode)).toBe(1)
  expect(requestCount(API.auth.refresh)).toBe(0)
  expect(useAuthStore.getState().isAuthenticated).toBe(true)
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/')
})

it('reports a wrong email code as invalid without recovery or navigation', async () => {
  let flow!: ReturnType<typeof useLoginFlow>
  function LoginProbe() { flow = useLoginFlow(); return null }
  const generation = getSessionGeneration()
  await mount(<LoginProbe />)
  await TestRenderer.act(() => { flow.setEmail('person@example.com') })
  await TestRenderer.act(() => { flow.onCodeChange('123456') })

  expect(requestCount(API.auth.verifyCode)).toBe(1)
  expect(flow.errorKey).toBe('auth.errors.invalidCode')
  expect(flow.codeDigits).toEqual(['1', '2', '3', '4', '5', '6'])
  expect(flow.codeFailure).toBe('wrong')
  expect(requestCount(API.auth.refresh)).toBe(0)
  expect(mocks.replace).not.toHaveBeenCalled()
  expect(getSessionGeneration()).toEqual(generation)
  expectNoTeardown()
})

it('connects Calendar through force consent with a foreground check before the exchange', async () => {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, sub: success.userId })).toString('base64url')
  await setToken(`header.${payload}.signature`)
  useAuthStore.setState({ sessionPhase: 'signed-in', isAuthenticated: true, user: { userId: success.userId, name: success.name, email: success.email } })
  let releaseReferral!: (code: null) => void
  mocks.referral.mockReturnValue(new Promise<null>((resolve) => { releaseReferral = resolve }))
  mocks.openAuthSession.mockImplementation((url: string, redirect: string) => {
    const authorize = new URL(url)
    expect(authorize.searchParams.get('prompt')).toBe('consent')
    expect(authorize.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/calendar.readonly')
    return Promise.resolve({ type: 'success', url: `${redirect}?code=calendar-code&state=${authorize.searchParams.get('state')}` })
  })
  const screen = await mount(<CalendarImportContent reviewMode={false} initialEventId={null} onClose={() => {}} onGoToHabits={() => {}} actionRef={null} onActionStateChange={() => {}} />)
  const connect = screen.root.findAll((node: { props: Record<string, unknown> }) => node.props.children === i18n.t('auth.signInWithGoogle') && typeof node.props.onClick === 'function')[0]
  expect(connect).toBeDefined()
  await TestRenderer.act(() => { connect.props.onClick() })
  expect(mocks.openAuthSession).toHaveBeenCalledOnce()
  await mount(<><AuthCallbackScreen /><AuthCallbackScreen /></>)
  expect(getStoredReferralCode).toHaveBeenCalledTimes(3)
  await TestRenderer.act(async () => {
    await reconcileSessionOnForeground()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    releaseReferral(null)
  })

  expect(requestCount(API.auth.googleCode)).toBe(1)
  expect(useAuthStore.getState().isAuthenticated).toBe(true)
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/calendar?import=1')
  await expect(getToken()).resolves.toBe(success.token)
})

it('preserves the pending verifier when an anonymous request rejects with 401', async () => {
  const generation = getSessionGeneration()
  await markPendingGoogleAuthSession(createAuthReturnUrlAttempt(), 'verifier', 'state')
  await expect(apiClient(API.config.get)).rejects.toMatchObject({ status: 401 })
  expect(getPendingGoogleAuthVerifier('state')).toBe('verifier')
  expect(getSessionGeneration()).toEqual(generation)
  expectNoTeardown()
})

it.each(['sign-in', 'Calendar'])('retries %s on a mounted callback with one POST per attempt', async (purpose) => {
  const generation = getSessionGeneration()
  let exchanges = 0
  mocks.fetch.mockImplementation((url: string) => {
    const path = new URL(url).pathname
    if (path === API.auth.googleCode) {
      exchanges += 1
      return Promise.resolve(exchanges === 1
        ? new Response(JSON.stringify({ error: 'Exchange failed' }), { status: 500 })
        : new Response(JSON.stringify(success)))
    }
    if (path === API.profile.get) return Promise.resolve(new Response(JSON.stringify(profile)))
    throw new Error(`Unexpected request: ${path}`)
  })
  mocks.openAuthSession.mockImplementation((url: string, redirect: string) => {
    const authorize = new URL(url)
    if (purpose === 'Calendar') {
      expect(authorize.searchParams.get('prompt')).toBe('consent')
      expect(authorize.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/calendar.readonly')
    }
    const callbackUrl = `${redirect}?code=attempt-${mocks.openAuthSession.mock.calls.length}&state=${authorize.searchParams.get('state')}`
    expect(setPendingGoogleAuthCallbackUrl(callbackUrl)).toBe(true)
    return Promise.resolve({ type: 'success', url: callbackUrl })
  })
  let flow!: ReturnType<typeof useLoginFlow>
  function LoginProbe() { flow = useLoginFlow(); return null }
  const source = await mount(purpose === 'Calendar' ? <CalendarImportContent reviewMode={false} initialEventId={null} onClose={() => {}} onGoToHabits={() => {}} actionRef={null} onActionStateChange={() => {}} /> : <LoginProbe />)
  const connect = () => {
    if (purpose === 'sign-in') return flow.signInWithGoogle()
    const button = source.root.findAll((node: { props: Record<string, unknown> }) =>
      node.props.children === i18n.t('auth.signInWithGoogle') && typeof node.props.onClick === 'function',
    )[0]
    return button.props.onClick()
  }
  await TestRenderer.act(connect)
  await mount(<><AuthCallbackScreen /><AuthCallbackScreen /></>)
  expect(requestCount(API.auth.googleCode)).toBe(1)
  expect(useAuthStore.getState().isAuthenticated).toBe(false)
  expect(mocks.replace).not.toHaveBeenCalled()

  await TestRenderer.act(connect)

  expect(requestCount(API.auth.googleCode)).toBe(2)
  const exchangeRequests = mocks.fetch.mock.calls.filter(([url]) => new URL(url).pathname === API.auth.googleCode)
  expect(exchangeRequests.map(([, options]) => options.method)).toEqual(['POST', 'POST'])
  expect(exchangeRequests.map(([, options]) => JSON.parse(options.body).code)).toEqual(['attempt-1', 'attempt-2'])
  expect(useAuthStore.getState()).toMatchObject({ sessionPhase: 'signed-in', user: { userId: success.userId } })
  expect(getSessionGeneration().epoch).toBe(generation.epoch + 1)
  expect(mocks.replace).toHaveBeenLastCalledWith(purpose === 'Calendar' ? '/calendar?import=1' : '/')
  await expect(getToken()).resolves.toBe(success.token)
})

it('rejects three parallel anonymous 401s without refreshing or tearing down the session', async () => {
  const refresh = vi.spyOn(authSession, 'refreshSession')
  const generation = getSessionGeneration()
  const outcomes = await Promise.allSettled(Array.from({ length: 3 }, () => apiClient(API.config.get)))

  expect(outcomes).toEqual(Array.from({ length: 3 }, () => ({
    status: 'rejected', reason: expect.objectContaining({ status: 401 }),
  })))
  expect(refresh).not.toHaveBeenCalled()
  expect(requestCount(API.auth.refresh)).toBe(0)
  expect(mocks.replace).not.toHaveBeenCalled()
  expect(getSessionGeneration()).toEqual(generation)
  expectNoTeardown()
})
