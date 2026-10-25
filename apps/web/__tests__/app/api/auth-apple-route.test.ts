import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/auth/apple/start/route'
import { POST } from '@/app/api/auth/apple/handoff/route'
import { APPLE_OAUTH_COOKIE } from '@/lib/apple-oauth-cookie'

const mocks = vi.hoisted(() => ({ setSessionCookies: vi.fn(), fetch: vi.fn() }))
vi.mock('@/lib/auth-api', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/auth-api')>(), setSessionCookies: mocks.setSessionCookies }))
const origin = 'https://app.useorbit.org'
const login = { token: 'session-token', refreshToken: 'refresh-token', userId: 'account-1', name: 'Person', email: 'person@example.test', wasReactivated: false }

async function start() {
  mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ authorizationUrl: 'https://appleid.apple.com/auth/authorize?state=server-state' })))
  const response = await GET(new NextRequest(`${origin}/api/auth/apple/start?language=pt-BR`, { headers: { cookie: 'referral_code=REF123' } }))
  const cookie = response.cookies.get(APPLE_OAUTH_COOKIE)!
  return { response, cookie, state: (JSON.parse(cookie.value) as { state: string }).state }
}
function handoff(cookie: string, state: string, sessionCookie = '') {
  return new NextRequest(`${origin}/api/auth/apple/handoff`, { method: 'POST',
    headers: { cookie: `${APPLE_OAUTH_COOKIE}=${encodeURIComponent(cookie)}${sessionCookie}` },
    body: JSON.stringify({ handoff: 'single-use-handoff', state }) })
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', 'services-id')
  vi.stubGlobal('fetch', mocks.fetch)
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('Apple BFF session handoff', () => {
  it('hides an unconfigured provider at its start boundary', async () => {
    vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', '')
    const response = await GET(new NextRequest(`${origin}/api/auth/apple/start`))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toContain('/login?appleError=1')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('starts a state-bound flow with a secure temporary cookie', async () => {
    const { response, cookie, state } = await start()
    expect(response.headers.get('location')).toBe('https://appleid.apple.com/auth/authorize?state=server-state')
    expect(state).toHaveLength(64)
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', maxAge: 300 })
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/auth/apple/start'), expect.objectContaining({
      body: JSON.stringify({ state, language: 'pt-BR', referralCode: 'REF123' }),
    }))
  })

  it('rejects a state mismatch without exchanging the handoff or setting a session', async () => {
    const { cookie } = await start()
    mocks.fetch.mockClear()
    const response = await POST(handoff(cookie.value, 'wrong-state-is-long-enough'))
    expect(response.status).toBe(400)
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.setSessionCookies).not.toHaveBeenCalled()
  })

  it('rejects a different session owner', async () => {
    const { cookie, state } = await start()
    mocks.fetch.mockClear()
    const response = await POST(handoff(cookie.value, state, '; refresh_token=different-session'))
    expect(response.status).toBe(409)
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.setSessionCookies).not.toHaveBeenCalled()
  })

  it('sets the session from the API handoff and returns no credentials', async () => {
    const { cookie, state } = await start()
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify(login)))
    const response = await POST(handoff(cookie.value, state))
    expect(response.status).toBe(200)
    expect(mocks.fetch).toHaveBeenLastCalledWith(expect.stringContaining('/api/auth/apple/handoff'), expect.objectContaining({
      body: JSON.stringify({ handoff: 'single-use-handoff', state }),
    }))
    expect(mocks.setSessionCookies).toHaveBeenCalledWith('session-token', 'refresh-token', response.cookies)
    expect(await response.json()).toEqual({ userId: 'account-1', name: 'Person', email: 'person@example.test', wasReactivated: false })
    expect(response.cookies.get(APPLE_OAUTH_COOKIE)?.value).toBe('')
  })

  it('keeps the user signed out when the handoff expires upstream', async () => {
    const { cookie, state } = await start()
    mocks.fetch.mockResolvedValueOnce(new Response('{}', { status: 401 }))
    const response = await POST(handoff(cookie.value, state))
    expect(response.status).toBe(401)
    expect(mocks.setSessionCookies).not.toHaveBeenCalled()
  })
})
