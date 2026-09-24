import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AuthCallbackScreen from '@/app/auth-callback'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  retainEmptyCallback: true,
  replace: vi.fn(),
  login: vi.fn(),
  rawUrl: null as string | null,
  sessionCallbackUrl: null as string | null,
  isPending: false,
  complete: vi.fn(),
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

vi.mock('@orbit/shared/utils', () => ({
  ApiClientError: class ApiClientError extends Error {},
  extractAuthBackendMessage: () => undefined,
  extractBackendRequestId: () => undefined,
  resolveAuthLoginErrorKey: () => 'auth.callbackError',
}))

vi.mock('@/lib/auth-flow', () => ({
  clearStoredReferralCode: vi.fn(),
  consumeStoredAuthReturnUrl: vi.fn(() => Promise.resolve(null)),
  getSafeReturnUrl: () => '/',
  getStoredReferralCode: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@/lib/google-auth-callback', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/google-auth-callback')>()),
  clearPendingGoogleAuthSession: vi.fn(),
  usePendingGoogleAuthSession: () => ({ callbackUrl: mocks.sessionCallbackUrl, isPending: mocks.isPending }),
}))

vi.mock('@/lib/google-auth', () => ({ completeGoogleAuthFromUrl: mocks.complete }))

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
    mocks.rawUrl = null
    mocks.sessionCallbackUrl = null
    mocks.isPending = false
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the payload-free callback active through the capture window', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<AuthCallbackScreen />)
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
      TestRenderer.create(<AuthCallbackScreen />)
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
      TestRenderer.create(<AuthCallbackScreen />)
      await Promise.resolve()
    })

    expect(mocks.complete).not.toHaveBeenCalled()
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(251) })
    expect(mocks.replace).toHaveBeenCalledWith('/login')
  })

  it('accepts the callback returned by the pending Google auth session', async () => {
    mocks.sessionCallbackUrl = 'https://app.useorbit.org/auth-callback#access_token=fresh&refresh_token=fresh-refresh'
    await TestRenderer.act(async () => {
      TestRenderer.create(<AuthCallbackScreen />)
      await Promise.resolve()
    })

    expect(mocks.complete).toHaveBeenCalledWith(mocks.sessionCallbackUrl, 'en', undefined)
    expect(mocks.login).toHaveBeenCalled()
  })

  it('refuses an unrelated deep link while this process has a pending Google auth attempt', async () => {
    mocks.isPending = true
    mocks.rawUrl = 'https://app.useorbit.org/auth-callback#access_token=fresh&refresh_token=fresh-refresh'
    await TestRenderer.act(async () => {
      TestRenderer.create(<AuthCallbackScreen />)
      await Promise.resolve()
    })

    expect(mocks.complete).not.toHaveBeenCalled()
    expect(mocks.login).not.toHaveBeenCalled()
  })
})
