import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

import { useLoginFlow } from '@/app/(auth)/login/use-login-flow'

const mocks = vi.hoisted(() => ({
  search: '',
  isOnline: true,
  setAuth: vi.fn(),
  showError: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
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

vi.mock('@/lib/profile-presentation', () => ({
  hydrateProfilePresentation: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/stores/onboarding-draft-store', () => {
  const useOnboardingDraftStore = Object.assign(
    (selector: (state: { habits: unknown[] }) => unknown) => selector({ habits: [] }),
    { persist: { rehydrate: vi.fn() } },
  )
  return { useOnboardingDraftStore }
})

const loginResponse = {
  token: 'access-token',
  refreshToken: 'refresh-token',
  userId: 'user-1',
  name: 'Ada',
  email: 'user@test.com',
  wasReactivated: false,
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
vi.stubGlobal('fetch', fetchMock)

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

interface VerifyOutcome {
  body: unknown
  status: number
}

function toUrlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function wireAuthNetwork(verify: VerifyOutcome = { body: loginResponse, status: 200 }) {
  fetchMock.mockImplementation((input) => {
    const url = toUrlString(input)
    if (url.includes('/api/auth/send-code')) return Promise.resolve(jsonResponse({}))
    if (url.includes('/api/auth/verify-code')) {
      return Promise.resolve(jsonResponse(verify.body, verify.status))
    }
    return Promise.reject(new Error(`unexpected auth fetch: ${url}`))
  })
}

function requestBodyFor(pathFragment: string): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([input]) => toUrlString(input).includes(pathFragment))
  if (!call) throw new Error(`no fetch call matched ${pathFragment}`)
  const rawBody = call[1]?.body
  return JSON.parse(typeof rawBody === 'string' ? rawBody : '{}') as Record<string, unknown>
}

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
}

async function advanceToCodeStep(result: { current: ReturnType<typeof useLoginFlow> }) {
  act(() => result.current.setEmail('user@test.com'))
  await act(async () => {
    await result.current.sendCode()
  })
}

function typeCode(result: { current: ReturnType<typeof useLoginFlow> }, code: string) {
  act(() => {
    result.current.onCodeChange(code)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.search = ''
  mocks.isOnline = true
  setNavigatorOnline(true)
  localStorage.clear()
  document.cookie = 'referral_code=;max-age=0;path=/'
  wireAuthNetwork()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useLoginFlow send-code step', () => {
  it('rejects an invalid email through the real validator without hitting the network', async () => {
    const { result } = renderHook(() => useLoginFlow())

    act(() => result.current.setEmail('not-an-email'))
    await act(async () => {
      await result.current.sendCode()
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.errorMessage).toBe('auth.errors.invalidEmail')
    expect(mocks.showError).not.toHaveBeenCalled()
    expect(result.current.step).toBe('email')
  })

  it('blocks sending while the browser is offline', async () => {
    setNavigatorOnline(false)
    const { result } = renderHook(() => useLoginFlow())

    act(() => result.current.setEmail('user@test.com'))
    await act(async () => {
      await result.current.sendCode()
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.showError).not.toHaveBeenCalled()
    expect(result.current.step).toBe('email')
  })

  it('posts the email, advances to the code step, and starts the resend countdown', async () => {
    const { result } = renderHook(() => useLoginFlow())

    await advanceToCodeStep(result)

    expect(requestBodyFor('/api/auth/send-code')).toEqual({ email: 'user@test.com', language: 'en' })
    expect(result.current.step).toBe('code')
    expect(result.current.successMessage).toBe('auth.codeSent')
    expect(result.current.canResend).toBe(false)
    expect(result.current.resendCountdown).toBe(60)
    expect(result.current.errorMessage).toBeNull()
  })
})

describe('useLoginFlow verify-code success', () => {
  it('verifies the code, stores the session, and redirects to a safe returnUrl', async () => {
    mocks.search = 'returnUrl=/dashboard'
    const { result } = renderHook(() => useLoginFlow())

    await advanceToCodeStep(result)
    await act(async () => {
      await result.current.verifyCode('123456')
    })

    expect(requestBodyFor('/api/auth/verify-code')).toEqual({
      email: 'user@test.com',
      code: '123456',
      language: 'en',
    })
    expect(mocks.setAuth).toHaveBeenCalledWith(loginResponse)
    expect(mocks.push).toHaveBeenCalledWith('/dashboard')
    expect(result.current.isSubmitting).toBe(false)
  })

  it('rejects a protocol-relative returnUrl and redirects home instead', async () => {
    mocks.search = 'returnUrl=//evil.example.com'
    const { result } = renderHook(() => useLoginFlow())

    await advanceToCodeStep(result)
    await act(async () => {
      await result.current.verifyCode('123456')
    })

    expect(mocks.push).toHaveBeenCalledWith('/')
  })

  it('applies a referral cookie and surfaces the reactivation message on success', async () => {
    document.cookie = 'referral_code=friend-42'
    wireAuthNetwork({ body: { ...loginResponse, wasReactivated: true }, status: 200 })
    const { result } = renderHook(() => useLoginFlow())

    await advanceToCodeStep(result)
    await act(async () => {
      await result.current.verifyCode('123456')
    })

    expect(requestBodyFor('/api/auth/verify-code')).toMatchObject({ referralCode: 'friend-42' })
    expect(result.current.accountBack).toMatchObject({ wasReactivated: true })
    expect(mocks.push).not.toHaveBeenCalled()
    await act(async () => result.current.continueAccount())
    expect(mocks.push).toHaveBeenCalledWith('/')
  })

  it('auto-submits once six digits are entered and completes the session', async () => {
    const { result } = renderHook(() => useLoginFlow())

    await advanceToCodeStep(result)
    typeCode(result, '246810')

    await waitFor(() => expect(mocks.setAuth).toHaveBeenCalledWith(loginResponse))
    expect(requestBodyFor('/api/auth/verify-code')).toMatchObject({ code: '246810' })
    expect(mocks.push).toHaveBeenCalledTimes(1)
  })
})

describe('useLoginFlow verify-code failure', () => {
  it('maps a 401 to the unauthorized message and clears the entered code for retry', async () => {
    wireAuthNetwork({ body: { error: 'Unauthorized' }, status: 401 })
    const { result } = renderHook(() => useLoginFlow())

    await advanceToCodeStep(result)
    typeCode(result, '111111')

    await waitFor(() => expect(result.current.errorMessage).toBe('auth.errors.unauthorized'))
    expect(mocks.setAuth).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(result.current.step).toBe('code')
    expect(result.current.codeDigits.join('')).toBe('111111')
  })

  it('maps a 5xx failure to the server-error message', async () => {
    wireAuthNetwork({ body: null, status: 503 })
    const { result } = renderHook(() => useLoginFlow())

    await advanceToCodeStep(result)
    await act(async () => {
      await result.current.verifyCode('123456')
    })

    expect(result.current.errorMessage).toBe('auth.errors.unknownError')
    expect(mocks.setAuth).not.toHaveBeenCalled()
  })

  it('maps a recognized backend error string to its specific message', async () => {
    wireAuthNetwork({ body: { error: 'Invalid verification code' }, status: 400 })
    const { result } = renderHook(() => useLoginFlow())

    await advanceToCodeStep(result)
    await act(async () => {
      await result.current.verifyCode('123456')
    })

    expect(result.current.errorMessage).toBe('auth.errors.invalidCode')
    expect(mocks.setAuth).not.toHaveBeenCalled()
  })
})

describe('auth state recovery', () => {
  it.each([429, 500, 503])('keeps the address and one send failure for HTTP %s', async (status) => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Request failed' }, status))
    const { result } = renderHook(() => useLoginFlow())
    await advanceToCodeStep(result)
    expect(result.current.step).toBe('email')
    expect(result.current.email).toBe('user@test.com')
    expect(result.current.errorKey).toBe('auth.errors.sendFailed')
    expect(mocks.showError).not.toHaveBeenCalled()
  })

  it('keeps the same send failure after a thrown network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('network disconnected'))
    const { result } = renderHook(() => useLoginFlow())
    await advanceToCodeStep(result)
    expect(result.current.errorKey).toBe('auth.errors.sendFailed')
    expect(result.current.email).toBe('user@test.com')
  })

  it('prefills a valid link without verifying it until the action', async () => {
    mocks.search = 'email=user%40test.com&code=123456'
    const { result } = renderHook(() => useLoginFlow())
    expect(result.current.step).toBe('code')
    expect(result.current.codeDigits.join('')).toBe('123456')
    expect(fetchMock).not.toHaveBeenCalled()
    await act(async () => result.current.verifyCode())
    expect(mocks.setAuth).toHaveBeenCalledTimes(1)
  })

  it('deduplicates the sixth digit and a simultaneous verify action', async () => {
    const { result } = renderHook(() => useLoginFlow())
    await advanceToCodeStep(result)
    await act(async () => {
      result.current.onCodeChange('123456')
      await result.current.verifyCode('123456')
    })
    expect(fetchMock.mock.calls.filter(([url]) => typeof url === 'string' && url.includes('verify-code'))).toHaveLength(1)
  })

  it('locks after three wrong codes, retains the address lock, and allows another address', async () => {
    wireAuthNetwork({ body: { error: 'Invalid verification code' }, status: 400 })
    const { result } = renderHook(() => useLoginFlow())
    await advanceToCodeStep(result)
    for (const code of ['111111', '222222', '333333']) {
      await act(async () => { result.current.onCodeChange(code) })
    }
    expect(result.current.codeFailure).toBe('locked')
    expect(result.current.lockCountdown).toBe(900)
    expect(result.current.codeDigits.join('')).toBe('333333')
    const calls = fetchMock.mock.calls.length
    await act(async () => { await result.current.verifyCode('444444'); await result.current.resendCode() })
    expect(fetchMock).toHaveBeenCalledTimes(calls)
    act(() => result.current.backToEmail())
    act(() => result.current.setEmail('other@test.com'))
    await act(async () => result.current.sendCode())
    expect(result.current.step).toBe('code')
    expect(result.current.codeFailure).toBeNull()
    act(() => result.current.backToEmail())
    act(() => result.current.setEmail('USER@test.com'))
    const before = fetchMock.mock.calls.length
    await act(async () => result.current.sendCode())
    expect(result.current.codeFailure).toBe('locked')
    expect(fetchMock).toHaveBeenCalledTimes(before)
  })

  it('offers a fresh code after lock expiry and never replays the expired digits', async () => {
    vi.useFakeTimers()
    wireAuthNetwork({ body: { error: 'Too many attempts. Try again in 15 minutes' }, status: 400 })
    const { result, unmount } = renderHook(() => useLoginFlow())
    await advanceToCodeStep(result)
    await act(async () => result.current.verifyCode('123456'))
    expect(result.current.codeFailure).toBe('locked')
    await act(async () => vi.advanceTimersByTime(900_000))
    expect(result.current.codeFailure).toBe('expired')
    const calls = fetchMock.mock.calls.length
    await act(async () => result.current.verifyCode('123456'))
    expect(fetchMock).toHaveBeenCalledTimes(calls)
    await act(async () => result.current.resendCode())
    expect(result.current.codeFailure).toBeNull()
    expect(result.current.successMessage).toBe('auth.codeResent')
    expect(result.current.resendCountdown).toBe(60)
    unmount()
  })
})
