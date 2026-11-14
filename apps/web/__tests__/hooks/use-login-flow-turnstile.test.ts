import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useLoginFlow } from '@/app/(auth)/login/use-login-flow'

vi.mock('@/lib/auth-api', () => ({
  ACCOUNT_ID_HEADER: 'x-account-id',
  getAccountIdFromToken: vi.fn(() => null),
  AUTH_COOKIE: 'auth_token',
  REFRESH_COOKIE: 'refresh_token',
  resolveSessionTokens: vi.fn(),
  setSessionCookies: vi.fn(),
}))

const mocks = vi.hoisted(() => ({
  isOnline: true,
  setAuth: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  confirmSessionRefreshFailure: vi.fn().mockResolvedValue(undefined),
  recoverSessionRefreshFailure: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('motion/react', async (original) => ({
  ...await original<typeof import('motion/react')>(),
  useReducedMotion: () => true,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(''),
}))

vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.isOnline }) }))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign(() => ({ setAuth: mocks.setAuth }), {
    subscribe: () => () => {},
    getState: () => ({
      isAuthenticated: false,
      confirmSessionRefreshFailure: mocks.confirmSessionRefreshFailure,
      recoverSessionRefreshFailure: mocks.recoverSessionRefreshFailure,
    }),
  }),
  getHeldAccountId: () => null,
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

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

function toUrlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function requestBodyFor(pathFragment: string): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([input]) => toUrlString(input).includes(pathFragment))
  if (!call) throw new Error(`no fetch call matched ${pathFragment}`)
  const rawBody = call[1]?.body
  return JSON.parse(typeof rawBody === 'string' ? rawBody : '{}') as Record<string, unknown>
}

function typeCode(result: { current: ReturnType<typeof useLoginFlow> }, code: string) {
  act(() => {
    result.current.onCodeChange(code)
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.clearAllMocks()
  mocks.isOnline = true
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
  localStorage.clear()
  sessionStorage.clear()
  fetchMock.mockImplementation((input) => {
    const url = toUrlString(input)
    if (url.includes('/api/auth/send-code')) return Promise.resolve(jsonResponse({}))
    if (url.includes('/api/auth/verify-code')) {
      return Promise.resolve(jsonResponse({ token: 'access-token', refreshToken: 'refresh-token', userId: 'user-1', name: 'Ada', email: 'user@test.com', wasReactivated: false }))
    }
    return Promise.reject(new Error(`unexpected auth fetch: ${url}`))
  })
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

it('gives the code field focus back when the code screen check passes before the code is complete', async () => {
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'test-site-key')
  const { result } = renderHook(() => useLoginFlow())
  act(() => result.current.setEmail('user@test.com'))
  const emailStepRequest = result.current.codeFocusRequest
  act(() => result.current.onTurnstileToken('send-token'))
  expect(result.current.codeFocusRequest).toBe(emailStepRequest)
  await act(async () => { await result.current.sendCode() })

  act(() => result.current.onCodeChange('12'))
  const before = result.current.codeFocusRequest
  act(() => result.current.onTurnstileToken('code-token'))
  expect(result.current.codeFocusRequest).toBe(before + 1)
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
