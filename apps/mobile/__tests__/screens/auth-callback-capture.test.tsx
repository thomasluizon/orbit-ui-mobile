import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AuthCallbackScreen from '@/app/auth-callback'
import { startMobileGoogleAuth } from '@/lib/google-auth'

const TestRenderer = require('react-test-renderer')
const renderedTrees: ReturnType<typeof TestRenderer.create>[] = []

function renderScreen(element: React.ReactElement) {
  const tree = TestRenderer.create(element)
  renderedTrees.push(tree)
  return tree
}

const mocks = vi.hoisted(() => ({
  retainEmptyCallback: true,
  replace: vi.fn(),
  login: vi.fn(),
  rawUrl: null as string | null,
  sessionCallbackUrl: null as string | null,
  isPending: false,
  useActualSession: false,
  coldStart: false,
  storedReturnUrl: null as string | null,
  complete: vi.fn(),
  signInWithOAuth: vi.fn(),
  openAuthSessionAsync: vi.fn(),
}))

vi.mock('@/components/auth/login-content', () => ({
  LoginContent: ({ callback }: { callback: { state: string } }) => React.createElement('View', { callbackState: callback.state }),
}))

vi.mock('expo-linking', () => ({ useLinkingURL: () => mocks.rawUrl }))

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ replace: mocks.replace }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('@orbit/shared/utils', async (importActual) => ({
  ...await importActual<typeof import('@orbit/shared/utils')>(),
  ApiClientError: class ApiClientError extends Error {},
  extractAuthBackendMessage: () => undefined,
  extractBackendRequestId: () => undefined,
  resolveAuthLoginErrorKey: () => 'auth.callbackError',
}))

vi.mock('@/lib/auth-flow', () => ({
  clearStoredReferralCode: vi.fn(),
  consumeStoredAuthReturnUrl: vi.fn(() => Promise.resolve(mocks.storedReturnUrl)),
  getSafeReturnUrl: (url: string | null) => url ?? '/',
  getStoredReferralCode: vi.fn(() => Promise.resolve(null)),
  isSafeReturnUrl: () => true,
  storeAuthReturnUrl: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/google-auth-callback', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/google-auth-callback')>()
  return {
    ...actual,
    clearPendingGoogleAuthSession: vi.fn(actual.clearPendingGoogleAuthSession),
    usePendingGoogleAuthSession: () => {
      const session = actual.usePendingGoogleAuthSession()
      return mocks.useActualSession
        ? (mocks.coldStart ? { callbackUrl: session.callbackUrl, isPending: false } : session)
        : { callbackUrl: mocks.sessionCallbackUrl, isPending: mocks.isPending }
    },
  }
})

vi.mock('@/lib/google-auth', async (importActual) => ({
  ...await importActual<typeof import('@/lib/google-auth')>(),
  completeGoogleAuthFromUrl: mocks.complete,
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({ auth: { signInWithOAuth: mocks.signInWithOAuth } }),
}))

vi.mock('expo-web-browser', () => ({
  openAuthSessionAsync: mocks.openAuthSessionAsync,
  WebBrowserResultType: { DISMISS: 'dismiss', CANCEL: 'cancel' },
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { login: typeof mocks.login }) => unknown) =>
    selector({ login: mocks.login }),
}))

vi.mock('@/lib/theme', () => ({
  createTokensV2: () => ({
    bg: '#000000',
    bgField: '#111111',
    fg1: '#ffffff',
    fg3: '#cccccc',
    hairline: '#333333',
    primary: '#7950f2',
  }),
}))

vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children }: { children?: React.ReactNode }) => children,
}))

vi.mock('@/lib/capture-mode', () => ({
  captureBuildEnabled: true,
  shouldRetainEmptyAuthCallback: () => mocks.retainEmptyCallback,
}))

