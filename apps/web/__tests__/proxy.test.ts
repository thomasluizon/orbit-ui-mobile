import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { proxy } from '@/proxy'
import { resolveSessionTokens, setSessionCookies } from '@/lib/auth-api'

vi.mock('@/lib/auth-api', () => ({
  AUTH_COOKIE: 'auth_token',
  REFRESH_COOKIE: 'refresh_token',
  resolveSessionTokens: vi.fn(),
  setSessionCookies: vi.fn(),
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server')
  const makeResponse = (type: 'next' | 'redirect', url?: string) => ({
    type,
    url,
    cookies: { set: vi.fn() },
  })

  return {
    ...actual,
    NextResponse: {
      next: vi.fn(() => makeResponse('next')),
      redirect: vi.fn((url: URL) => makeResponse('redirect', url.toString())),
    },
  }
})

function createRequest(path: string, options: { cookies?: Record<string, string> } = {}) {
  const url = new URL(path, 'http://localhost:3000')
  const request = new NextRequest(url)

  if (options.cookies) {
    for (const [name, value] of Object.entries(options.cookies)) {
      request.cookies.set(name, value)
    }
  }

  return request
}

describe('proxy', () => {
  beforeEach(() => {
    vi.mocked(NextResponse.next).mockClear()
    vi.mocked(NextResponse.redirect).mockClear()
    vi.mocked(resolveSessionTokens).mockReset()
    vi.mocked(setSessionCookies).mockReset()
  })

  it('allows public paths without resolving a session', async () => {
    const response = await proxy(createRequest('/privacy'))

    expect(response).toMatchObject({ type: 'next' })
    expect(resolveSessionTokens).not.toHaveBeenCalled()
  })

  it('redirects protected routes to login when no session can be resolved', async () => {
    vi.mocked(resolveSessionTokens).mockResolvedValue({
      token: null,
      expiresAt: null,
      refreshed: false,
    })

    await proxy(createRequest('/habits'))

    expect(NextResponse.redirect).toHaveBeenCalled()
    const redirectUrl = vi.mocked(NextResponse.redirect).mock.calls[0]![0] as URL
    expect(redirectUrl.pathname).toBe('/login')
    expect(redirectUrl.searchParams.get('returnUrl')).toBe('/habits')
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

  it('redirects authenticated users away from login', async () => {
    vi.mocked(resolveSessionTokens).mockResolvedValue({
      token: 'valid-token',
      expiresAt: Date.now() + 3600000,
      refreshed: false,
    })

    await proxy(createRequest('/login', {
      cookies: { auth_token: 'valid-token' },
    }))

    expect(NextResponse.redirect).toHaveBeenCalled()
    const redirectUrl = vi.mocked(NextResponse.redirect).mock.calls[0]![0] as URL
    expect(redirectUrl.pathname).toBe('/')
  })
})
