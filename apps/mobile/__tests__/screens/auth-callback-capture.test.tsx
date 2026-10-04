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
  sessionReturnUrlAttemptId: null as string | null,
  isPending: false,
  useActualSession: false,
  coldStart: false,
  storedReturnUrl: null as string | null,
  complete: vi.fn(),
  openAuthSessionAsync: vi.fn(),
  getSecureItem: vi.fn(),
  secureStore: new Map<string, string>(),
}))

vi.mock('@/components/auth/login-content', () => ({
  LoginContent: ({ callback }: { callback: { state: string } }) => React.createElement('View', { callbackState: callback.state }),
}))

vi.mock('expo-linking', () => ({ useLinkingURL: () => mocks.rawUrl }))

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ replace: mocks.replace }),
}))

vi.mock('@/lib/i18n', () => ({ i18n: { language: 'en' } }))
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

vi.mock('@/lib/auth-flow', async (importActual) => ({
  ...await importActual<typeof import('@/lib/auth-flow')>(),
  clearStoredReferralCode: vi.fn(),
  consumeStoredAuthReturnUrl: vi.fn(() => Promise.resolve(mocks.storedReturnUrl)),
  getStoredAuthReturnUrl: vi.fn(() => Promise.resolve(mocks.storedReturnUrl)),
  getStoredReferralCode: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@/lib/google-auth-callback', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/google-auth-callback')>()
  return {
    ...actual,
    clearPendingGoogleAuthSession: vi.fn(actual.clearPendingGoogleAuthSession),
    usePendingGoogleAuthSession: () => {
      const session = actual.usePendingGoogleAuthSession()
      if (mocks.useActualSession) {
        return mocks.coldStart
          ? { callbackUrl: session.callbackUrl, isPending: false,
            returnUrlAttemptId: session.returnUrlAttemptId }
          : session
      }
      return { callbackUrl: mocks.sessionCallbackUrl, isPending: mocks.isPending,
        returnUrlAttemptId: mocks.sessionReturnUrlAttemptId }
    },
  }
})

vi.mock('@/lib/google-auth', async (importActual) => ({
  ...await importActual<typeof import('@/lib/google-auth')>(),
  completeGoogleAuthFromUrl: mocks.complete,
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: mocks.getSecureItem,
  setItemAsync: (key: string, value: string) => { mocks.secureStore.set(key, value); return Promise.resolve() },
  deleteItemAsync: (key: string) => { mocks.secureStore.delete(key); return Promise.resolve() },
}))

vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: () => Promise.resolve(new Uint8Array(32).fill(1)),
  digestStringAsync: () => Promise.resolve('challenge='),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
}))

vi.mock('expo-web-browser', () => ({
  openAuthSessionAsync: mocks.openAuthSessionAsync,
  WebBrowserResultType: { DISMISS: 'dismiss', CANCEL: 'cancel' },
}))

