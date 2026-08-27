import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AuthCallbackScreen from '@/app/auth-callback'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  retainEmptyCallback: true,
  replace: vi.fn(),
  login: vi.fn(),
}))

vi.mock('expo-linking', () => ({ useLinkingURL: () => null }))

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
  markReferralApplied: vi.fn(),
}))

vi.mock('@/lib/google-auth-callback', () => ({
  AUTH_CALLBACK_URL: 'https://app.useorbit.org/auth-callback',
  clearPendingGoogleAuthSession: vi.fn(),
  extractGoogleAuthParams: vi.fn(),
  resolveGoogleAuthCallbackUrl: () => null,
  usePendingGoogleAuthSession: () => ({ callbackUrl: null, isPending: false }),
}))

vi.mock('@/lib/google-auth', () => ({ completeGoogleAuthFromUrl: vi.fn() }))

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

vi.mock('@/components/ui/gradient-top', () => ({ GradientTop: () => null }))
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
    expect(JSON.stringify(tree!.toJSON())).toContain('auth.signingIn')
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
})
