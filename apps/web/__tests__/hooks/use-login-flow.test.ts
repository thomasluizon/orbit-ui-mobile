import React from 'react'
import { LoginContent } from '@/app/(auth)/login/login-content'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, fireEvent, renderHook, waitFor } from '@testing-library/react'

import { useLoginFlow } from '@/app/(auth)/login/use-login-flow'

const mocks = vi.hoisted(() => ({
  search: '',
  language: 'en',
  translate: (key: string) => key,
  isOnline: true,
  setAuth: vi.fn(),
  showError: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  confirmSessionRefreshFailure: vi.fn().mockResolvedValue(undefined),
  recoverSessionRefreshFailure: vi.fn().mockResolvedValue(undefined),
  assign: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => mocks.translate,
  useLocale: () => mocks.language,
}))

vi.mock('motion/react', () => ({ useReducedMotion: () => true, AnimatePresence: ({ children }: { children: React.ReactNode }) => children, motion: { div: ({ children }: { children: React.ReactNode }) => React.createElement('div', {}, children) } }))

vi.mock('@orbit/shared/theme', async (original) => ({ ...await original<typeof import('@orbit/shared/theme')>(), resolveMotionPreset: () => ({ reducedMotionEnabled: true }) }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}))

vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: mocks.showError }) }))

vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.isOnline }) }))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign(() => ({ setAuth: mocks.setAuth }), {
    getState: () => ({
      confirmSessionRefreshFailure: mocks.confirmSessionRefreshFailure,
      recoverSessionRefreshFailure: mocks.recoverSessionRefreshFailure,
    }),
  }),
  withCookieSettingLogin: (task: () => Promise<unknown>) => task(),
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
  vi.stubGlobal('fetch', fetchMock)
  vi.clearAllMocks()
  mocks.language = 'en'
  mocks.translate = (key: string) => key
  mocks.search = ''
  mocks.isOnline = true
  setNavigatorOnline(true)
  localStorage.clear()
  sessionStorage.clear()
  document.cookie = 'referral_code=;max-age=0;path=/'
  wireAuthNetwork()
})

describe('Google sign in', () => {
  it('starts through the BFF and preserves the destination', () => {
    vi.stubGlobal('location', { assign: mocks.assign })
    const { result } = renderHook(() => useLoginFlow())

    act(() => { result.current.signInWithGoogle() })

    expect(mocks.assign).toHaveBeenCalledWith('/api/auth/google/start?purpose=signin')
    expect(sessionStorage.getItem('auth_return_url')).toBe('/')
  })
})

it('keeps the Astra query from the anonymous notification redirect through Google sign-in', () => {
  vi.stubGlobal('location', { assign: mocks.assign })
  mocks.search = 'astra=open&returnUrl=%2F'
  const { result } = renderHook(() => useLoginFlow())
  act(() => { result.current.signInWithGoogle() })
  expect(sessionStorage.getItem('auth_return_url')).toBe('/?astra=open')
})

