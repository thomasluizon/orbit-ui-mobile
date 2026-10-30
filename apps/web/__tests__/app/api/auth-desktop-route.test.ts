import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as start } from '@/app/api/auth/google/start/route'
import { GET as callback } from '@/app/api/auth/desktop/callback/route'
import { POST as exchange } from '@/app/api/auth/desktop/exchange/route'
import { GOOGLE_OAUTH_COOKIE } from '@/lib/google-oauth-cookie'
import { proxy } from '@/proxy'
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

function attempt(browserSession?: string) {
  const site = process.env.NEXT_PUBLIC_SITE_URL
  const started = start(new NextRequest(`${site}/api/auth/google/start?purpose=signin&desktopState=${state}&codeChallenge=${codeChallenge}`, {
    headers: browserSession ? { cookie: `auth_token=${browserSession}` } : undefined,
  }))
  const cookie = started.cookies.get(GOOGLE_OAUTH_COOKIE)!
  const googleState = new URL(started.headers.get('location')!).searchParams.get('state')!
  const request = (query: string) => new NextRequest(`${site}/api/auth/desktop/callback?${query}`, {
    headers: { cookie: `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(cookie.value)}` },
  })
  return { cookie, googleState, request }
}

function redemption(body: unknown = { code: handoffCode, state, codeVerifier: verifier, redirectUri }, headers = {}) {
  return new NextRequest(`${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/desktop/exchange`, { method: 'POST', headers,
    body: typeof body === 'string' ? body : JSON.stringify(body) })
}

async function pageDestination(response: Response) {
  expect(response.status).toBe(200)
  expect(response.headers.get('location')).toBeNull()
  expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  expect(response.headers.get('set-cookie')).toContain(`${GOOGLE_OAUTH_COOKIE}=;`)
  const page = new DOMParser().parseFromString(await response.text(), 'text/html')
  const links = page.querySelectorAll('a')
  expect(links).toHaveLength(1)
  const destination = new URL(links[0]!.href)
  expect(page.querySelector('h1')?.textContent).toBe(destination.searchParams.has('error') ? 'Sign-in failed' : 'Signed in')
  expect(page.body.textContent).not.toContain(handoffCode)
  expect(page.body.textContent).not.toContain(account.token)
  expect(page.body.textContent).not.toContain(account.refreshToken)
  return destination
}

