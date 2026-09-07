import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { createApiClientError } from '@orbit/shared/utils'

import { useLoginFlow } from '@/app/use-login-flow'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  isOnline: true,
  params: {},
  codeDigits: ['', '', '', '', '', ''],
  apiClient: vi.fn(),
  login: vi.fn(),
  showError: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  resetCodeDigits: vi.fn(),
  setCodeDigits: vi.fn(),
  startResendCountdown: vi.fn(),
  focus: vi.fn(),
  getStoredReferralCode: vi.fn(),
  getSafeReturnUrl: vi.fn(),
  consumeStoredAuthReturnUrl: vi.fn(),
  markReferralApplied: vi.fn(),
  clearStoredReferralCode: vi.fn(),
  startMobileGoogleAuth: vi.fn(),
}))

vi.mock('react-native', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-native')
  return { ...actual, Keyboard: { addListener: () => ({ remove: () => {} }) } }
})

vi.mock('@/lib/motion', () => ({
  toAnimatedEasing: (easing: unknown) => easing,
  usePrefersReducedMotion: () => true,
}))

vi.mock('@/lib/theme', () => ({ easings: { out: 'ease-out' } }))

vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { login: unknown }) => unknown) => selector({ login: mocks.login }),
}))

vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.isOnline }) }))

vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: mocks.showError }) }))

vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
  useLocalSearchParams: () => mocks.params,
}))

vi.mock('@/lib/auth-flow', () => ({
  clearStoredReferralCode: mocks.clearStoredReferralCode,
  consumeStoredAuthReturnUrl: mocks.consumeStoredAuthReturnUrl,
  getSafeReturnUrl: mocks.getSafeReturnUrl,
  getStoredReferralCode: mocks.getStoredReferralCode,
  isSafeReturnUrl: () => true,
  isValidReferralCode: () => false,
  isValidVerificationCode: () => false,
  markReferralApplied: mocks.markReferralApplied,
  storeAuthReturnUrl: vi.fn(),
  storeReferralCode: vi.fn(),
}))

vi.mock('@/lib/google-auth', () => ({ startMobileGoogleAuth: mocks.startMobileGoogleAuth }))

vi.mock('@/stores/onboarding-draft-store', () => ({
  useOnboardingDraftStore: (
    selector: (state: { onboardingLocallyDone: boolean; habits: unknown[] }) => unknown,
  ) => selector({ onboardingLocallyDone: false, habits: [] }),
}))

interface Harness {
  readonly current: ReturnType<typeof useLoginFlow>
}

async function renderLoginFlow(): Promise<Harness> {
  const holder: { current: ReturnType<typeof useLoginFlow> | null } = { current: null }

  function Probe() {
    holder.current = useLoginFlow()
    return null
  }

  await TestRenderer.act(async () => {
    TestRenderer.create(React.createElement(Probe))
    await Promise.resolve()
  })
  if (mocks.codeDigits.join('')) {
    await TestRenderer.act(() => holder.current?.setCodeDigits(mocks.codeDigits))
  }

  return {
    get current() {
      if (!holder.current) throw new Error('useLoginFlow did not render')
      return holder.current
    },
  }
}

async function act(action: () => void | Promise<void>): Promise<void> {
  await TestRenderer.act(async () => {
    await action()
  })
}

function firstApiCall(): [string, { body: string }] {
  const call = mocks.apiClient.mock.calls[0]
  if (!call) throw new Error('apiClient was not called')
  return call as [string, { body: string }]
}

function bodyOf(options: { body: string }): Record<string, unknown> {
  return JSON.parse(options.body)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isOnline = true
  mocks.params = {}
  mocks.codeDigits = ['', '', '', '', '', '']
  mocks.apiClient.mockResolvedValue({})
  mocks.login.mockResolvedValue(undefined)
  mocks.getStoredReferralCode.mockResolvedValue(undefined)
  mocks.consumeStoredAuthReturnUrl.mockResolvedValue(undefined)
  mocks.getSafeReturnUrl.mockImplementation((url?: string) => url ?? '/')
  mocks.startMobileGoogleAuth.mockResolvedValue({ type: 'cancel' })
})