it.each(['/profile', '/chat'])('carries the destination of a notification clicked while signed out through Google sign in (%s)', (url) => {
  vi.stubGlobal('location', { assign: mocks.assign })
  mocks.search = `notificationUrl=${encodeURIComponent(url)}&returnUrl=%2F`
  const { result } = renderHook(() => useLoginFlow())

  act(() => { result.current.signInWithGoogle() })

  expect(sessionStorage.getItem('auth_return_url')).toBe(url === '/chat' ? '/?astra=open' : url)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('uses a fresh token for web send, resend, and verify requests', async () => {
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'test-site-key')
  vi.useFakeTimers()
  const { result } = renderHook(() => useLoginFlow())
  act(() => result.current.setEmail('user@test.com'))

  await act(async () => { await result.current.sendCode() })
  expect(fetchMock).not.toHaveBeenCalled()
  act(() => result.current.onTurnstileToken('send-token'))
  await act(async () => { await result.current.sendCode() })
  expect(requestBodyFor('/api/auth/send-code')).toMatchObject({ turnstileToken: 'send-token' })
  expect(result.current.turnstileToken).toBeNull()
  expect(result.current.turnstileResetKey).toBe(1)

  await act(async () => { await result.current.verifyCode('123456') })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  act(() => { vi.advanceTimersByTime(60_000) })
  act(() => result.current.onTurnstileToken('resend-token'))
  await act(async () => { await result.current.resendCode() })
  const sendBodies = fetchMock.mock.calls
    .filter(([url]) => toUrlString(url).includes('/api/auth/send-code'))
    .map(([, options]) => JSON.parse(typeof options?.body === 'string' ? options.body : '{}') as Record<string, unknown>)
  expect(sendBodies.map((body) => body.turnstileToken)).toEqual(['send-token', 'resend-token'])

  act(() => result.current.onTurnstileToken('verify-token'))
  await act(async () => { await result.current.verifyCode('123456') })
  expect(requestBodyFor('/api/auth/verify-code')).toMatchObject({ turnstileToken: 'verify-token' })
  expect(result.current.turnstileResetKey).toBe(3)
})

it('submits a completed code when a delayed widget token arrives', async () => {
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'test-site-key')
  const { result } = renderHook(() => useLoginFlow())
  act(() => result.current.setEmail('user@test.com'))
  act(() => result.current.onTurnstileToken('send-token'))
  await act(async () => { await result.current.sendCode() })

  act(() => result.current.onCodeChange('123456'))
  expect(fetchMock).toHaveBeenCalledTimes(1)
  act(() => result.current.onTurnstileToken('delayed-verify-token'))
  await waitFor(() => expect(requestBodyFor('/api/auth/verify-code')).toMatchObject({
    code: '123456', turnstileToken: 'delayed-verify-token',
  }))
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it.each(['before', 'during'])('does not replay a code completed %s an offline interval', async (timing) => {
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'test-site-key')
  const { result, rerender } = renderHook(() => useLoginFlow())
  act(() => result.current.setEmail('user@test.com'))
  act(() => result.current.onTurnstileToken('send-token'))
  await act(async () => { await result.current.sendCode() })

  if (timing === 'before') typeCode(result, '123456')
  mocks.isOnline = false
  rerender()
  if (timing === 'during') typeCode(result, '123456')
  expect(fetchMock).toHaveBeenCalledTimes(1)

  mocks.isOnline = true
  rerender()
  act(() => result.current.onTurnstileToken('fresh-verify-token'))
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(result.current.codeDigits.join('')).toBe('123456')

  await act(async () => { await result.current.verifyCode() })
  expect(requestBodyFor('/api/auth/verify-code')).toMatchObject({
    code: '123456', turnstileToken: 'fresh-verify-token',
  })
  expect(fetchMock).toHaveBeenCalledTimes(2)
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

  it('keeps the Astra query from the anonymous notification redirect after code verification', async () => {
    mocks.search = 'astra=open&returnUrl=%2F'
    const { result } = renderHook(() => useLoginFlow())
    await advanceToCodeStep(result)
    await act(async () => { await result.current.verifyCode('123456') })
    expect(mocks.push).toHaveBeenCalledWith('/?astra=open')
  })

  it('returns to the destination of a notification clicked while signed out', async () => {
    mocks.search = 'notificationUrl=%2Fprogress&returnUrl=%2F'
    const { result } = renderHook(() => useLoginFlow())

    await advanceToCodeStep(result)
    await act(async () => {
      await result.current.verifyCode('123456')
    })

    expect(mocks.push).toHaveBeenCalledWith('/progress')
  })

  it.each(['%2F%2Fevil.example', 'https%3A%2F%2Fevil.example', '%2Fsocial%2Fx'])(
    'ignores a notification destination the shared rule rejects (%s)',
    async (notificationUrl) => {
      mocks.search = `notificationUrl=${notificationUrl}&returnUrl=%2Fdashboard`
      const { result } = renderHook(() => useLoginFlow())

      await advanceToCodeStep(result)
      await act(async () => {
        await result.current.verifyCode('123456')
      })

      expect(mocks.push).toHaveBeenCalledWith('/dashboard')
    },
  )

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
  it.each(['success', 'failure'])('tracks the pending resend through %s without replaying verification', async (outcome) => {
    vi.useFakeTimers()
    const { result, unmount } = renderHook(() => useLoginFlow())
    await advanceToCodeStep(result)
    await act(async () => vi.advanceTimersByTime(60_000))
    let settle!: (response: Response) => void
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { settle = resolve }))
    let pending!: Promise<void>
    act(() => { pending = result.current.resendCode() })
    expect(result.current).toMatchObject({ isSubmitting: true, isResending: true })
    const calls = fetchMock.mock.calls.length
    await act(async () => { await result.current.resendCode(); await result.current.verifyCode('123456') })
    expect(fetchMock).toHaveBeenCalledTimes(calls)
    await act(async () => { settle(jsonResponse({}, outcome === 'success' ? 200 : 503)); await pending })
    expect(result.current).toMatchObject({ isSubmitting: false, isResending: false })
    expect(result.current.errorKey).toBe(outcome === 'success' ? null : 'auth.errors.sendFailed')
    expect(result.current.successMessage).toBe(outcome === 'success' ? 'auth.codeResent' : null)
    expect(mocks.setAuth).not.toHaveBeenCalled()
    unmount()
  })

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

  it('allows verification after the observed lock elapses without automatic replay', async () => {
    vi.useFakeTimers()
    wireAuthNetwork({ body: { error: 'Invalid verification code' }, status: 400 })
    const { result, unmount } = renderHook(() => useLoginFlow())
    await advanceToCodeStep(result)
    for (const code of ['111111', '222222', '333333']) await act(async () => result.current.verifyCode(code))
    expect(result.current.codeFailure).toBe('locked')
    const calls = fetchMock.mock.calls.length
    await act(async () => vi.advanceTimersByTime(900_000))
    expect(result.current.codeFailure).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(calls)
    wireAuthNetwork()
    await act(async () => result.current.verifyCode('123456'))
    expect(mocks.setAuth).toHaveBeenCalledTimes(1)
    await act(async () => result.current.resendCode())
    expect(result.current.codeFailure).toBeNull()
    expect(result.current.successMessage).toBe('auth.codeResent')
    expect(result.current.resendCountdown).toBe(60)
    unmount()
  })
  it('lets the server decide retries after a reload with an unknown lock deadline', async () => {
    wireAuthNetwork({ body: { error: 'Too many attempts. Try again in 15 minutes' }, status: 400 })
    const { result } = renderHook(() => useLoginFlow())
    await advanceToCodeStep(result)
    await act(async () => result.current.verifyCode('123456'))
    expect(result.current.codeFailure).toBe('locked')
    const calls = fetchMock.mock.calls.length
    await act(async () => result.current.verifyCode('123456'))
    expect(fetchMock).toHaveBeenCalledTimes(calls + 1)
    wireAuthNetwork()
    await act(async () => result.current.verifyCode('123456'))
    expect(mocks.setAuth).toHaveBeenCalledTimes(1)
  })
})


