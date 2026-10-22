import { expectApiVersion2Requests } from '@/__tests__/support/api-version'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/verify-code/route'
import { resolveSessionTokens, setSessionCookies } from '@/lib/auth-api'

vi.mock('@/lib/auth-api', () => ({
  AUTH_COOKIE: 'auth_token',
  REFRESH_COOKIE: 'refresh_token',
  resolveSessionTokens: vi.fn(),
  setSessionCookies: vi.fn(),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/auth/verify-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = { email: 'alex@example.com', code: '123456', language: 'en' }

beforeEach(() => {
  mockFetch.mockReset()
  vi.mocked(setSessionCookies).mockReset()
  vi.mocked(resolveSessionTokens).mockReset()
})

describe('verify-code BFF route', () => {
  it('sets httpOnly session cookies and returns the user without the token', async () => {
    const protectedBody = { ...validBody, turnstileToken: 'verify-token' }
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          token: 'jwt-token',
          refreshToken: 'refresh-token',
          userId: 'user-1',
          name: 'Alex',
          email: 'alex@example.com',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const response = await POST(makeRequest(protectedBody))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:5000/api/auth/verify-code',
      expect.objectContaining({ body: JSON.stringify(protectedBody) }),
    )
    expect(vi.mocked(setSessionCookies)).toHaveBeenCalledWith('jwt-token', 'refresh-token', expect.any(Object))
    expect(json).toMatchObject({ userId: 'user-1', name: 'Alex', email: 'alex@example.com' })
    expect(json).not.toHaveProperty('token')
    expect(json).not.toHaveProperty('refreshToken')
  })

  it('forwards the widget token unchanged', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ token: 'jwt', refreshToken: 'refresh' }), { status: 200 }))
    const protectedBody = { ...validBody, turnstileToken: 'fresh-token' }
    await POST(makeRequest(protectedBody))
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:5000/api/auth/verify-code',
      expect.objectContaining({ body: JSON.stringify(protectedBody) }))
  })

  it('rejects a malformed body with 400 before forwarding', async () => {
    const response = await POST(makeRequest({ email: 'alex@example.com' }))

    expect(response.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(vi.mocked(setSessionCookies)).not.toHaveBeenCalled()
  })

  it('passes through a backend error status and payload', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid verification code', errorCode: 'INVALID_VERIFICATION_CODE' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const response = await POST(makeRequest(validBody))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid verification code')
    expect(json.errorCode).toBe('INVALID_VERIFICATION_CODE')
    expect(vi.mocked(setSessionCookies)).not.toHaveBeenCalled()
  })

  it('returns a generic 500 and does not leak detail when the upstream throws', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED api-base'))

    const response = await POST(makeRequest(validBody))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Authentication failed')
    expect(JSON.stringify(json)).not.toContain('ECONNREFUSED')
  })
})


describe('signed-out validation language', () => {
  it.each(['en', 'pt-BR'])('forwards %s and preserves the validation contract', async (language) => {
    const { verificationValidationResponses } = await import('@orbit/shared/test-support/validation-fixtures')
    const payload = verificationValidationResponses[language as 'en' | 'pt-BR']
    mockFetch.mockResolvedValue(new Response(JSON.stringify(payload), { status: 400 }))
    const request = new NextRequest('https://app.useorbit.org/api/auth/verify-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept-Language': language, 'X-Orbit-Request-Id': payload.requestId },
      body: JSON.stringify({ ...validBody, code: '12345', language }),
    })
    const response = await POST(request)
    const forwarded = mockFetch.mock.calls.at(-1)?.[1] as RequestInit
    expect(new Headers(forwarded.headers).get('Accept-Language')).toBe(language)
    expect(await response.json()).toMatchObject(payload)
  })
})

afterEach(() => expectApiVersion2Requests(mockFetch.mock.calls))

it('preserves an existing cookie account before consuming an incoming code', async () => {
  vi.mocked(resolveSessionTokens).mockResolvedValue({ token: 'existing-token', expiresAt: 123, refreshed: false, refreshFailed: false })
  const request = makeRequest(validBody)
  request.cookies.set('auth_token', 'existing-token')
  const response = await POST(request)
  expect(response.status).toBe(409)
  expect(mockFetch).not.toHaveBeenCalled()
  expect(setSessionCookies).not.toHaveBeenCalled()
})

it('discards response cookies if cancellation arrives during cookie preparation', async () => {
  mockFetch.mockResolvedValue(Response.json({ token: 'test-token', refreshToken: null, userId: 'user-id', name: 'Person', email: 'alex@example.com', wasReactivated: false }))
  const controller = new AbortController()
  vi.mocked(setSessionCookies).mockImplementation(async (_token, _refreshToken, target) => {
    if (!target) throw new Error('Expected response-owned cookie target')
    target.set('auth_token', 'prepared-test-session', { httpOnly: true, sameSite: 'strict', secure: true, path: '/', maxAge: 300 })
    controller.abort()
  })
  const request = new NextRequest('https://app.example.test/api/auth/verify-code', { method: 'POST', body: JSON.stringify(validBody), signal: controller.signal })
  const response = await POST(request)
  expect(response.status).toBe(409)
  expect(response.headers.has('set-cookie')).toBe(false)
})