describe('useLoginFlow (mobile)', () => {
  it('blocks sending a code while offline and surfaces the offline error', async () => {
    mocks.isOnline = false
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())

    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(mocks.showError).not.toHaveBeenCalled()
  })

  it('rejects an invalid email without calling the API', async () => {
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('not-an-email'))
    await act(() => harness.current.sendCode())

    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(harness.current).toMatchObject({ errorMessage: 'auth.errors.invalidEmail' })
    expect(mocks.showError).not.toHaveBeenCalled()
  })

  it('sends the code, advances to the code step, and starts the resend countdown', async () => {
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())

    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
    const [endpoint, options] = firstApiCall()
    expect(endpoint).toBe(API.auth.sendCode)
    expect(bodyOf(options)).toMatchObject({ email: 'user@test.com', language: 'en' })
    expect(harness.current.step).toBe('code')
    expect(harness.current.successMessage).toBe('auth.codeSent')
    expect(harness.current.resendCountdown).toBe(60)
  })

  it('verifies the code, logs in with the returned session, and redirects to the safe return url', async () => {
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    mocks.consumeStoredAuthReturnUrl.mockResolvedValue('/home')
    mocks.apiClient.mockResolvedValue({
      token: 'access-token',
      refreshToken: 'refresh-token',
      userId: 'user-1',
      name: 'Ada',
      email: 'user@test.com',
      wasReactivated: false,
    })
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.verifyCode())

    const [endpoint, options] = firstApiCall()
    expect(endpoint).toBe(API.auth.verifyCode)
    expect(bodyOf(options)).toMatchObject({ email: 'user@test.com', code: '123456', language: 'en' })
    expect(mocks.login).toHaveBeenCalledWith('access-token', 'refresh-token', {
      userId: 'user-1',
      name: 'Ada',
      email: 'user@test.com',
    })
    expect(mocks.replace).toHaveBeenCalledWith('/home')
  })

  it('reports the error and resets the code entry when verification fails', async () => {
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    mocks.apiClient.mockRejectedValue(new Error('invalid code'))
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.verifyCode())

    expect(harness.current.errorMessage).toBeTruthy()
    expect(mocks.showError).not.toHaveBeenCalled()
    expect(harness.current.codeDigits.join('')).toBe('123456')
    expect(mocks.login).not.toHaveBeenCalled()
  })

  it('gates submission on connectivity and code completeness', async () => {
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    const online = await renderLoginFlow()
    await act(() => online.current.setEmail('user@test.com'))

    expect(online.current.canSubmitEmail).toBe(true)
    expect(online.current.canSubmitCode).toBe(true)

    mocks.isOnline = false
    const offline = await renderLoginFlow()
    await act(() => offline.current.setEmail('user@test.com'))

    expect(offline.current.canSubmitEmail).toBe(false)
    expect(offline.current.canSubmitCode).toBe(false)
  })

  it('resends the code and restarts the countdown when online', async () => {
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.resendCode())

    const [endpoint, options] = firstApiCall()
    expect(endpoint).toBe(API.auth.sendCode)
    expect(bodyOf(options)).toMatchObject({ email: 'user@test.com', language: 'en' })
    expect(harness.current.successMessage).toBe('auth.codeResent')
    expect(harness.current.resendCountdown).toBe(60)
  })

  it('blocks resending while offline', async () => {
    mocks.isOnline = false
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.resendCode())

    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(mocks.showError).not.toHaveBeenCalled()
  })

  it('returns to the email step and clears code entry', async () => {
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())
    expect(harness.current.step).toBe('code')

    await act(() => harness.current.backToEmail())

    expect(harness.current.step).toBe('email')
    expect(harness.current.successMessage).toBeNull()
    expect(harness.current.codeDigits.join('')).toBe('')
  })

  it('shows the reactivation notice when a deleted account logs back in', async () => {
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    mocks.apiClient.mockResolvedValue({
      token: 'access-token',
      refreshToken: 'refresh-token',
      userId: 'user-1',
      name: 'Ada',
      email: 'user@test.com',
      wasReactivated: true,
    })
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.verifyCode())

    expect(harness.current.accountBack).toMatchObject({ wasReactivated: true })
    expect(mocks.replace).not.toHaveBeenCalled()
    await act(() => harness.current.continueAccount())
    expect(mocks.replace).toHaveBeenCalledWith('/')
  })

  it('applies a stored referral code on verification and hides the banner', async () => {
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    mocks.getStoredReferralCode.mockResolvedValue('REF123')
    mocks.apiClient.mockResolvedValue({
      token: 'access-token',
      refreshToken: 'refresh-token',
      userId: 'user-1',
      name: 'Ada',
      email: 'user@test.com',
      wasReactivated: false,
    })
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.verifyCode())

    const [, options] = firstApiCall()
    expect(bodyOf(options)).toMatchObject({ referralCode: 'REF123' })
    expect(mocks.markReferralApplied).toHaveBeenCalledTimes(1)
    expect(mocks.clearStoredReferralCode).toHaveBeenCalledTimes(1)
    expect(harness.current.showReferralBanner).toBe(false)
  })

  it('reflects a persisted referral code in the banner on mount', async () => {
    mocks.getStoredReferralCode.mockResolvedValue('REF999')
    const harness = await renderLoginFlow()

    expect(harness.current.showReferralBanner).toBe(true)
  })

  it('redirects to the auth callback after a successful Google sign-in', async () => {
    mocks.startMobileGoogleAuth.mockResolvedValue({ type: 'success', url: 'orbit://cb' })
    const harness = await renderLoginFlow()

    await act(() => harness.current.signInWithGoogle())

    expect(mocks.replace).toHaveBeenCalledWith('/auth-callback')
    expect(harness.current.isGoogleLoading).toBe(false)
  })

  it('stays put when the Google flow is dismissed', async () => {
    mocks.startMobileGoogleAuth.mockResolvedValue({ type: 'cancel' })
    const harness = await renderLoginFlow()

    await act(() => harness.current.signInWithGoogle())

    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('blocks Google sign-in while offline', async () => {
    mocks.isOnline = false
    const harness = await renderLoginFlow()

    await act(() => harness.current.signInWithGoogle())

    expect(mocks.startMobileGoogleAuth).not.toHaveBeenCalled()
    expect(mocks.showError).not.toHaveBeenCalled()
  })

  it('surfaces a Google sign-in failure', async () => {
    mocks.startMobileGoogleAuth.mockRejectedValue(new Error('oauth boom'))
    const harness = await renderLoginFlow()

    await act(() => harness.current.signInWithGoogle())

    expect(harness.current.errorMessage).toBeTruthy()
    expect(mocks.showError).not.toHaveBeenCalled()
    expect(harness.current.isGoogleLoading).toBe(false)
  })

  it('routes to the legal pages', async () => {
    const harness = await renderLoginFlow()

    await act(() => harness.current.openPrivacyPolicy())
    expect(mocks.push).toHaveBeenCalledWith('/about')

    await act(() => harness.current.openTerms())
    expect(mocks.push).toHaveBeenCalledWith('/about')
  })
})

