import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { config, proxy } from '@/proxy'
import {
  clearSessionCookies,
  resolveSessionTokens,
  setSessionCookies,
} from '@/lib/auth-api'
import nextConfig from '../next.config'
import { POST as issueEventTicket } from '@/app/api/events/ticket/route'
import { serverAuthMutate } from '@/lib/server-fetch'

vi.mock('@/lib/server-fetch', () => ({ serverAuthMutate: vi.fn() }))

vi.mock('@/lib/auth-api', () => ({
  AUTH_COOKIE: 'auth_token',
  REFRESH_COOKIE: 'refresh_token',
  clearSessionCookies: vi.fn(),
  resolveSessionTokens: vi.fn(),
  setSessionCookies: vi.fn(),
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  const makeResponse = (type: 'next' | 'redirect', url?: string) => ({
    type,
    url,
    cookies: { set: vi.fn() },
    headers: new Headers(),
  })

  return {
    ...actual,
    NextResponse: {
      next: vi.fn(() => makeResponse('next')),
      redirect: vi.fn((url: URL) => makeResponse('redirect', url.toString())),
      json: actual.NextResponse.json,
    },
  }
})

function createRequest(path: string, options: { cookies?: Record<string, string>; method?: string; host?: string } = {}) {
  const url = new URL(path, 'http://localhost:3000')
  const request = new NextRequest(url, {
    method: options.method,
    headers: options.host ? { host: options.host } : undefined,
  })

  if (options.cookies) {
    for (const [name, value] of Object.entries(options.cookies)) {
      request.cookies.set(name, value)
    }
  }

  return request
}

describe('proxy', () => {
  beforeEach(() => {
    vi.stubEnv('API_BASE', 'https://api.useorbit.org')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.useorbit.org')
    vi.stubEnv('NEXT_PUBLIC_EVENT_API_BASE', undefined)
    vi.stubEnv('NEXT_PUBLIC_UPLOAD_BUCKET_ORIGIN', undefined)
    vi.mocked(NextResponse.next).mockClear()
    vi.mocked(NextResponse.redirect).mockClear()
    vi.mocked(resolveSessionTokens).mockReset()
    vi.mocked(clearSessionCookies).mockReset()
    vi.mocked(setSessionCookies).mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows public legal pages without resolving a session', async () => {
    for (const path of ['/terms', '/privacy', '/delete-account']) {
      const response = await proxy(createRequest(path))

      expect(response).toMatchObject({ type: 'next' })
    }
    expect(resolveSessionTokens).not.toHaveBeenCalled()
  })

  it('passes signed-out PostHog assets and capture requests through the proxy', async () => {
    vi.mocked(resolveSessionTokens).mockResolvedValue({
      token: null,
      expiresAt: null,
      refreshed: false,
      refreshFailed: false,
    })
    const assetUrl = 'http://localhost:3000/ingest/static/array.js'
    const captureUrl = 'http://localhost:3000/ingest/e/'
    const flagsUrl = 'http://localhost:3000/ingest/flags/?v=2'

    for (const url of [assetUrl, captureUrl, flagsUrl]) {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true)
    }

    const assetResponse = await proxy(createRequest('/ingest/static/array.js'))
    const captureResponse = await proxy(createRequest('/ingest/e/', { method: 'POST' }))
    const flagsResponse = await proxy(createRequest('/ingest/flags/?v=2', { method: 'POST' }))

    expect(assetResponse).toMatchObject({ type: 'next' })
    expect(captureResponse).toMatchObject({ type: 'next' })
    expect(flagsResponse).toMatchObject({ type: 'next' })
    expect(resolveSessionTokens).not.toHaveBeenCalled()
    expect(NextResponse.redirect).not.toHaveBeenCalled()
  })

  it('keeps trailing slashes on PostHog requests for the rewrite', () => {
    expect(nextConfig.skipTrailingSlashRedirect).toBe(true)
  })

  it('adds an enforcing nonce-based content security policy to rendered pages', async () => {
    const response = await proxy(createRequest('/terms'))
    const nextOptions = vi.mocked(NextResponse.next).mock.calls[0]![0]
    const forwardedHeaders = nextOptions?.request?.headers as Headers
    const contentSecurityPolicy = response.headers.get('Content-Security-Policy')
    const configuredHeaders = await nextConfig.headers?.()
    const contentSecurityPolicyDefinitions = [
      contentSecurityPolicy,
      ...(configuredHeaders ?? []).flatMap(({ headers }) =>
        headers
          .filter(({ key }) => key.toLowerCase() === 'content-security-policy')
          .map(({ value }) => value),
      ),
    ].filter((value): value is string => value !== null)

    expect(contentSecurityPolicyDefinitions).toHaveLength(1)
    expect(contentSecurityPolicy).toMatch(
      /^default-src 'self'; script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
    )
    expect(contentSecurityPolicy).toContain("connect-src 'self'")
    expect(contentSecurityPolicy).toContain("base-uri 'self'")
    expect(contentSecurityPolicy).toContain("form-action 'self'")
    expect(contentSecurityPolicy).toContain("frame-ancestors 'none'")
    expect(contentSecurityPolicy).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(forwardedHeaders.get('Content-Security-Policy')).toBe(contentSecurityPolicy)
    expect(forwardedHeaders.get('x-nonce')).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })

  it.each([
    ['production', 'https://orbit-uploads-production-713285551626.s3.us-east-2.amazonaws.com', 'https://orbit-uploads-staging-713285551626.s3.us-east-2.amazonaws.com'],
    ['staging', 'https://orbit-uploads-staging-713285551626.s3.us-east-2.amazonaws.com', 'https://orbit-uploads-production-713285551626.s3.us-east-2.amazonaws.com'],
  ])('allows the %s upload bucket without broadening the CSP', async (_, bucketOrigin, otherBucketOrigin) => {
    vi.stubEnv('NEXT_PUBLIC_UPLOAD_BUCKET_ORIGIN', bucketOrigin)
    vi.stubEnv('API_BASE', 'https://api.example.test')

    const response = await proxy(createRequest('/terms'))
    const directives = response.headers.get('Content-Security-Policy')!.split('; ')
    const imageSources = directives.find((directive) => directive.startsWith('img-src '))!.split(' ')
    const connectionSources = directives.find((directive) => directive.startsWith('connect-src '))!.split(' ')

    for (const sources of [imageSources, connectionSources]) {
      expect(sources).toContain(bucketOrigin)
      expect(sources.some((source) => source.includes('supabase'))).toBe(false)
      expect(sources).not.toContain(otherBucketOrigin)
    }
    expect(imageSources).toContain('https://api.example.test')
    expect(directives.join('; ')).not.toContain('*.amazonaws.com')
  })

  it('returns the ticket API origin for the stream and allows it in connect-src', async () => {
    vi.stubEnv('API_BASE', 'http://localhost:5000')
    vi.mocked(serverAuthMutate).mockResolvedValue({ ticket: 'ticket' })
    const ticketResponse = await issueEventTicket()
    const { apiBase } = await ticketResponse.json() as { apiBase: string }
    const response = await proxy(createRequest('/terms'))
    const connectSource = response.headers.get('Content-Security-Policy')?.split('; ')
      .find((directive) => directive.startsWith('connect-src '))?.split(' ')
    expect(apiBase).toBe('http://localhost:5000')
    expect(connectSource).toContain(new URL(apiBase).origin)
  })

  it('uses the public event origin for the stream and connect-src when the API is internal', async () => {
    vi.stubEnv('API_BASE', 'http://api.internal:5000')
    vi.stubEnv('NEXT_PUBLIC_EVENT_API_BASE', 'https://events.example.test')
    vi.mocked(serverAuthMutate).mockResolvedValue({ ticket: 'ticket' })
    const ticketResponse = await issueEventTicket()
    const { apiBase } = await ticketResponse.json() as { apiBase: string }
    const response = await proxy(createRequest('/terms'))
    const connectSource = response.headers.get('Content-Security-Policy')?.split('; ')
      .find((directive) => directive.startsWith('connect-src '))?.split(' ')

    expect(apiBase).toBe('https://events.example.test')
    expect(connectSource).toContain(new URL(apiBase).origin)
    expect(connectSource).not.toContain('http://api.internal:5000')
  })

  it('keeps the production API origin for tickets and streams', async () => {
    vi.mocked(serverAuthMutate).mockResolvedValue({ ticket: 'ticket' })
    const ticketResponse = await issueEventTicket()
    expect(await ticketResponse.json()).toMatchObject({ apiBase: 'https://api.useorbit.org' })
  })

  it('allows development scripts without an external auth origin', async () => {
    vi.stubEnv('NODE_ENV', 'development')

    const response = await proxy(createRequest('/api/profile'))
    const contentSecurityPolicy = response.headers.get('Content-Security-Policy')

    expect(contentSecurityPolicy).toContain("script-src 'self'")
    expect(contentSecurityPolicy).toContain("'unsafe-eval'")
    expect(contentSecurityPolicy).toContain(
      "connect-src 'self' https://api.useorbit.org",
    )
  })

  it('runs for every early-return path so each response receives the policy', () => {
    for (const url of [
      'http://localhost:3000/api/profile',
      'http://localhost:3000/_next/static/chunks/app.js',
      'http://localhost:3000/favicon.ico',
      'http://localhost:3000/images/orbit-logo.png',
    ]) {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true)
    }
  })

  it('keeps the health route outside the auth proxy', async () => {
    expect(unstable_doesMiddlewareMatch({ config, url: 'http://localhost:3000/api/health' })).toBe(false)
    expect(resolveSessionTokens).not.toHaveBeenCalled()
  })

  it('permanently redirects the service host to the public site before resolving a session', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://staging.useorbit.org')
    vi.mocked(resolveSessionTokens).mockResolvedValue({
      token: null,
      expiresAt: null,
      refreshed: false,
      refreshFailed: false,
    })

    await proxy(createRequest('http://0.0.0.0:10000/login?x=1', {
      host: 'orbit-web-staging-eakn.onrender.com',
    }))

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      new URL('https://staging.useorbit.org/login?x=1'),
      308,
    )
    expect(resolveSessionTokens).not.toHaveBeenCalled()
  })

  it('passes through the public site host and the service health route', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://staging.useorbit.org')

    const siteResponse = await proxy(createRequest('http://0.0.0.0:10000/terms', {
      host: 'staging.useorbit.org',
    }))
    const healthResponse = await proxy(createRequest('http://0.0.0.0:10000/api/health', {
      host: 'orbit-web-staging-eakn.onrender.com',
    }))

    expect(siteResponse).toMatchObject({ type: 'next' })
    expect(healthResponse).toMatchObject({ type: 'next' })
    expect(NextResponse.redirect).not.toHaveBeenCalled()
  })

  it.each([undefined, 'http://localhost:3000'])(
    'skips canonical redirects when the public site URL is %s',
    async (siteUrl) => {
      vi.stubEnv('NEXT_PUBLIC_SITE_URL', siteUrl)

      const response = await proxy(createRequest('http://0.0.0.0:10000/terms', {
        host: 'orbit-web-staging-eakn.onrender.com',
      }))

      expect(response).toMatchObject({ type: 'next' })
      expect(NextResponse.redirect).not.toHaveBeenCalled()
    },
  )

  it('adds the policy to static image responses without resolving a session', async () => {
    for (const path of ['/favicon.ico', '/images/orbit-logo.png']) {
      const response = await proxy(createRequest(path))

      expect(response.headers.get('Content-Security-Policy')).toMatch(
        /^default-src 'self'; script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
      )
    }
    expect(resolveSessionTokens).not.toHaveBeenCalled()
  })

  it('serves the push service worker without a session and keeps the policy', async () => {
    vi.mocked(resolveSessionTokens).mockResolvedValue({
      token: null,
      expiresAt: null,
      refreshed: false,
      refreshFailed: false,
    })
    expect(unstable_doesMiddlewareMatch({ config, url: 'http://localhost:3000/sw.js' })).toBe(true)

    const response = await proxy(createRequest('/sw.js'))

    expect(response).toMatchObject({ type: 'next' })
    expect(response.headers.get('Content-Security-Policy')).toMatch(
      /^default-src 'self'; script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
    )
    expect(resolveSessionTokens).not.toHaveBeenCalled()
    expect(NextResponse.redirect).not.toHaveBeenCalled()
  })

  it.each(['/sw.js/x', '/sw.jsx'])('still sends a signed-out %s to login', async (path) => {
    vi.mocked(resolveSessionTokens).mockResolvedValue({
      token: null,
      expiresAt: null,
      refreshed: false,
      refreshFailed: false,
    })

    const response = await proxy(createRequest(path))

    expect(response).toMatchObject({ type: 'redirect' })
    const redirectUrl = vi.mocked(NextResponse.redirect).mock.calls[0]![0] as URL
    expect(redirectUrl.pathname).toBe('/login')
    expect(redirectUrl.searchParams.get('returnUrl')).toBe(path)
  })

  it('stops browsers from caching the push service worker script', async () => {
    const configuredHeaders = await nextConfig.headers?.()
    const serviceWorkerHeaders = configuredHeaders?.find(({ source }) => source === '/sw.js')

    expect(serviceWorkerHeaders?.headers).toContainEqual({
      key: 'Cache-Control',
      value: 'no-cache, no-store, must-revalidate',
    })
  })

  it('redirects protected routes to login when no session can be resolved', async () => {
    vi.mocked(resolveSessionTokens).mockResolvedValue({
      token: null,
      expiresAt: null,
      refreshed: false,
      refreshFailed: false,
    })

    await proxy(createRequest('http://0.0.0.0:10000/profile?source=notification'))

    expect(NextResponse.redirect).toHaveBeenCalled()
    const redirectUrl = vi.mocked(NextResponse.redirect).mock.calls[0]![0] as URL
    expect(redirectUrl.origin).toBe('https://app.useorbit.org')
    expect(redirectUrl.pathname).toBe('/login')
    expect(redirectUrl.searchParams.get('returnUrl')).toBe('/profile')
    expect(redirectUrl.searchParams.get('source')).toBe('notification')
  })

  it('restores a missing access cookie from a valid refresh-backed session', async () => {
    vi.mocked(resolveSessionTokens).mockImplementation(async (options) => {
      await options.persistSession?.({
        token: 'fresh-token',
        refreshToken: 'fresh-refresh',
      })

      return {
        token: 'fresh-token',
        expiresAt: Date.now() + 3600000,
        refreshed: true,
        refreshFailed: false,
      }
    })

    const response = await proxy(createRequest('/', {
      cookies: { refresh_token: 'refresh-cookie' },
    }))

    expect(response).toMatchObject({ type: 'next' })
    expect(setSessionCookies).toHaveBeenCalledWith(
      'fresh-token',
      'fresh-refresh',
      expect.objectContaining({ set: expect.any(Function) }),
    )
  })

  it('does not let a stale refresh loser erase a winning rotation', async () => {
    let requestNumber = 0
    let releaseLoser = () => {}
    const loserGate = new Promise<void>((resolve) => {
      releaseLoser = resolve
    })
    vi.mocked(resolveSessionTokens).mockImplementation(async (options) => {
      requestNumber += 1
      if (requestNumber === 1) {
        await options.persistSession?.({
          token: 'fresh-token',
          refreshToken: 'fresh-refresh',
        })
        return {
          token: 'fresh-token',
          expiresAt: Date.now() + 3600000,
          refreshed: true,
          refreshFailed: false,
        }
      }

      await loserGate
      await options.clearSession?.()
      return {
        token: null,
        expiresAt: null,
        refreshed: false,
        refreshFailed: true,
      }
    })

    const requestCookies = { refresh_token: 'shared-old-refresh' }
    const winnerRequest = proxy(createRequest('/login', { cookies: requestCookies }))
    const loserRequest = proxy(createRequest('/login', { cookies: requestCookies }))
    const winnerResponse = await winnerRequest
    releaseLoser()
    const loserResponse = await loserRequest

    expect(winnerResponse).toMatchObject({ type: 'redirect' })
    expect(loserResponse).toMatchObject({ type: 'next' })
    expect(resolveSessionTokens).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ refreshToken: 'shared-old-refresh' }),
    )
    expect(resolveSessionTokens).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ refreshToken: 'shared-old-refresh' }),
    )
    expect(setSessionCookies).toHaveBeenCalledTimes(1)
    expect(clearSessionCookies).not.toHaveBeenCalled()
  })

  it('redirects authenticated users away from login', async () => {
    vi.mocked(resolveSessionTokens).mockResolvedValue({
      token: 'valid-token',
      expiresAt: Date.now() + 3600000,
      refreshed: false,
      refreshFailed: false,
    })

    await proxy(createRequest('http://0.0.0.0:10000/login', {
      cookies: { auth_token: 'valid-token' },
    }))

    expect(NextResponse.redirect).toHaveBeenCalled()
    const redirectUrl = vi.mocked(NextResponse.redirect).mock.calls[0]![0] as URL
    expect(redirectUrl.origin).toBe('https://app.useorbit.org')
    expect(redirectUrl.pathname).toBe('/')
  })

  it('shows a Google callback error on login while an existing session remains active', async () => {
    vi.mocked(resolveSessionTokens).mockResolvedValue({
      token: 'valid-token',
      expiresAt: Date.now() + 3600000,
      refreshed: false,
      refreshFailed: false,
    })
    const response = await proxy(createRequest('/login?googleError=1', {
      cookies: { auth_token: 'valid-token' },
    }))
    expect(response).toMatchObject({ type: 'next' })
    expect(NextResponse.redirect).not.toHaveBeenCalled()
  })
})
