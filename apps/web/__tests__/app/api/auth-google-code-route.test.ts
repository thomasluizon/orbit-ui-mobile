import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createHash } from 'node:crypto'

const setSessionCookies = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth-api', () => ({ setSessionCookies }))

import { GET } from '@/app/api/auth/google/start/route'
import { DELETE, POST } from '@/app/api/auth/google/code/route'
import { GOOGLE_OAUTH_COOKIE } from '@/lib/google-oauth-cookie'

const origin = 'https://staging.useorbit.org'
const loginResponse = {
  token: 'orbit-token', refreshToken: 'refresh-token',
  userId: 'user-1', name: 'Alex', email: 'alex@example.com',
}

function requestWithCookie(cookie: string, body: unknown) {
  const request = new NextRequest(`${origin}/api/auth/google/code`, {
    method: 'POST',
    headers: { cookie: `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(cookie)}` },
    body: JSON.stringify(body),
  })
  return request
}

async function start(purpose: 'signin' | 'calendar') {
  const response = GET(new NextRequest(`${origin}/api/auth/google/start?purpose=${purpose}`))
  const url = new URL(response.headers.get('location')!)
  const cookie = response.cookies.get(GOOGLE_OAUTH_COOKIE)!
  return { url, cookie, session: JSON.parse(cookie.value) as { verifier: string; state: string; redirectUri: string } }
}

describe('Google OAuth BFF', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'web-client-id')
    setSessionCookies.mockReset()
  })

  it.each(['signin', 'calendar'] as const)('builds a %s authorize URL with PKCE and state', async (purpose) => {
    const { url, cookie, session } = await start(purpose)
    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.pathname).toBe('/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe('web-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe(`${origin}/auth-callback`)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe(purpose === 'calendar'
      ? 'openid email profile https://www.googleapis.com/auth/calendar.readonly'
      : 'openid email profile')
    expect(url.searchParams.get('state')).toBe(session.state)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256').update(session.verifier).digest('base64url'))
    expect(url.searchParams.get('access_type')).toBe(purpose === 'calendar' ? 'offline' : null)
    expect(url.searchParams.get('include_granted_scopes')).toBe(purpose === 'calendar' ? 'true' : null)
    expect(url.searchParams.get('prompt')).toBe(purpose === 'calendar' ? 'consent' : null)
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.secure).toBe(true)
    expect(cookie.sameSite).toBe('lax')
    const second = await start(purpose)
    expect(second.session.state).not.toBe(session.state)
  })

  it('exchanges a matching code, forwards referral and language, and sets cookies', async () => {
    const { session, cookie } = await start('signin')
    const api = vi.fn().mockResolvedValue(new Response(JSON.stringify(loginResponse)))
    vi.stubGlobal('fetch', api)
    const response = await POST(requestWithCookie(cookie.value, {
      code: 'google-code', state: session.state, language: 'pt-BR', referralCode: 'REF123',
    }))
    expect(api).toHaveBeenCalledWith('http://localhost:5000/api/auth/google/code', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ code: 'google-code', codeVerifier: session.verifier,
        redirectUri: `${origin}/auth-callback`, language: 'pt-BR', referralCode: 'REF123' }),
    }))
    expect(setSessionCookies).toHaveBeenCalledWith('orbit-token', 'refresh-token')
    expect(await response.json()).toEqual({ userId: 'user-1', name: 'Alex', email: 'alex@example.com' })
    expect(response.cookies.get(GOOGLE_OAUTH_COOKIE)?.value).toBe('')
  })

  it('rejects a state mismatch before calling the API', async () => {
    const { cookie } = await start('signin')
    const api = vi.fn()
    vi.stubGlobal('fetch', api)
    const response = await POST(requestWithCookie(cookie.value, { code: 'google-code', state: 'wrong', language: 'en' }))
    expect(response.status).toBe(400)
    expect(api).not.toHaveBeenCalled()
    expect(setSessionCookies).not.toHaveBeenCalled()
  })

  it('leaves the session unset when the API rejects the code', async () => {
    const { session, cookie } = await start('signin')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'bad code' }), { status: 401 })))
    const response = await POST(requestWithCookie(cookie.value, { code: 'bad', state: session.state, language: 'en' }))
    expect(response.status).toBe(401)
    expect(setSessionCookies).not.toHaveBeenCalled()
    expect(response.cookies.get(GOOGLE_OAUTH_COOKIE)?.value).toBe('')
  })

  it('clears the pending attempt after a Google error', () => {
    const response = DELETE()
    expect(response.cookies.get(GOOGLE_OAUTH_COOKIE)?.value).toBe('')
    expect(setSessionCookies).not.toHaveBeenCalled()
  })
})
