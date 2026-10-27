import { render, screen } from '@testing-library/react'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/auth/google/start/route'
import { GET as startApple } from '@/app/api/auth/apple/start/route'
import { APPLE_OAUTH_COOKIE } from '@/lib/apple-oauth-cookie'
import { GOOGLE_OAUTH_COOKIE } from '@/lib/google-oauth-cookie'
import { proxy } from '@/proxy'
import AuthCallbackPage from '@/app/(auth)/auth-callback/page'

const mocks = vi.hoisted(() => ({ cookies: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: mocks.cookies }))
vi.mock('@/app/(auth)/auth-callback/auth-callback-content', () => ({
  AuthCallbackContent: ({ pendingWebState }: { pendingWebState: string | null }) =>
    <div>{pendingWebState ?? 'no web attempt'}</div>,
}))

function googleAttempt(desktop = true) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL!
  const query = desktop ? `&desktopState=${'a'.repeat(64)}&codeChallenge=${'b'.repeat(43)}` : ''
  const started = GET(new NextRequest(`${origin}/api/auth/google/start?purpose=signin${query}`))
  const pending = started.cookies.get(GOOGLE_OAUTH_COOKIE)!
  const state = new URL(started.headers.get('location')!).searchParams.get('state')!
  const headers = { cookie: `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(pending.value)}` }
  return { pending, state, headers, origin }
}

describe('OAuth callback ownership', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'test-client')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.useorbit.org')
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
  it.each(['https://app.useorbit.org', 'https://app-staging.useorbit.org'])
  ('redirects a desktop Google callback before rendering on %s', async (origin) => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', origin)
    const { state, headers } = googleAttempt()
    const query = new URLSearchParams({ code: '4/code+with spaces', state })
    const callbackRequest = new NextRequest(`${origin}/auth-callback?${query}`, { headers })
    const response = await proxy(callbackRequest)
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(`${origin}/api/auth/desktop/callback?${query}`)
    expect(response.headers.get('x-middleware-next')).toBeNull()
    expect(await response.text()).toBe('')
  })
  it.each(['error=access_denied', ''])('forwards desktop cancellation or missing code to the callback: %s', async (query) => {
    const { origin, state, headers } = googleAttempt()
    const response = await proxy(new NextRequest(`${origin}/auth-callback?state=${state}&${query}`, { headers }))
    expect(response.status).toBe(307)
    const destination = new URL(response.headers.get('location')!)
    expect(destination.pathname).toBe('/api/auth/desktop/callback')
    expect(destination.searchParams.get('state')).toBe(state)
    expect(destination.searchParams.get('error')).toBe(query ? 'access_denied' : null)
    expect(response.headers.get('set-cookie')).toBeNull()
  })
  it.each(['missing', 'wrong', 'duplicate'])('preserves the pending desktop attempt for a %s state', async (condition) => {
    const { origin, state, headers } = googleAttempt()
    const query = condition === 'missing' ? '' : condition === 'wrong' ? 'state=other' : `state=${state}&state=${state}`
    const response = await proxy(new NextRequest(`${origin}/auth-callback?code=google-code&${query}`, { headers }))
    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('set-cookie')).toBeNull()
  })
  it.each(['/auth-callback/notion', '/api/auth/desktop/callback'])('does not intercept %s with a desktop cookie', async (path) => {
    const { origin, state, headers } = googleAttempt()
    const response = await proxy(new NextRequest(`${origin}${path}?code=google-code&state=${state}`, { headers }))
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('location')).toBeNull()
  })
  it('rejects a malformed desktop proof even with a matching OAuth state', async () => {
    const { origin, pending, state } = googleAttempt()
    const stored = JSON.parse(pending.value) as { desktop: { state: string } }
    stored.desktop.state = 'invalid'
    const response = await proxy(new NextRequest(`${origin}/auth-callback?code=google-code&state=${state}`, {
      headers: { cookie: `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(JSON.stringify(stored))}` },
    }))
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('set-cookie')).toBeNull()
  })
  it('passes only the state of the attempt created by the web start route', async () => {
    const { origin, pending, state, headers } = googleAttempt(false)
    const callbackRequest = new NextRequest(`${origin}/auth-callback?code=google-code&state=${state}`, { headers })
    expect((await proxy(callbackRequest)).headers.get('x-middleware-next')).toBe('1')
    mocks.cookies.mockResolvedValue(callbackRequest.cookies)
    render(await AuthCallbackPage({}))
    expect(screen.getByText(state)).toBeInTheDocument()
    const verifier = JSON.parse(pending.value).verifier as string
    expect(document.body.textContent).not.toContain(verifier)
  })
  it('keeps an Apple callback on its web handoff with a concurrent desktop Google attempt', async () => {
    const google = googleAttempt()
    vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', 'services-id')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ authorizationUrl: 'https://appleid.apple.com/auth/authorize' })))
    const started = await startApple(new NextRequest(`${google.origin}/api/auth/apple/start`))
    const appleCookie = started.cookies.get(APPLE_OAUTH_COOKIE)!
    const appleState = JSON.parse(appleCookie.value).state as string
    const request = new NextRequest(`${google.origin}/auth-callback?provider=apple&handoff=apple-handoff&state=${appleState}`, {
      headers: { cookie: `${google.headers.cookie}; ${APPLE_OAUTH_COOKIE}=${encodeURIComponent(appleCookie.value)}` },
    })
    const response = await proxy(request)
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('location')).toBeNull()
    const crossProvider = await proxy(new NextRequest(`${google.origin}/auth-callback?provider=apple&state=${google.state}&code=google-code`, {
      headers: google.headers,
    }))
    expect(crossProvider.headers.get('x-middleware-next')).toBe('1')
    expect(crossProvider.headers.get('location')).toBeNull()
    mocks.cookies.mockResolvedValue(request.cookies)
    render(await AuthCallbackPage({ searchParams: Promise.resolve({ provider: 'apple', state: appleState, handoff: 'apple-handoff' }) }))
    expect(screen.getByText(appleState)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(google.state)
  })
  it.each([null, 'invalid-json', '{}', '{"state":42}', '{"state":""}'])
  ('does not claim web ownership without a valid pending state: %s', async (pending) => {
    const callbackRequest = new NextRequest('https://app.useorbit.org/auth-callback', {
      headers: pending === null ? {} : { cookie: `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(pending)}` },
    })
    const response = await proxy(callbackRequest)
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('set-cookie')).toBeNull()
    mocks.cookies.mockResolvedValue(callbackRequest.cookies)
    render(await AuthCallbackPage({}))
    expect(screen.getByText('no web attempt')).toBeInTheDocument()
  })
})