describe('field validation responses', () => {
  it.each(['en', 'pt-BR'] as const)('retains %s server copy and paired codes', async (language) => {
    const { verificationValidationResponses } = await import('@orbit/shared/test-support/validation-fixtures')
    const payload = verificationValidationResponses[language]
    wireAuthNetwork({ body: payload, status: 400 })
    const { result } = renderHook(() => useLoginFlow())
    await advanceToCodeStep(result)
    await act(() => result.current.verifyCode('123456'))
    expect(result.current).toMatchObject({ codeFieldError: payload.errors.Code.join('\n'), validationErrorDetails: payload.errorDetails, codeFailure: null })
  })

  it('makes the format code available when five digits are submitted', async () => {
    const { result } = renderHook(() => useLoginFlow())
    await advanceToCodeStep(result)
    await act(() => result.current.verifyCode('12345'))
    expect(result.current).toMatchObject({ errorMessage: 'auth.errors.codeFormat', validationCode: 'VALIDATION_VERIFICATION_CODE_FORMAT', codeFailure: null })
  })

  it('shows legacy email validation beside the email field', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ errors: { Email: ['Legacy email failure'] } }, 400))
    const { result } = renderHook(() => useLoginFlow())
    act(() => result.current.setEmail('user@test.com'))
    await act(() => result.current.sendCode())
    expect(result.current).toMatchObject({ emailFieldError: 'Legacy email failure' })
    act(() => result.current.setEmail('corrected@test.com'))
    expect(result.current.emailFieldError).toBeUndefined()
  })
})


