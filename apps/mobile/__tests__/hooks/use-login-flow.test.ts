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
  getStoredAuthReturnUrl: vi.fn(),
  storeAuthReturnUrl: vi.fn(),
  createAuthReturnUrlAttempt: vi.fn(),
  isAuthReturnUrlAttemptCurrent: vi.fn(),
  clearStoredAuthReturnUrl: vi.fn(),
  getSafeReturnUrl: vi.fn(),
  consumeStoredAuthReturnUrl: vi.fn(),
  markReferralApplied: vi.fn(),
  clearStoredReferralCode: vi.fn(),
  startMobileGoogleAuth: vi.fn(),
  onboardingState: { onboardingLocallyDone: false, habits: [] as { title: string }[] },
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
  getStoredAuthReturnUrl: mocks.getStoredAuthReturnUrl,
  createAuthReturnUrlAttempt: mocks.createAuthReturnUrlAttempt,
  isAuthReturnUrlAttemptCurrent: mocks.isAuthReturnUrlAttemptCurrent,
  clearStoredAuthReturnUrl: mocks.clearStoredAuthReturnUrl,
  getSafeReturnUrl: mocks.getSafeReturnUrl,
  getStoredReferralCode: mocks.getStoredReferralCode,
  isSafeReturnUrl: () => true,
  isValidReferralCode: () => false,
  isValidVerificationCode: () => false,
  markReferralApplied: mocks.markReferralApplied,
  storeAuthReturnUrl: mocks.storeAuthReturnUrl,
  storeReferralCode: vi.fn(),
}))

vi.mock('@/lib/google-auth', () => ({ startMobileGoogleAuth: mocks.startMobileGoogleAuth }))

