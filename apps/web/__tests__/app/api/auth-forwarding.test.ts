import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as sendCode } from '@/app/api/auth/send-code/route'
import { POST as verifyCode } from '@/app/api/auth/verify-code/route'
import { POST as googleCode } from '@/app/api/auth/google/code/route'
import { GET as startGoogle } from '@/app/api/auth/google/start/route'
import { POST as proxy } from '@/app/api/[...path]/route'
import { GOOGLE_OAUTH_COOKIE } from '@/lib/google-oauth-cookie'

vi.mock('@/lib/auth-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/auth-api')>(),
  setSessionCookies: vi.fn(),
  resolveServerSession: vi.fn(async () => ({
    token: null, expiresAt: null, refreshed: false, refreshFailed: false,
  })),
}))

const forwardingSecret = 'test-server-forwarding-secret'
const mockFetch = vi.fn<typeof fetch>()
const loginResponse = {
  token: 'orbit-token', refreshToken: 'refresh-token',
  userId: 'user-1', name: 'Alex', email: 'alex@example.com', wasReactivated: false,
}
const signInPaths = [
  'auth/send-code', 'auth/verify-code', 'auth/google/code', 'auth/google',
  'auth/operations/send-code', 'auth/operations/verify-code',
  'auth/operations/google', 'auth/operations/google/code',
]

async function callRoute(path: string, incomingHeaders: Record<string, string> = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json', ...incomingHeaders })
  let body: Record<string, unknown> = { email: 'alex@example.com', code: '123456', language: 'en' }
  if (path === 'auth/google/code') {
    const started = startGoogle(new NextRequest('https://app.example.com/api/auth/google/start?purpose=signin'))
    const cookie = started.cookies.get(GOOGLE_OAUTH_COOKIE)!
    const session = JSON.parse(cookie.value) as { state: string }
    headers.set('cookie', `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(cookie.value)}`)
    body = { code: 'google-code', state: session.state, language: 'en' }
  }
  const request = new NextRequest(`https://app.example.com/api/${path}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  })
  if (path === 'auth/send-code') return sendCode(request)
  if (path === 'auth/verify-code') return verifyCode(request)
  if (path === 'auth/google/code') return googleCode(request)
  return proxy(request, { params: Promise.resolve({ path: path.split('/') }) })
}

function upstreamHeaders() {
  expect(mockFetch).toHaveBeenCalledTimes(1)
  const [url, options] = mockFetch.mock.calls[0]!
  expect(url).toEqual(expect.stringContaining('https://api.example.com/api/auth/'))
  return new Headers(options?.headers)
}

describe.each(signInPaths)('%s authenticated visitor forwarding', (path) => {
  beforeEach(() => {
    vi.stubEnv('BFF_FORWARDING_SECRET', forwardingSecret)
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'test-client')
    vi.stubEnv('API_BASE', 'https://api.example.com')
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
    mockFetch.mockImplementation(async () => new Response(JSON.stringify(loginResponse), {
      headers: { 'X-Orbit-Bff-Secret': forwardingSecret },
    }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it.each(['198.51.100.8', '2001:db8::8', '::ffff:198.51.100.8'])(
    'forwards the Cloudflare address %s with the server secret', async (address) => {
      const response = await callRoute(path, {
        'CF-Connecting-IP': address,
        'X-Orbit-Client-Ip': '203.0.113.99',
        'X-Orbit-Bff-Secret': 'browser-secret',
        'X-Forwarded-For': '203.0.113.99',
        'X-Real-IP': '203.0.113.99',
      })
      expect(response.status).toBe(200)
      expect(upstreamHeaders().get('X-Orbit-Client-Ip')).toBe(address)
      expect(upstreamHeaders().get('X-Orbit-Bff-Secret')).toBe(forwardingSecret)
      expect(response.headers.get('X-Orbit-Bff-Secret')).toBeNull()
      expect(await response.text()).not.toContain(forwardingSecret)
    },
  )

  it.each([undefined, '', 'invalid', '999.1.1.1', '198.51.100.8, 203.0.113.9', '[2001:db8::8]', '198.51.100.8:443'])(
    'omits the IP when the Cloudflare address is %s without trusting browser alternatives', async (address) => {
      await callRoute(path, {
        ...(address === undefined ? {} : { 'CF-Connecting-IP': address }),
        'X-Forwarded-For': '203.0.113.99',
        'X-Real-IP': '203.0.113.99',
        'X-Orbit-Client-Ip': '203.0.113.99',
      })
      expect(upstreamHeaders().get('X-Orbit-Client-Ip')).toBeNull()
      expect(upstreamHeaders().get('X-Orbit-Bff-Secret')).toBe(forwardingSecret)
    },
  )

  it('does not take a forwarding secret from the visitor when none is configured', async () => {
    vi.stubEnv('BFF_FORWARDING_SECRET', undefined)
    await callRoute(path, { 'X-Orbit-Bff-Secret': 'browser-secret' })
    expect(upstreamHeaders().get('X-Orbit-Bff-Secret')).toBeNull()
  })

  it('does not expose the secret through error responses or logs', async () => {
    const logs = ['log', 'info', 'warn', 'error', 'debug'] as const
    const spies = logs.map((method) => vi.spyOn(console, method).mockImplementation(() => {}))
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Please wait' }), {
      status: 429, headers: { 'X-Orbit-Bff-Secret': forwardingSecret },
    }))
    const response = await callRoute(path, { 'CF-Connecting-IP': '198.51.100.8' })
    expect(response.status).toBe(429)
    expect(upstreamHeaders().get('X-Orbit-Bff-Secret')).toBe(forwardingSecret)
    expect(await response.text()).not.toContain(forwardingSecret)
    expect(response.headers.get('X-Orbit-Bff-Secret')).toBeNull()
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})

it.each(['auth/send-code', 'auth/verify-code', 'auth/google/code'])(
  '%s keeps fetch failure details private even when they contain the secret', async (path) => {
    vi.stubEnv('BFF_FORWARDING_SECRET', forwardingSecret)
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'test-client')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(forwardingSecret)))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = await callRoute(path, { 'CF-Connecting-IP': '198.51.100.8' })
      expect(response.status).toBe(500)
      expect(await response.text()).not.toContain(forwardingSecret)
      expect(errorLog).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    }
  },
)
