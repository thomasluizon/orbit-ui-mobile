import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useLoginFlow } from '@/app/(auth)/login/use-login-flow'

const mocks = vi.hoisted(() => ({
  search: '',
  isOnline: true,
  codeDigits: ['', '', '', '', '', ''],
  setAuth: vi.fn(),
  showError: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  resetCodeDigits: vi.fn(),
  startResendCountdown: vi.fn(),
  focus: vi.fn(),
  fetchAuthEndpoint: vi.fn(),
  handleVerifySuccess: vi.fn(),
  isOfflinePreflight: vi.fn(() => false),
  resolveLoginErrorState: vi.fn(() => ({ message: 'auth.errors.generic' })),
  getCookieValue: vi.fn(() => undefined),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('motion/react', () => ({ useReducedMotion: () => false }))

vi.mock('@orbit/shared/theme', () => ({ resolveMotionPreset: () => ({}) }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}))

vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: mocks.showError }) }))

vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.isOnline }) }))

vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => ({ setAuth: mocks.setAuth }) }))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({ auth: { signInWithOAuth: vi.fn() } }),
}))

vi.mock('@/stores/onboarding-draft-store', () => {
  const useOnboardingDraftStore = Object.assign(
    (selector: (state: { habits: unknown[] }) => unknown) => selector({ habits: [] }),
    { persist: { rehydrate: vi.fn() } },
  )
  return { useOnboardingDraftStore }
})

vi.mock('@/hooks/use-login-code-entry', () => ({
  useLoginCodeEntry: () => ({
    codeDigits: mocks.codeDigits,
    setCodeDigits: vi.fn(),
    codeInputRefs: { current: [{ focus: mocks.focus }] },
    canResend: true,
    resendCountdown: 0,
    startResendCountdown: mocks.startResendCountdown,
    resetCodeDigits: mocks.resetCodeDigits,
    onCodeInput: vi.fn(),
    onCodePaste: vi.fn(),
    onCodeKeydown: vi.fn(),
  }),
}))

vi.mock('@/app/(auth)/login/login-form-helpers', () => ({
  fetchAuthEndpoint: mocks.fetchAuthEndpoint,
  handleVerifySuccess: mocks.handleVerifySuccess,
  isOfflinePreflight: mocks.isOfflinePreflight,
  resolveLoginErrorState: mocks.resolveLoginErrorState,
  getCookieValue: mocks.getCookieValue,
}))

const loginResponse = {
  token: 'access-token',
  refreshToken: 'refresh-token',
  userId: 'user-1',
  name: 'Ada',
  email: 'user@test.com',
  wasReactivated: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.search = ''
  mocks.isOnline = true
  mocks.codeDigits = ['', '', '', '', '', '']
  mocks.isOfflinePreflight.mockReturnValue(false)
  mocks.resolveLoginErrorState.mockReturnValue({ message: 'auth.errors.generic' })
  mocks.getCookieValue.mockReturnValue(undefined)
  mocks.fetchAuthEndpoint.mockResolvedValue({})
  mocks.handleVerifySuccess.mockResolvedValue(undefined)
})

describe('useLoginFlow (web)', () => {
  it('rejects an invalid email without calling the API', async () => {
    const { result } = renderHook(() => useLoginFlow())

    act(() => result.current.setEmail('not-an-email'))
    await act(async () => {
      await result.current.sendCode()
    })

    expect(mocks.fetchAuthEndpoint).not.toHaveBeenCalled()
    expect(mocks.showError).toHaveBeenCalledWith('auth.errors.invalidEmail')
  })

  it('blocks sending a code while offline and surfaces the offline error', async () => {
    mocks.isOfflinePreflight.mockReturnValue(true)
    const { result } = renderHook(() => useLoginFlow())

    act(() => result.current.setEmail('user@test.com'))
    await act(async () => {
      await result.current.sendCode()
    })

    expect(mocks.fetchAuthEndpoint).not.toHaveBeenCalled()
    expect(mocks.showError).toHaveBeenCalledWith('auth.errors.offline')
  })

  it('sends the code, advances to the code step, and starts the resend countdown', async () => {
    const { result } = renderHook(() => useLoginFlow())

    act(() => result.current.setEmail('user@test.com'))
    await act(async () => {
      await result.current.sendCode()
    })

    expect(mocks.fetchAuthEndpoint).toHaveBeenCalledWith('/api/auth/send-code', {
      email: 'user@test.com',
      language: 'en',
    })
    expect(result.current.step).toBe('code')
    expect(result.current.successMessage).toBe('auth.codeSent')
    expect(mocks.startResendCountdown).toHaveBeenCalledTimes(1)
  })

  it('verifies the code and completes the session via handleVerifySuccess', async () => {
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    mocks.fetchAuthEndpoint.mockResolvedValue(loginResponse)
    const { result } = renderHook(() => useLoginFlow())

    act(() => result.current.setEmail('user@test.com'))
    await act(async () => {
      await result.current.verifyCode()
    })

    expect(mocks.fetchAuthEndpoint).toHaveBeenCalledWith('/api/auth/verify-code', {
      email: 'user@test.com',
      code: '123456',
      language: 'en',
    })
    expect(mocks.handleVerifySuccess).toHaveBeenCalledWith(
      loginResponse,
      undefined,
      mocks.setAuth,
      expect.any(Function),
      expect.any(Function),
      expect.anything(),
      expect.any(Function),
    )
  })

  it('reports the error and resets the code entry when verification fails', async () => {
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    mocks.fetchAuthEndpoint.mockRejectedValue(new Error('invalid code'))
    const { result } = renderHook(() => useLoginFlow())

    act(() => result.current.setEmail('user@test.com'))
    await act(async () => {
      await result.current.verifyCode()
    })

    expect(mocks.handleVerifySuccess).not.toHaveBeenCalled()
    expect(mocks.showError).toHaveBeenCalledWith('auth.errors.generic')
    expect(mocks.resetCodeDigits).toHaveBeenCalledTimes(1)
    expect(mocks.focus).toHaveBeenCalledTimes(1)
  })
})
