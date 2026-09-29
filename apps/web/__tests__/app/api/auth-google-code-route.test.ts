import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createHash } from 'node:crypto'

const setSessionCookies = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/auth-api')>(), setSessionCookies,
}))

import { GET } from '@/app/api/auth/google/start/route'
import { DELETE, POST } from '@/app/api/auth/google/code/route'
import { GOOGLE_OAUTH_COOKIE } from '@/lib/google-oauth-cookie'

const origin = 'https://staging.useorbit.org'
const loginResponse = {
  token: 'orbit-token', refreshToken: 'refresh-token',
  userId: 'user-1', name: 'Alex', email: 'alex@example.com', wasReactivated: false,
}

function accountToken(accountId: string, marker: string) {
  const payload = Buffer.from(JSON.stringify({
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier': accountId,
    marker,
  })).toString('base64url')
  return `header.${payload}.signature`
}

function requestWithCookie(cookie: string, body: unknown, authToken?: string) {
  const request = new NextRequest(`${origin}/api/auth/google/code`, {
    method: 'POST',
    headers: { cookie: `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(cookie)}${authToken ? `; auth_token=${authToken}` : ''}` },
    body: JSON.stringify(body),
  })
  return request
}

async function start(purpose: 'signin' | 'calendar', authToken?: string) {
  const response = GET(new NextRequest(`http://0.0.0.0:10000/api/auth/google/start?purpose=${purpose}`, {
    headers: authToken ? { cookie: `auth_token=${authToken}` } : undefined,
  }))
  const url = new URL(response.headers.get('location')!)
  const cookie = response.cookies.get(GOOGLE_OAUTH_COOKIE)!
  return { url, cookie, session: JSON.parse(cookie.value) as { verifier: string; state: string; redirectUri: string } }
}

describe('Google OAuth BFF', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'web-client-id')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', origin)
    setSessionCookies.mockReset()
  })

  it('uses the configured production origin for the authorize URL and exchange', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.useorbit.org')
    const { url, session, cookie } = await start('signin')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.useorbit.org/auth-callback')
    expect(session.redirectUri).toBe('https://app.useorbit.org/auth-callback')

    const api = vi.fn().mockResolvedValue(new Response(JSON.stringify(loginResponse)))
    vi.stubGlobal('fetch', api)
    await POST(requestWithCookie(cookie.value, {
      code: 'google-code', state: session.state, language: 'en',
    }))
    expect(JSON.parse(String(api.mock.calls[0]?.[1]?.body))).toMatchObject({
      redirectUri: 'https://app.useorbit.org/auth-callback',
    })
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
    expect(await response.json()).toEqual({ userId: 'user-1', name: 'Alex', email: 'alex@example.com', wasReactivated: false })
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
    expect(response.cookies.get(GOOGLE_OAUTH_COOKIE)).toBeUndefined()
  })

  it('preserves a newer attempt after a stale callback and Google error', async () => {
    const first = await start('signin')
    const second = await start('calendar')
    const api = vi.fn()
    vi.stubGlobal('fetch', api)
    const stale = await POST(requestWithCookie(second.cookie.value, {
      code: 'old-code', state: first.session.state, language: 'en',
    }))
    const googleError = DELETE(new NextRequest(`${origin}/api/auth/google/code?state=${first.session.state}`, {
      method: 'DELETE', headers: { cookie: `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(second.cookie.value)}` },
    }))
    expect(stale.status).toBe(400)
    expect(stale.cookies.get(GOOGLE_OAUTH_COOKIE)).toBeUndefined()
    expect(googleError.cookies.get(GOOGLE_OAUTH_COOKIE)).toBeUndefined()
    expect(api).not.toHaveBeenCalled()
    api.mockResolvedValue(new Response(JSON.stringify(loginResponse)))
    const current = await POST(requestWithCookie(second.cookie.value, {
      code: 'new-code', state: second.session.state, language: 'en',
    }))
    expect(current.status).toBe(200)
    expect(setSessionCookies).toHaveBeenCalledWith('orbit-token', 'refresh-token')
  })

  it('rejects a callback after another login replaces the owning session', async () => {
    const { session, cookie } = await start('signin', accountToken('account-a', 'initial'))
    const api = vi.fn()
    vi.stubGlobal('fetch', api)
    const response = await POST(requestWithCookie(cookie.value, {
      code: 'google-code', state: session.state, language: 'en',
    }, accountToken('account-b', 'replacement')))
    expect(response.status).toBe(400)
    expect(api).not.toHaveBeenCalled()
    expect(setSessionCookies).not.toHaveBeenCalled()
    expect(response.cookies.get(GOOGLE_OAUTH_COOKIE)?.value).toBe('')
  })

  it('accepts a callback after the same account rotates its access token', async () => {
    const { session, cookie } = await start('calendar', accountToken('account-a', 'initial'))
    const api = vi.fn().mockResolvedValue(new Response(JSON.stringify(loginResponse)))
    vi.stubGlobal('fetch', api)
    const response = await POST(requestWithCookie(cookie.value, {
      code: 'google-code', state: session.state, language: 'en',
    }, accountToken('account-a', 'rotated')))
    expect(response.status).toBe(200)
    expect(api).toHaveBeenCalledOnce()
    expect(setSessionCookies).toHaveBeenCalledWith('orbit-token', 'refresh-token')
  })

  it('leaves the session unset when the API rejects the code', async () => {
    const { session, cookie } = await start('signin')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'bad code' }), { status: 401 })))
    const response = await POST(requestWithCookie(cookie.value, { code: 'bad', state: session.state, language: 'en' }))
    expect(response.status).toBe(401)
    expect(setSessionCookies).not.toHaveBeenCalled()
    expect(response.cookies.get(GOOGLE_OAUTH_COOKIE)?.value).toBe('')
  })

  it('clears the owned pending attempt after a Google error', async () => {
    const { session, cookie } = await start('signin')
    const response = DELETE(new NextRequest(`${origin}/api/auth/google/code?state=${session.state}`, {
      method: 'DELETE', headers: { cookie: `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(cookie.value)}` },
    }))
    expect(response.cookies.get(GOOGLE_OAUTH_COOKIE)?.value).toBe('')
    expect(setSessionCookies).not.toHaveBeenCalled()
  })
})
