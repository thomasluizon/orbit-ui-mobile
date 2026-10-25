import { expectApiVersion2Requests } from '@/__tests__/support/api-version'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createHash } from 'node:crypto'

const setSessionCookies = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/auth-api')>(), setSessionCookies,
}))

import { GET } from '@/app/api/auth/google/start/route'
import { DELETE, POST } from '@/app/api/auth/google/code/route'
import { GOOGLE_OAUTH_COOKIE } from '@/lib/google-oauth-cookie'

const api = vi.fn()

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

function requestWithCookie(cookie: string, body: unknown, authToken?: string, refreshToken?: string) {
  const request = new NextRequest(`${origin}/api/auth/google/code`, {
    method: 'POST',
    headers: { cookie: `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(cookie)}${authToken ? `; auth_token=${authToken}` : ''}${refreshToken ? `; refresh_token=${refreshToken}` : ''}` },
    body: JSON.stringify(body),
  })
  return request
}

async function start(purpose: 'signin' | 'calendar', authToken?: string, refreshToken?: string) {
  const response = GET(new NextRequest(`http://0.0.0.0:10000/api/auth/google/start?purpose=${purpose}`, {
    headers: { cookie: [authToken ? `auth_token=${authToken}` : '', refreshToken ? `refresh_token=${refreshToken}` : ''].filter(Boolean).join('; ') },
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
    api.mockReset()
    vi.stubGlobal('fetch', api)
    vi.spyOn(process.stderr, 'write').mockClear().mockImplementation(() => true)
  })

  it('uses the configured production origin for the authorize URL and exchange', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.useorbit.org')
    const { url, session, cookie } = await start('signin')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.useorbit.org/auth-callback')
    expect(session.redirectUri).toBe('https://app.useorbit.org/auth-callback')

    api.mockResolvedValue(new Response(JSON.stringify(loginResponse)))
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
    api.mockResolvedValue(new Response(JSON.stringify(loginResponse)))
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
    expect(process.stderr.write).not.toHaveBeenCalled()
  })

  it('rejects a state mismatch before calling the API', async () => {
    const { cookie } = await start('signin')
    const response = await POST(requestWithCookie(cookie.value, { code: 'google-code', state: 'wrong', language: 'en' }))
    expect(response.status).toBe(400)
    expect(api).not.toHaveBeenCalled()
    expect(setSessionCookies).not.toHaveBeenCalled()
    expect(response.cookies.get(GOOGLE_OAUTH_COOKIE)).toBeUndefined()
    const { requestId } = await response.json()
    expect(process.stderr.write).toHaveBeenCalledExactlyOnceWith(JSON.stringify({
      event: 'google_oauth_failed', step: 'state', reason: 'state_mismatch', status: 400, requestId,
    }) + '\n')
  })

  it('preserves a newer attempt after a stale callback and Google error', async () => {
    const first = await start('signin')
    const second = await start('calendar')
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
    const response = await POST(requestWithCookie(cookie.value, {
      code: 'google-code', state: session.state, language: 'en',
    }, accountToken('account-b', 'replacement')))
    expect(response.status).toBe(400)
    expect(api).not.toHaveBeenCalled()
    expect(setSessionCookies).not.toHaveBeenCalled()
    expect(response.cookies.get(GOOGLE_OAUTH_COOKIE)?.value).toBe('')
    const { requestId } = await response.json()
    expect(process.stderr.write).toHaveBeenCalledExactlyOnceWith(JSON.stringify({
      event: 'google_oauth_failed', step: 'session', reason: 'session_changed', status: 400, requestId,
    }) + '\n')
  })

  it('accepts a callback after the same account rotates its access token', async () => {
    const { session, cookie } = await start('calendar', accountToken('account-a', 'initial'), 'initial-refresh')
    api.mockResolvedValue(new Response(JSON.stringify(loginResponse)))
    const response = await POST(requestWithCookie(cookie.value, {
      code: 'google-code', state: session.state, language: 'en',
    }, accountToken('account-a', 'rotated'), 'rotated-refresh'))
    expect(response.status).toBe(200)
    expect(api).toHaveBeenCalledOnce()
    expect(setSessionCookies).toHaveBeenCalledWith('orbit-token', 'refresh-token')
  })

  it.each(['signin', 'calendar'] as const)('accepts %s after the access cookie expires while the refresh cookie remains', async (purpose) => {
    const { session, cookie } = await start(purpose, accountToken('account-a', 'initial'), 'owning-refresh')
    expect(cookie.value).not.toContain('owning-refresh')
    api.mockResolvedValue(new Response(JSON.stringify(loginResponse)))
    const response = await POST(requestWithCookie(cookie.value, {
      code: 'google-code', state: session.state, language: 'en',
    }, undefined, 'owning-refresh'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ userId: 'user-1', name: 'Alex', email: 'alex@example.com', wasReactivated: false })
    expect(setSessionCookies).toHaveBeenCalledWith('orbit-token', 'refresh-token')
    expect(response.cookies.get(GOOGLE_OAUTH_COOKIE)?.value).toBe('')
  })

  it.each(['not-json', '{}'])('logs an invalid pending cookie without attempting an exchange: %s', async (cookie) => {
    const response = await POST(requestWithCookie(cookie, { code: 'google-code', state: 'state', language: 'en' }))
    expect(response.status).toBe(400)
    expect(api).not.toHaveBeenCalled()
    expect(setSessionCookies).not.toHaveBeenCalled()
    expect(response.cookies.get(GOOGLE_OAUTH_COOKIE)).toBeUndefined()
    const { requestId } = await response.json()
    expect(process.stderr.write).toHaveBeenCalledExactlyOnceWith(JSON.stringify({
      event: 'google_oauth_failed', step: 'state', reason: 'pending_cookie_invalid', status: 400, requestId,
    }) + '\n')
  })

  it('logs an invalid callback without clearing the pending attempt', async () => {
    const { session, cookie } = await start('signin')
    const response = await POST(requestWithCookie(cookie.value, { state: session.state }))
    expect(response.status).toBe(400)
    expect(api).not.toHaveBeenCalled()
    expect(response.cookies.get(GOOGLE_OAUTH_COOKIE)).toBeUndefined()
    const { requestId } = await response.json()
    expect(process.stderr.write).toHaveBeenCalledExactlyOnceWith(JSON.stringify({
      event: 'google_oauth_failed', step: 'state', reason: 'callback_invalid', status: 400, requestId,
    }) + '\n')
  })

  it.each([undefined, 'replacement-refresh'])('rejects an expired access cookie with a missing or replaced refresh cookie: %s', async (refreshToken) => {
    const { session, cookie } = await start('signin', accountToken('account-a', 'initial'), 'owning-refresh')
    const response = await POST(requestWithCookie(cookie.value, {
      code: 'google-code', state: session.state, language: 'en',
    }, undefined, refreshToken))
    expect(response.status).toBe(400)
    expect(api).not.toHaveBeenCalled()
    expect(setSessionCookies).not.toHaveBeenCalled()
    expect(response.cookies.get(GOOGLE_OAUTH_COOKIE)?.value).toBe('')
  })

  it('rejects another account even when the previous refresh cookie remains', async () => {
    const { session, cookie } = await start('signin', accountToken('account-a', 'initial'), 'owning-refresh')
    const response = await POST(requestWithCookie(cookie.value, {
      code: 'google-code', state: session.state, language: 'en',
    }, accountToken('account-b', 'replacement'), 'owning-refresh'))
    expect(response.status).toBe(400)
    expect(api).not.toHaveBeenCalled()
    expect(setSessionCookies).not.toHaveBeenCalled()
  })

  it('leaves the session unset when the API rejects the code', async () => {
    const { session, cookie } = await start('signin')
    api.mockResolvedValue(new Response(JSON.stringify({ error: 'Could not exchange Google sign-in code',
      errorCode: 'GOOGLE_CODE_EXCHANGE_FAILED', requestId: 'upstream-request' }), {
      status: 401, headers: { 'X-Orbit-Request-Id': 'upstream-request' },
    }))
    const response = await POST(requestWithCookie(cookie.value, { code: 'bad', state: session.state, language: 'en' }))
    expect(response.status).toBe(401)
    expect(setSessionCookies).not.toHaveBeenCalled()
    expect(response.cookies.get(GOOGLE_OAUTH_COOKIE)?.value).toBe('')
    expect(process.stderr.write).toHaveBeenCalledExactlyOnceWith(JSON.stringify({
      event: 'google_oauth_failed', step: 'api', reason: 'upstream_rejected', status: 401, requestId: 'upstream-request',
    }) + '\n')
  })

  it.each(['transport', 'response', 'cookies'] as const)('logs a safe reason for a failure during %s', async (step) => {
    const { session, cookie } = await start('signin')
    const sensitive = 'private-code-cookie-token'
    if (step === 'transport') api.mockRejectedValue(new Error(sensitive))
    else if (step === 'response') api.mockResolvedValue(new Response(sensitive))
    else {
      api.mockResolvedValue(new Response(JSON.stringify(loginResponse)))
      setSessionCookies.mockRejectedValue(new Error(sensitive))
    }
    const response = await POST(requestWithCookie(cookie.value, {
      code: sensitive, state: session.state, language: 'en',
    }))
    expect(response.status).toBe(500)
    expect(response.cookies.get(GOOGLE_OAUTH_COOKIE)?.value).toBe('')
    const { requestId } = await response.json()
    expect(process.stderr.write).toHaveBeenCalledExactlyOnceWith(JSON.stringify({
      event: 'google_oauth_failed', step, reason: 'exception', status: 500, requestId,
    }) + '\n')
    expect(JSON.stringify(vi.mocked(process.stderr.write).mock.calls)).not.toContain(sensitive)
    expect(JSON.stringify(vi.mocked(process.stderr.write).mock.calls)).not.toContain(session.verifier)
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

afterEach(() => {
  expectApiVersion2Requests(api.mock.calls)
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
