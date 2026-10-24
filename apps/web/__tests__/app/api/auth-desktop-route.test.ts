import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as start } from '@/app/api/auth/google/start/route'
import { GET as callback } from '@/app/api/auth/desktop/callback/route'
import { POST as exchange } from '@/app/api/auth/desktop/exchange/route'
import { GOOGLE_OAUTH_COOKIE } from '@/lib/google-oauth-cookie'
import { expectApiVersion2Requests } from '@/__tests__/support/api-version'

const api = vi.fn()
const origin = 'https://app-staging.useorbit.org'
const redirectUri = 'org.useorbit.desktop.staging://auth/callback'
const state = 'a'.repeat(64)
const verifier = 'v'.repeat(64)
const codeChallenge = createHash('sha256').update(verifier).digest('base64url')
const handoffCode = 'C'.repeat(64)
const account = { userId: 'user-1', token: 'access-token', name: 'Person', email: 'person@example.com',
  wasReactivated: false, refreshToken: 'refresh-token' }

function attempt() {
  const started = start(new NextRequest(`${origin}/api/auth/google/start?purpose=signin&desktopState=${state}&codeChallenge=${codeChallenge}`))
  const cookie = started.cookies.get(GOOGLE_OAUTH_COOKIE)!
  const googleState = new URL(started.headers.get('location')!).searchParams.get('state')!
  const request = (query: string) => new NextRequest(`${origin}/api/auth/desktop/callback?${query}`, {
    headers: { cookie: `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(cookie.value)}` },
  })
  return { cookie, googleState, request }
}

function redemption(body: unknown = { code: handoffCode, state, codeVerifier: verifier, redirectUri }, headers = {}) {
  return new NextRequest(`${origin}/api/auth/desktop/exchange`, { method: 'POST', headers,
    body: typeof body === 'string' ? body : JSON.stringify(body) })
}