describe('AuthCallbackScreen capture retention', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.retainEmptyCallback = true
    mocks.replace.mockClear()
    mocks.login.mockReset().mockResolvedValue(undefined)
    mocks.complete.mockReset().mockResolvedValue({ token: 'orbit-token', refreshToken: 'orbit-refresh',
      userId: 'account-a', name: 'A', email: 'a@example.com' })
    mocks.signInWithOAuth.mockReset().mockResolvedValue({ data: { url: 'https://accounts.google.com/o' }, error: null })
    mocks.openAuthSessionAsync.mockReset()
    mocks.rawUrl = null
    mocks.sessionCallbackUrl = null
    mocks.isPending = false
    mocks.useActualSession = false
    mocks.coldStart = false
    mocks.storedReturnUrl = null
  })

  afterEach(() => {
    TestRenderer.act(() => {
      for (const tree of renderedTrees.splice(0)) tree.unmount()
    })
    vi.useRealTimers()
  })

  it('keeps the payload-free callback active through the capture window', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = renderScreen(<AuthCallbackScreen />)
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(mocks.replace).not.toHaveBeenCalled()
    expect(JSON.stringify(tree!.toJSON())).toContain('pending')
  })

  it('keeps the production payload-free redirect behavior', async () => {
    mocks.retainEmptyCallback = false
    await TestRenderer.act(async () => {
      renderScreen(<AuthCallbackScreen />)
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(251)
    })

    expect(mocks.replace).toHaveBeenCalledWith('/login')
  })

  it('refuses a token-bearing deep link without a pending Google auth attempt', async () => {
    mocks.retainEmptyCallback = false
    mocks.rawUrl = 'https://app.useorbit.org/auth-callback#access_token=account-a&refresh_token=old-refresh'
    await TestRenderer.act(async () => {
      renderScreen(<AuthCallbackScreen />)
      await Promise.resolve()
    })

    expect(mocks.complete).not.toHaveBeenCalled()
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(251) })
    expect(mocks.replace).toHaveBeenCalledWith('/login')
  })

  it('accepts the callback returned by the pending Google auth session', async () => {
    mocks.sessionCallbackUrl = 'https://app.useorbit.org/auth-callback#access_token=fresh&refresh_token=fresh-refresh'
    await TestRenderer.act(async () => {
      renderScreen(<AuthCallbackScreen />)
      await Promise.resolve()
    })

    expect(mocks.complete).toHaveBeenCalledWith(mocks.sessionCallbackUrl, 'en', undefined)
    expect(mocks.login).toHaveBeenCalled()
  })

  it('refuses an unrelated deep link while this process has a pending Google auth attempt', async () => {
    mocks.isPending = true
    mocks.rawUrl = 'https://app.useorbit.org/auth-callback#access_token=fresh&refresh_token=fresh-refresh'
    await TestRenderer.act(async () => {
      renderScreen(<AuthCallbackScreen />)
      await Promise.resolve()
    })

    expect(mocks.complete).not.toHaveBeenCalled()
    expect(mocks.login).not.toHaveBeenCalled()
  })

  it.each([
    ['Google sign in', null, '/'],
    ['Google Calendar connection', '/calendar-sync', '/calendar-sync'],
  ])('exchanges a matching %s link after process recreation once', async (_flow, returnUrl, destination) => {
    const { markPendingGoogleAuthSession } = await import('@/lib/google-auth-callback')
    const attemptId = await markPendingGoogleAuthSession()
    mocks.rawUrl = `https://app.useorbit.org/auth-callback?authAttempt=${attemptId}#access_token=fresh&refresh_token=fresh-refresh`
    mocks.useActualSession = true
    mocks.coldStart = true
    mocks.storedReturnUrl = returnUrl

    vi.resetModules()
    const { default: RecreatedScreen } = await import('@/app/auth-callback')
    await TestRenderer.act(async () => {
      renderScreen(<RecreatedScreen />)
      await Promise.resolve()
    })

    expect(mocks.complete).toHaveBeenCalledWith(mocks.rawUrl, 'en', undefined)
    expect(mocks.login).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenCalledWith(destination)
  })
  it.each([
    ['Google sign in', undefined, null, '/'],
    ['Google Calendar connection', '/calendar-sync', '/calendar-sync', '/calendar-sync'],
  ])('keeps a same-process %s callback when the screen sees the link first', async (
    _flow, returnUrl, storedReturnUrl, destination,
  ) => {
    let finishBrowser!: (result: { type: string; url: string }) => void
    mocks.openAuthSessionAsync.mockImplementation(() => new Promise((resolve) => { finishBrowser = resolve }))
    mocks.useActualSession = true
    mocks.storedReturnUrl = storedReturnUrl
    const authResult = startMobileGoogleAuth({ returnUrl })
    await vi.waitFor(() => expect(mocks.openAuthSessionAsync).toHaveBeenCalledOnce())
    const redirectTo = mocks.openAuthSessionAsync.mock.calls[0]?.[1] as string
    const callbackUrl = `${redirectTo}#access_token=fresh&refresh_token=fresh-refresh`
    mocks.rawUrl = callbackUrl

    await TestRenderer.act(async () => {
      renderScreen(<AuthCallbackScreen />)
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      finishBrowser({ type: 'success', url: callbackUrl })
      await authResult
    })

    expect(await authResult).toEqual({ type: 'success', url: callbackUrl })
    expect(mocks.complete).toHaveBeenCalledWith(callbackUrl, 'en', undefined)
    expect(mocks.complete).toHaveBeenCalledOnce()
    expect(mocks.login).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenCalledWith(destination)
  })
})
