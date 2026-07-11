import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'

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

vi.mock('@/hooks/use-login-code-entry', () => ({
  useLoginCodeEntry: () => ({
    codeDigits: mocks.codeDigits,
    setCodeDigits: mocks.setCodeDigits,
    codeInputRefs: { current: [{ focus: mocks.focus }] },
    canResend: true,
    resendCountdown: 0,
    startResendCountdown: mocks.startResendCountdown,
    resetCodeDigits: mocks.resetCodeDigits,
    onCodeInput: vi.fn(),
    onCodeKeyPress: vi.fn(),
  }),
}))

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
    expect(mocks.showError).toHaveBeenCalledWith('auth.errors.offline')
  })

  it('rejects an invalid email without calling the API', async () => {
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('not-an-email'))
    await act(() => harness.current.sendCode())

    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(mocks.showError).toHaveBeenCalledWith('auth.errors.invalidEmail')
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
    expect(mocks.startResendCountdown).toHaveBeenCalledTimes(1)
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

    expect(mocks.showError).toHaveBeenCalled()
    expect(mocks.resetCodeDigits).toHaveBeenCalledTimes(1)
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
})