it.each(['en', 'pt-BR'] as const)('shows the five-digit format error in the mounted %s login form', async (language) => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
  const messages = (await import(`@orbit/shared/i18n/${language}.json`)).default
  const translate = createTranslator({ locale: language, messages })
  mocks.language = language
  mocks.translate = translate
  render(React.createElement(LoginContent))
  fireEvent.change(screen.getByRole('textbox', { name: translate('auth.email') }), { target: { value: 'user@test.com' } })
  fireEvent.click(screen.getByRole('button', { name: translate('auth.sendCode') }))
  const code = await screen.findByRole('textbox', { name: translate('auth.verificationCode') })
  fireEvent.change(code, { target: { value: '12345' } })
  fireEvent.blur(code)
  expect(code).toHaveAttribute('aria-invalid', 'true')
  expect(document.getElementById(code.getAttribute('aria-describedby') ?? '')).toHaveTextContent(translate('auth.errors.codeFormat'))
  expect(screen.getByRole('button', { name: translate('auth.verify') })).toBeDisabled()
  fireEvent.change(code, { target: { value: '1234' } })
  expect(code).not.toHaveAttribute('aria-invalid')
})


it.each([
  { step: 'email', mixed: true }, { step: 'code', mixed: true },
  { step: 'email', mixed: false }, { step: 'code', mixed: false },
])('keeps unmapped validation visible in the owning $step form (mixed: $mixed)', async ({ step, mixed }) => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
  const messages = (await import('@orbit/shared/i18n/en.json')).default
  mocks.translate = createTranslator({ locale: 'en', messages }) as typeof mocks.translate
  render(React.createElement(LoginContent))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'user@test.com' } })
  if (step === 'code') {
    fireEvent.click(screen.getByRole('button', { name: mocks.translate('auth.sendCode') }))
    await screen.findByRole('textbox', { name: mocks.translate('auth.verificationCode') })
  }
  const field = step === 'email' ? 'Email' : 'Code'
  const other = 'Other'
  fetchMock.mockResolvedValue(jsonResponse({ errors: { ...(mixed ? { [field]: ['Field failure'] } : {}), [other]: ['Other failure', 'Second failure'] } }, 400))
  const input = screen.getByRole('textbox')
  if (step === 'email') fireEvent.click(screen.getByRole('button', { name: mocks.translate('auth.sendCode') }))
  else fireEvent.change(input, { target: { value: '123456' } })
  if (mixed) await waitFor(() => expect(input).toHaveAccessibleDescription('Field failure'))
  else await waitFor(() => expect(screen.getByText('Other failure', { exact: false })).toBeInTheDocument())
  expect(screen.getByText('Other failure', { exact: false })).toHaveTextContent('Other failure Second failure')
  if (mixed) expect(input).toHaveFocus()
  expect(input).toHaveValue(step === 'email' ? 'user@test.com' : '123456')
  fetchMock.mockResolvedValue(jsonResponse({ errors: { [other]: ['Unknown first', 'Unknown second'] } }, 400))
  fireEvent.change(input, { target: { value: step === 'email' ? 'corrected@test.com' : '123457' } })
  if (step === 'email') fireEvent.click(screen.getByRole('button', { name: mocks.translate('auth.sendCode') }))
  await waitFor(() => expect(screen.getByText('Unknown first', { exact: false })).toHaveTextContent('Unknown first Unknown second'))
  expect(input).not.toHaveAttribute('aria-invalid')
})


it('keeps the general announcement region stable when verification returns email validation', async () => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
  const messages = (await import('@orbit/shared/i18n/en.json')).default
  mocks.translate = createTranslator({ locale: 'en', messages }) as typeof mocks.translate
  render(React.createElement(LoginContent))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'user@test.com' } })
  fireEvent.click(screen.getByRole('button', { name: mocks.translate('auth.sendCode') }))
  const code = await screen.findByRole('textbox', { name: mocks.translate('auth.verificationCode') })
  const generalRegion = screen.getAllByRole('status').at(-1)
  expect(generalRegion).toBeEmptyDOMElement()
  fetchMock.mockResolvedValue(jsonResponse({ errors: { Email: ['Email failure'], Other: ['Other failure', 'Second failure'] } }, 400))
  fireEvent.change(code, { target: { value: '123456' } })
  const email = await screen.findByRole('textbox', { name: mocks.translate('auth.email') })
  expect(email).toHaveAccessibleDescription('Email failure')
  expect(email).toHaveFocus()
  expect(email).toHaveValue('user@test.com')
  expect(screen.getByText('Other failure', { exact: false })).toBe(generalRegion)
  expect(generalRegion).toHaveTextContent('Other failure Second failure')
})