describe('desktop Google BFF handoff', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'web-client')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', origin)
    api.mockReset()
    vi.stubGlobal('fetch', api)
  })
  afterEach(() => {
    expectApiVersion2Requests(api.mock.calls)
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('runs browser PKCE, returns only a bound one-use code, and redeems into httpOnly cookies', async () => {
    const pending = attempt()
    const googleSession = JSON.parse(pending.cookie.value)
    expect(googleSession.desktop).toEqual({ state, codeChallenge, redirectUri })
    expect(pending.cookie.httpOnly).toBe(true)
    api.mockResolvedValueOnce(Response.json(account)).mockResolvedValueOnce(Response.json({ code: handoffCode, expiresIn: 60 }))
    const returned = await callback(pending.request(`code=google-code&state=${pending.googleState}`))
    const destination = new URL(returned.headers.get('location')!)
    expect(destination.toString()).toBe(`${redirectUri}?state=${state}&code=${handoffCode}`)
    expect(api.mock.calls[0]?.[0]).toBe('http://localhost:5000/api/auth/google/code')
    expect(JSON.parse(api.mock.calls[0]?.[1].body)).toMatchObject({ codeVerifier: googleSession.verifier,
      redirectUri: `${origin}/auth-callback`, code: 'google-code' })
    expect(api.mock.calls[1]?.[1].headers.Authorization).toBe(`Bearer ${account.token}`)
    expect(JSON.parse(api.mock.calls[1]?.[1].body)).toEqual({ state, codeChallenge, redirectUri, codeChallengeMethod: 'S256' })
    expect(returned.cookies.get(GOOGLE_OAUTH_COOKIE)?.value).toBe('')
    expect(returned.cookies.get('auth_token')).toBeUndefined()
    expect(returned.headers.get('cache-control')).toBe('no-store')
    expect(returned.headers.get('referrer-policy')).toBe('no-referrer')
    expect(destination.toString()).not.toContain(account.token)
    expect(destination.toString()).not.toContain(account.refreshToken)

    api.mockResolvedValueOnce(Response.json(account))
    const session = await exchange(redemption())
    expect(session.status).toBe(200)
    expect(await session.json()).toEqual({})
    expect(api.mock.calls[2]?.[0]).toBe('http://localhost:5000/api/auth/desktop/exchange')
    expect(JSON.parse(api.mock.calls[2]?.[1].body)).toEqual({ code: handoffCode, state, codeVerifier: verifier, redirectUri })
    for (const name of ['auth_token', 'refresh_token']) {
      expect(session.cookies.get(name)).toMatchObject({ httpOnly: true, secure: true, sameSite: 'strict', path: '/' })
    }
  })

  it.each(['desktopState=bad&codeChallenge=bad', `desktopState=${state}`, `codeChallenge=${codeChallenge}`])
  ('rejects malformed desktop parameters: %s', (query) => {
    const response = start(new NextRequest(`${origin}/api/auth/google/start?purpose=signin&${query}`))
    expect(response.status).toBe(400)
    expect(response.cookies.get(GOOGLE_OAUTH_COOKIE)).toBeUndefined()
  })

  it('rejects desktop calendar scope and unrecognised deployment origins', () => {
    expect(start(new NextRequest(`${origin}/api/auth/google/start?purpose=calendar&desktopState=${state}&codeChallenge=${codeChallenge}`)).status).toBe(400)
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://other.example')
    expect(start(new NextRequest(`${origin}/api/auth/google/start?purpose=signin&desktopState=${state}&codeChallenge=${codeChallenge}`)).status).toBe(400)
  })

  it('preserves the current attempt on a mismatched state or environment', async () => {
    const pending = attempt()
    for (const query of ['code=google-code&state=wrong', 'code=google-code']) {
      const response = await callback(pending.request(query))
      expect(response.status).toBe(400)
      expect(response.cookies.get(GOOGLE_OAUTH_COOKIE)).toBeUndefined()
    }
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.useorbit.org')
    expect((await callback(pending.request(`code=google-code&state=${pending.googleState}`))).status).toBe(400)
    expect(api).not.toHaveBeenCalled()
  })

  it('returns browser cancellation to the owning native attempt', async () => {
    const pending = attempt()
    const response = await callback(pending.request(`error=access_denied&state=${pending.googleState}`))
    expect(response.headers.get('location')).toBe(`${redirectUri}?state=${state}&error=authentication_failed`)
    expect(api).not.toHaveBeenCalled()
  })

  it.each(['google', 'handoff', 'network', 'malformed'])('handles %s failures without leaking credentials', async (failure) => {
    const pending = attempt()
    if (failure === 'network') api.mockRejectedValue(new Error('unavailable'))
    else if (failure === 'google') api.mockResolvedValue(Response.json({ token: 'secret' }, { status: 401 }))
    else api.mockResolvedValueOnce(Response.json(account)).mockResolvedValueOnce(
      failure === 'handoff' ? new Response(null, { status: 503 }) : Response.json({ code: 'bad', expiresIn: 60 }),
    )
    const response = await callback(pending.request(`code=google-code&state=${pending.googleState}`))
    expect(response.headers.get('location')).toBe(`${redirectUri}?state=${state}&error=authentication_failed`)
    expect(response.cookies.get('auth_token')).toBeUndefined()
  })

  it.each([401, 429, 503])('does not set a cookie on exchange rejection %s, including expiry and replay', async (status) => {
    api.mockResolvedValue(Response.json({ token: 'secret' }, { status }))
    const response = await exchange(redemption())
    expect(response.status).toBe(status)
    expect(response.cookies.get('auth_token')).toBeUndefined()
    expect(await response.json()).toEqual({ error: 'Desktop sign-in failed' })
  })

  it.each(['bad-json', { code: 'invalid' }, { code: handoffCode, state, codeVerifier: verifier, redirectUri: 'org.useorbit.desktop://auth/callback' }])
  ('rejects invalid exchange input before reaching the API', async (body) => {
    expect((await exchange(redemption(body))).status).toBe(400)
    expect(api).not.toHaveBeenCalled()
  })

  it('rejects foreign browser origins and malformed upstream sessions', async () => {
    expect((await exchange(redemption(undefined, { origin: 'https://other.example' }))).status).toBe(400)
    expect(api).not.toHaveBeenCalled()
    api.mockResolvedValue(Response.json({ token: 'secret' }))
    const response = await exchange(redemption())
    expect(response.status).toBe(500)
    expect(response.cookies.get('auth_token')).toBeUndefined()
  })
})