describe('desktop Google BFF handoff', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'web-client')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', origin)
    api.mockReset().mockResolvedValue(new Response(null, { status: 200 }))
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
    const browserHeaders = { cookie: `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(pending.cookie.value)}` }
    const redirect = await proxy(new NextRequest(`${origin}/auth-callback?code=google-code&state=${pending.googleState}&ignored=value`, {
      headers: browserHeaders,
    }))
    expect(redirect.status).toBe(307)
    expect(redirect.headers.get('location')).toBe(`${origin}/api/auth/desktop/callback?code=google-code&state=${pending.googleState}`)
    expect(await redirect.text()).toBe('')
    expect(redirect.headers.get('cache-control')).toBe('no-store')
    expect(redirect.headers.get('referrer-policy')).toBe('no-referrer')
    expect(redirect.headers.get('set-cookie')).toBeNull()
    expect(api).not.toHaveBeenCalled()
    api.mockResolvedValueOnce(Response.json(account)).mockResolvedValueOnce(Response.json({ code: handoffCode, expiresIn: 60 }))
    const returned = await callback(new NextRequest(redirect.headers.get('location')!, { headers: browserHeaders }))
    expect(returned.status).toBe(200)
    const document = new DOMParser().parseFromString(await returned.clone().text(), 'text/html')
    expect(document.querySelectorAll('script')).toHaveLength(0)
    const destination = await pageDestination(returned)
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

    const completedCalls = api.mock.calls.length
    const replay = await callback(new NextRequest(redirect.headers.get('location')!))
    expect(replay.status).toBe(400)
    expect(await replay.json()).toEqual({ error: 'Invalid OAuth state' })
    expect(api).toHaveBeenCalledTimes(completedCalls)

    api.mockResolvedValueOnce(Response.json(account))
    const session = await exchange(redemption())
    expect(session.status).toBe(200)
    expect(await session.json()).toEqual({})
    const redemptionCall = api.mock.calls.find(([url]) => url === 'http://localhost:5000/api/auth/desktop/exchange')
    expect(redemptionCall).toBeDefined()
    expect(JSON.parse(redemptionCall?.[1].body)).toEqual({ code: handoffCode, state, codeVerifier: verifier, redirectUri })
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

  it.each([false, true])('allows the completion script under every proxy and route policy, failure %s', async failed => {
    const pending = attempt()
    const incoming = pending.request(`${failed ? 'error=access_denied' : 'code=google-code'}&state=${pending.googleState}`)
    incoming.headers.set('x-nonce', 'untrusted-client-nonce')
    const secured = await proxy(incoming)
    const forwarded = new Headers()
    const overridden = secured.headers.get('x-middleware-override-headers')!.split(',')
    for (const name of overridden) {
      forwarded.set(name, secured.headers.get(`x-middleware-request-${name}`)!)
    }
    if (!failed) {
      api.mockResolvedValueOnce(Response.json(account)).mockResolvedValueOnce(Response.json({ code: handoffCode, expiresIn: 60 }))
    }
    const response = await callback(new NextRequest(incoming.url, { headers: forwarded }))
    const document = new DOMParser().parseFromString(await response.clone().text(), 'text/html')
    const scripts = document.querySelectorAll('script')
    expect(scripts).toHaveLength(1)
    const nonce = scripts[0]!.nonce
    const policies = [secured.headers.get('content-security-policy')!, response.headers.get('content-security-policy')]
      .filter((policy): policy is string => policy !== null)
    for (const policy of policies) {
      const scriptSources = policy.split(';').map(directive => directive.trim()).find(directive => directive.startsWith('script-src '))!.split(/\s+/)
      expect(scriptSources).toContain(`'nonce-${nonce}'`)
    }
    expect(nonce).toBe(forwarded.get('x-nonce'))
    expect(nonce).not.toBe('untrusted-client-nonce')
    expect(response.headers.get('content-security-policy')).toBeNull()
    expect((await pageDestination(response)).toString()).toBe(`${redirectUri}?state=${state}&${failed ? 'error=authentication_failed' : `code=${handoffCode}`}`)
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
    const document = new DOMParser().parseFromString(await response.clone().text(), 'text/html')
    expect(document.querySelectorAll('script')).toHaveLength(0)
    expect((await pageDestination(response)).toString()).toBe(`${redirectUri}?state=${state}&error=authentication_failed`)
    expect(api).not.toHaveBeenCalled()
  })

  it.each(['success', 'handoff failure', 'revoke rejection', 'revoke network failure'])
  ('revokes the temporary browser session after %s without losing a granted code', async (outcome) => {
    const pending = attempt()
    api.mockResolvedValueOnce(Response.json(account)).mockResolvedValueOnce(
      outcome === 'handoff failure' ? new Response(null, { status: 503 }) : Response.json({ code: handoffCode, expiresIn: 60 }),
    )
    if (outcome === 'revoke network failure') api.mockRejectedValueOnce(new Error('unavailable'))
    else api.mockResolvedValueOnce(new Response(null, { status: outcome === 'revoke rejection' ? 503 : 200 }))
    const response = await callback(pending.request(`code=google-code&state=${pending.googleState}`))
    expect((await pageDestination(response)).toString()).toBe(`${redirectUri}?state=${state}&${outcome === 'handoff failure' ? 'error=authentication_failed' : `code=${handoffCode}`}`)
    const revocation = api.mock.calls.find(([url]) => url === 'http://localhost:5000/api/auth/logout')
    expect(revocation).toBeDefined()
    expect(revocation?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ refreshToken: account.refreshToken }) })
  })

  it('completes when the browser strict session cookie is absent on the Google redirect', async () => {
    const pending = attempt('existing-browser-session')
    api.mockResolvedValueOnce(Response.json(account)).mockResolvedValueOnce(Response.json({ code: handoffCode, expiresIn: 60 }))
    const response = await callback(pending.request(`code=google-code&state=${pending.googleState}`))
    expect((await pageDestination(response)).toString()).toBe(`${redirectUri}?state=${state}&code=${handoffCode}`)
    expect(response.cookies.get('auth_token')).toBeUndefined()
  })

  it('keeps production handoff and redemption on the production callback', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.useorbit.org')
    const pending = attempt()
    const productionRedirect = 'org.useorbit.desktop://auth/callback'
    api.mockResolvedValueOnce(Response.json(account)).mockResolvedValueOnce(Response.json({ code: handoffCode, expiresIn: 60 }))
    const response = await callback(pending.request(`code=google-code&state=${pending.googleState}`))
    expect((await pageDestination(response)).toString()).toBe(`${productionRedirect}?state=${state}&code=${handoffCode}`)
    api.mockResolvedValueOnce(Response.json(account))
    const session = await exchange(redemption({ code: handoffCode, state, codeVerifier: verifier, redirectUri: productionRedirect }))
    expect(session.status).toBe(200)
    expect(session.cookies.get('auth_token')?.httpOnly).toBe(true)
  })

  it.each(['google', 'handoff', 'network', 'malformed'])('handles %s failures without leaking credentials', async (failure) => {
    const pending = attempt()
    if (failure === 'network') api.mockRejectedValue(new Error('unavailable'))
    else if (failure === 'google') api.mockResolvedValue(Response.json({ token: 'secret' }, { status: 401 }))
    else api.mockResolvedValueOnce(Response.json(account)).mockResolvedValueOnce(
      failure === 'handoff' ? new Response(null, { status: 503 }) : Response.json({ code: 'bad', expiresIn: 60 }),
    )
    const response = await callback(pending.request(`code=google-code&state=${pending.googleState}`))
    expect((await pageDestination(response)).toString()).toBe(`${redirectUri}?state=${state}&error=authentication_failed`)
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