vi.mock('@/stores/auth-store', () => ({
  getSessionGeneration: () => ({ epoch: 0, credentialVersion: 0 }),
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
  beforeEach(async () => {
    const { clearPendingGoogleAuthSession } = await import('@/lib/google-auth-callback')
    await clearPendingGoogleAuthSession()
    vi.useFakeTimers()
    mocks.retainEmptyCallback = true
    mocks.replace.mockClear()
    mocks.login.mockReset().mockResolvedValue(() => true)
    mocks.complete.mockReset().mockResolvedValue({ token: 'orbit-token', refreshToken: 'orbit-refresh',
      userId: 'account-a', name: 'A', email: 'a@example.com' })
    mocks.openAuthSessionAsync.mockReset()
    mocks.secureStore.clear()
    mocks.getSecureItem.mockReset().mockImplementation((key: string) => Promise.resolve(mocks.secureStore.get(key) ?? null))
    vi.stubEnv('EXPO_PUBLIC_GOOGLE_CLIENT_ID', 'client-id')
    mocks.rawUrl = null
    mocks.sessionCallbackUrl = null
    mocks.sessionReturnUrlAttemptId = null
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
    vi.unstubAllEnvs()
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

  it('refuses a code-bearing deep link without a pending Google auth attempt', async () => {
    mocks.retainEmptyCallback = false
    mocks.rawUrl = 'https://app.useorbit.org/auth-callback?code=account-a&state=unknown'
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = renderScreen(<AuthCallbackScreen />)
      await Promise.resolve()
    })

    expect(mocks.complete).not.toHaveBeenCalled()
    expect(JSON.stringify(tree!.toJSON())).toContain('failed')
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('shows the callback error without storing a session when code exchange fails', async () => {
    const { createAuthReturnUrlAttempt } = await import('@/lib/auth-flow')
    mocks.sessionReturnUrlAttemptId = createAuthReturnUrlAttempt()
    mocks.sessionCallbackUrl = 'https://app.useorbit.org/auth-callback?code=fresh&state=expected'
    const { markPendingGoogleAuthSession, setPendingGoogleAuthCallbackUrl } = await import('@/lib/google-auth-callback')
    await markPendingGoogleAuthSession(mocks.sessionReturnUrlAttemptId, 'verifier', 'expected')
    setPendingGoogleAuthCallbackUrl(mocks.sessionCallbackUrl, mocks.sessionReturnUrlAttemptId)
    mocks.complete.mockRejectedValue(new Error('API rejected the code'))
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = renderScreen(<AuthCallbackScreen />)
      await Promise.resolve()
    })
    expect(mocks.login).not.toHaveBeenCalled()
    expect(JSON.stringify(tree!.toJSON())).toContain('failed')
  })

  it('accepts the callback returned by the pending Google auth session', async () => {
    const { createAuthReturnUrlAttempt } = await import('@/lib/auth-flow')
    mocks.sessionReturnUrlAttemptId = createAuthReturnUrlAttempt()
    mocks.sessionCallbackUrl = 'https://app.useorbit.org/auth-callback?code=fresh&state=expected'
    const { markPendingGoogleAuthSession, setPendingGoogleAuthCallbackUrl } = await import('@/lib/google-auth-callback')
    await markPendingGoogleAuthSession(mocks.sessionReturnUrlAttemptId, 'verifier', 'expected')
    setPendingGoogleAuthCallbackUrl(mocks.sessionCallbackUrl, mocks.sessionReturnUrlAttemptId)
    await TestRenderer.act(async () => {
      renderScreen(<AuthCallbackScreen />)
      await Promise.resolve()
    })

    expect(mocks.complete).toHaveBeenCalledWith(mocks.sessionCallbackUrl, 'en', undefined)
    expect(mocks.login).toHaveBeenCalled()
  })

  it('refuses an unrelated deep link while this process has a pending Google auth attempt', async () => {
    mocks.isPending = true
    mocks.rawUrl = 'https://app.useorbit.org/auth-callback?code=fresh&state=expected'
    await TestRenderer.act(async () => {
      renderScreen(<AuthCallbackScreen />)
      await Promise.resolve()
    })

    expect(mocks.complete).not.toHaveBeenCalled()
    expect(mocks.login).not.toHaveBeenCalled()
  })

  it('keeps one recovered attempt when two cold-start screens finish storage reads at different times', async () => {
    const { markPendingGoogleAuthSession, clearPendingGoogleAuthSession } = await import('@/lib/google-auth-callback')
    const { createAuthReturnUrlAttempt } = await import('@/lib/auth-flow')
    await markPendingGoogleAuthSession(createAuthReturnUrlAttempt(), 'verifier', 'expected')
    const savedAttempt = new Map(mocks.secureStore)
    await clearPendingGoogleAuthSession()
    for (const [key, value] of savedAttempt) mocks.secureStore.set(key, value)
    mocks.rawUrl = 'https://app.useorbit.org/auth-callback?code=fresh&state=expected'
    mocks.useActualSession = true
    mocks.storedReturnUrl = '/calendar?import=1'
    const reads: (() => void)[] = []
    mocks.getSecureItem.mockImplementation((key: string) => {
      const saved = mocks.secureStore.get(key) ?? null
      return new Promise<string | null>((resolve) => { reads.push(() => resolve(saved)) })
    })
    let finishExchange!: () => void
    mocks.complete.mockImplementation(() => new Promise((resolve) => {
      finishExchange = () => resolve({ token: 'orbit-token', refreshToken: 'orbit-refresh',
        userId: 'account-a', name: 'A', email: 'a@example.com' })
    }))
    await TestRenderer.act(async () => {
      renderScreen(<AuthCallbackScreen />)
      renderScreen(<AuthCallbackScreen />)
      await Promise.resolve()
    })
    expect(reads).toHaveLength(2)
    await TestRenderer.act(async () => { reads[0]!(); await Promise.resolve() })
    expect(mocks.complete).toHaveBeenCalledOnce()
    await TestRenderer.act(async () => { reads[1]!(); await Promise.resolve() })
    await TestRenderer.act(async () => { finishExchange(); await Promise.resolve() })
    expect(mocks.complete).toHaveBeenCalledOnce()
    expect(mocks.login).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/calendar?import=1')
  })

  it.each([
    ['Google sign in', null, '/(tabs)'],
    ['Google Calendar connection', '/calendar?import=1', '/calendar?import=1'],
  ])('exchanges a matching %s link after process recreation once', async (_flow, returnUrl, destination) => {
    const { markPendingGoogleAuthSession } = await import('@/lib/google-auth-callback')
    const { createAuthReturnUrlAttempt } = await import('@/lib/auth-flow')
    const attemptId = createAuthReturnUrlAttempt()
    await markPendingGoogleAuthSession(attemptId, 'verifier', 'expected')
    mocks.rawUrl = 'https://app.useorbit.org/auth-callback?code=fresh&state=expected'
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
    ['Google sign in', undefined, null, '/(tabs)'],
    ['Google Calendar connection', '/calendar?import=1', '/calendar?import=1', '/calendar?import=1'],
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
    const authorizeUrl = mocks.openAuthSessionAsync.mock.calls[0]?.[0] as string
    const callbackUrl = `${redirectTo}?code=fresh&state=${new URL(authorizeUrl).searchParams.get('state')}`
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