describe('mobile auth state recovery', () => {
  it('lets the server decide retries after a reload with an unknown lock deadline', async () => {
    const harness = await renderLoginFlow()
    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())
    mocks.apiClient.mockRejectedValue(createApiClientError(400, { error: 'Too many attempts. Try again in 15 minutes' }, 'Request failed'))
    await act(() => harness.current.verifyCode('123456'))
    expect(harness.current.codeFailure).toBe('locked')
    const calls = mocks.apiClient.mock.calls.length
    await act(() => harness.current.verifyCode('123456'))
    expect(mocks.apiClient).toHaveBeenCalledTimes(calls + 1)
    mocks.apiClient.mockResolvedValue({ token: 'test-token', refreshToken: null, userId: 'user-id', name: 'Person', email: 'user@test.com', wasReactivated: false })
    await act(() => harness.current.verifyCode('123456'))
    expect(mocks.login).toHaveBeenCalledTimes(1)
  })
  it.each([429, 500, 503])('keeps one send failure and the address for HTTP %s', async (status) => {
    mocks.apiClient.mockRejectedValue(createApiClientError(status, null, 'Request failed'))
    const harness = await renderLoginFlow()
    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())
    expect(harness.current.errorKey).toBe('auth.errors.sendFailed')
    expect(harness.current.email).toBe('user@test.com')
    expect(harness.current.step).toBe('email')
    expect(mocks.showError).not.toHaveBeenCalled()
  })

  it('keeps the same send failure after a network exception', async () => {
    mocks.apiClient.mockRejectedValue(new TypeError('network disconnected'))
    const harness = await renderLoginFlow()
    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())
    expect(harness.current.errorKey).toBe('auth.errors.sendFailed')
  })

  it('deduplicates the sixth digit and the verify button', async () => {
    const harness = await renderLoginFlow()
    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())
    mocks.apiClient.mockResolvedValue({ token: 'test-token', refreshToken: null, userId: 'user-id', name: 'Person', email: 'user@test.com' })
    mocks.apiClient.mockClear()
    await act(async () => {
      harness.current.onCodeChange('123456')
      await harness.current.verifyCode('123456')
    })
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
  })

  it('locks after three wrong codes and permits a different email immediately', async () => {
    const harness = await renderLoginFlow()
    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())
    mocks.apiClient.mockRejectedValue(createApiClientError(400, { error: 'Invalid verification code' }, 'Request failed'))
    for (const code of ['111111', '222222', '333333']) await act(() => harness.current.onCodeChange(code))
    expect(harness.current.codeFailure).toBe('locked')
    expect(harness.current.lockCountdown).toBe(900)
    const calls = mocks.apiClient.mock.calls.length
    await act(async () => { await harness.current.verifyCode('444444'); await harness.current.resendCode() })
    expect(mocks.apiClient).toHaveBeenCalledTimes(calls)
    await act(() => harness.current.backToEmail())
    await act(() => harness.current.setEmail('other@test.com'))
    mocks.apiClient.mockResolvedValue({})
    await act(() => harness.current.sendCode())
    expect(harness.current.codeFailure).toBeNull()
    expect(harness.current.step).toBe('code')
    await act(() => harness.current.backToEmail())
    await act(() => harness.current.setEmail('USER@test.com'))
    const before = mocks.apiClient.mock.calls.length
    await act(() => harness.current.sendCode())
    expect(harness.current.codeFailure).toBe('locked')
    expect(mocks.apiClient).toHaveBeenCalledTimes(before)
  })

  it('lets an expired code be resent even inside the local resend countdown', async () => {
    const harness = await renderLoginFlow()
    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())
    mocks.apiClient.mockRejectedValue(createApiClientError(400, { error: 'Verification code expired or not found' }, 'Request failed'))
    await act(() => harness.current.verifyCode('123456'))
    expect(harness.current.codeFailure).toBe('expired')
    mocks.apiClient.mockResolvedValue({})
    await act(() => harness.current.resendCode())
    expect(harness.current.codeFailure).toBeNull()
    expect(harness.current.codeDigits.join('')).toBe('')
    expect(harness.current.successMessage).toBe('auth.codeResent')
  })
})