vi.mock('@/stores/onboarding-draft-store', () => ({
  useOnboardingDraftStore: (
    selector: (state: { onboardingLocallyDone: boolean; habits: unknown[] }) => unknown,
  ) => selector(mocks.onboardingState),
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
  vi.resetAllMocks()
  mocks.isOnline = true
  mocks.params = {}
  mocks.onboardingState = { onboardingLocallyDone: false, habits: [] }
  mocks.codeDigits = ['', '', '', '', '', '']
  mocks.apiClient.mockResolvedValue({})
  mocks.login.mockResolvedValue(() => true)
  mocks.getStoredReferralCode.mockResolvedValue(undefined)
  mocks.consumeStoredAuthReturnUrl.mockResolvedValue(undefined)
  mocks.getStoredAuthReturnUrl.mockResolvedValue(undefined)
  mocks.createAuthReturnUrlAttempt.mockReturnValue(0)
  mocks.isAuthReturnUrlAttemptCurrent.mockReturnValue(true)
  mocks.getSafeReturnUrl.mockImplementation((url?: string) => url ?? '/')
  mocks.markReferralApplied.mockResolvedValue(undefined)
  mocks.startMobileGoogleAuth.mockResolvedValue({ type: 'cancel' })
})

describe('useLoginFlow (mobile)', () => {
  it('uses the fallback after a newer login starts without a return URL', async () => {
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    mocks.apiClient.mockResolvedValue({
      token: 'access', refreshToken: 'refresh', userId: 'user',
      name: 'User', email: 'user@test.com', wasReactivated: false,
    })
    let storedReturnUrl: string | null = '/older'
    mocks.getStoredAuthReturnUrl.mockImplementation(() => Promise.resolve(storedReturnUrl))
    mocks.clearStoredAuthReturnUrl.mockImplementation(() => {
      storedReturnUrl = null
      return Promise.resolve()
    })
    const harness = await renderLoginFlow()

    await act(() => harness.current.verifyCode())

    expect(mocks.replace).toHaveBeenCalledWith('/')
    expect(mocks.replace).not.toHaveBeenCalledWith('/older')
  })

  it('uses normal sign in for a returning device without a draft', async () => {
    mocks.onboardingState.onboardingLocallyDone = true
    const harness = await renderLoginFlow()

    expect(harness.current.fromOnboarding).toBe(false)
    expect(harness.current.plannedHabitCount).toBe(0)
  })

  it('offers plan saving when a finished onboarding draft has a habit', async () => {
    mocks.onboardingState = { onboardingLocallyDone: true, habits: [{ title: 'Walk' }] }
    const harness = await renderLoginFlow()

    expect(harness.current.fromOnboarding).toBe(true)
    expect(harness.current.plannedHabitCount).toBe(1)
  })

  it('uses normal sign in for an empty draft even with an onboarding route param', async () => {
    mocks.params = { from: 'onboarding' }
    const harness = await renderLoginFlow()

    expect(harness.current.fromOnboarding).toBe(false)
    expect(harness.current.plannedHabitCount).toBe(0)
  })

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
    mocks.getStoredAuthReturnUrl.mockResolvedValue('/home')
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

  it('leaves referral and return navigation untouched when login loses ownership', async () => {
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    mocks.apiClient.mockResolvedValue({
      token: 'old-access', refreshToken: 'old-refresh', userId: 'old-user',
      name: 'Old', email: 'old@example.com', wasReactivated: false,
    })
    mocks.getStoredReferralCode.mockResolvedValue('REF123')
    mocks.login.mockResolvedValue(null)
    const harness = await renderLoginFlow()

    await act(() => harness.current.verifyCode())

    expect(mocks.markReferralApplied).not.toHaveBeenCalled()
    expect(mocks.clearStoredReferralCode).not.toHaveBeenCalled()
    expect(mocks.consumeStoredAuthReturnUrl).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('stops magic-code effects when another login takes ownership during referral storage', async () => {
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    mocks.apiClient.mockResolvedValue({
      token: 'old-access', refreshToken: 'old-refresh', userId: 'old-user',
      name: 'Old', email: 'old@example.com', wasReactivated: false,
    })
    mocks.getStoredReferralCode.mockResolvedValue('REF123')
    let epoch = 0
    mocks.login.mockImplementation(() => {
      const ownedEpoch = ++epoch
      return Promise.resolve(() => epoch === ownedEpoch)
    })
    let releaseReferral!: () => void
    mocks.markReferralApplied.mockImplementation(() => new Promise<void>((resolve) => {
      releaseReferral = resolve
    }))
    const harness = await renderLoginFlow()

    const verification = act(() => harness.current.verifyCode())
    await vi.waitFor(() => expect(mocks.markReferralApplied).toHaveBeenCalledTimes(1))
    await mocks.login('new-access', 'new-refresh', { userId: 'new-user' })
    releaseReferral()
    await verification

    expect(mocks.clearStoredReferralCode).not.toHaveBeenCalled()
    expect(mocks.consumeStoredAuthReturnUrl).not.toHaveBeenCalled()
    expect(mocks.getStoredAuthReturnUrl).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('keeps the return URL when another login takes ownership during its storage read', async () => {
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    mocks.apiClient.mockResolvedValue({
      token: 'old-access', refreshToken: 'old-refresh', userId: 'old-user',
      name: 'Old', email: 'old@example.com', wasReactivated: false,
    })
    let epoch = 0
    mocks.login.mockImplementation(() => {
      const ownedEpoch = ++epoch
      return Promise.resolve(() => epoch === ownedEpoch)
    })
    let releaseReturnUrl!: (url: string) => void
    const pendingRead = new Promise<string>((resolve) => { releaseReturnUrl = resolve })
    mocks.consumeStoredAuthReturnUrl.mockReturnValue(pendingRead)
    mocks.getStoredAuthReturnUrl.mockReturnValue(pendingRead)
    const harness = await renderLoginFlow()
    mocks.clearStoredAuthReturnUrl.mockClear()

    const verification = act(() => harness.current.verifyCode())
    await vi.waitFor(() => expect(
      mocks.consumeStoredAuthReturnUrl.mock.calls.length + mocks.getStoredAuthReturnUrl.mock.calls.length,
    ).toBe(1))
    await mocks.login('new-access', 'new-refresh', { userId: 'new-user' })
    releaseReturnUrl('/home')
    await verification

    expect(mocks.consumeStoredAuthReturnUrl).not.toHaveBeenCalled()
    expect(mocks.clearStoredAuthReturnUrl).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('does not consume a newer magic-code flow return URL before its login', async () => {
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    mocks.apiClient.mockResolvedValue({
      token: 'old-access', refreshToken: 'old-refresh', userId: 'old-user',
      name: 'Old', email: 'old@example.com', wasReactivated: false,
    })
    let releaseLogin!: () => void
    mocks.login.mockImplementation(() => new Promise<() => boolean>((resolve) => {
      releaseLogin = () => resolve(() => true)
    }))
    let returnUrl = '/older'
    let attemptId = 0
    mocks.createAuthReturnUrlAttempt.mockImplementation(() => ++attemptId)
    mocks.isAuthReturnUrlAttemptCurrent.mockImplementation((id: number) => id === attemptId)
    mocks.getStoredAuthReturnUrl.mockImplementation(() => Promise.resolve(returnUrl))
    mocks.storeAuthReturnUrl.mockImplementation((url: string) => {
      returnUrl = url
      return Promise.resolve()
    })
    const harness = await renderLoginFlow()
    mocks.clearStoredAuthReturnUrl.mockClear()
    const verification = act(() => harness.current.verifyCode())
    await vi.waitFor(() => expect(mocks.login).toHaveBeenCalledTimes(1))
    await mocks.storeAuthReturnUrl('/newer', mocks.createAuthReturnUrlAttempt())
    releaseLogin()
    await verification

    expect(mocks.getStoredAuthReturnUrl).not.toHaveBeenCalled()
    expect(mocks.clearStoredAuthReturnUrl).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalledWith('/newer')
    await expect(mocks.getStoredAuthReturnUrl(attemptId)).resolves.toBe('/newer')
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

  it('resends the code and restarts the countdown when online', async () => {
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.resendCode())

    const [endpoint, options] = firstApiCall()
    expect(endpoint).toBe(API.auth.sendCode)
    expect(bodyOf(options)).toMatchObject({ email: 'user@test.com', language: 'en' })
    expect(harness.current.successMessage).toBe('auth.codeSent')
    expect(mocks.startResendCountdown).toHaveBeenCalledTimes(1)
  })

  it('blocks resending while offline', async () => {
    mocks.isOnline = false
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.resendCode())

    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(mocks.showError).toHaveBeenCalledWith('auth.errors.offline')
  })

  it('returns to the email step and clears code entry', async () => {
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())
    expect(harness.current.step).toBe('code')

    await act(() => harness.current.backToEmail())

    expect(harness.current.step).toBe('email')
    expect(harness.current.successMessage).toBeNull()
    expect(mocks.resetCodeDigits).toHaveBeenCalled()
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

    expect(harness.current.successMessage).toBe('profile.deleteAccount.reactivated')
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
    expect(mocks.showError).toHaveBeenCalledWith('auth.errors.offline')
  })

  it('surfaces a Google sign-in failure', async () => {
    mocks.startMobileGoogleAuth.mockRejectedValue(new Error('oauth boom'))
    const harness = await renderLoginFlow()

    await act(() => harness.current.signInWithGoogle())

    expect(mocks.showError).toHaveBeenCalled()
    expect(harness.current.isGoogleLoading).toBe(false)
  })

  it('routes to the legal pages', async () => {
    const harness = await renderLoginFlow()

    await act(() => harness.current.openPrivacyPolicy())
    expect(mocks.push).toHaveBeenCalledWith('/privacy')

    await act(() => harness.current.openTerms())
    expect(mocks.push).toHaveBeenCalledWith('/terms')
  })
})
