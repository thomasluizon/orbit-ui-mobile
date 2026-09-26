import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { serverAuthFetch, serverAuthMutate, serverPublicFetch } from '@/lib/server-fetch'
import { API } from '@orbit/shared/api'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

/** `vi.mock` runs before static imports, so these mocks must be hoisted too. */
const { resolveServerSessionMock, mockFetch } = vi.hoisted(() => ({
  resolveServerSessionMock: vi.fn(),
  mockFetch: vi.fn(),
}))

/**
 * The real `getAccountIdFromToken` stays, because the account guard is what these tests judge and a
 * stubbed decoder would only prove the stub. Only the session resolution is replaced.
 */
vi.mock('@/lib/auth-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth-api')>()),
  resolveServerSession: resolveServerSessionMock,
}))

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: vi.fn(), set: vi.fn() }),
}))

vi.mock('@orbit/shared', () => ({
  createApiClientError: vi.fn((status: number, _payload: unknown, fallbackMessage: string) => {
    const err = new Error(fallbackMessage)
    ;(err as Error & { status: number }).status = status
    ;(err as Error & { name: string }).name = 'ApiClientError'
    return err
  }),
  ApiClientError: class ApiClientError extends Error {
    status: number
    code?: string
    data?: unknown
    constructor(status: number, message: string, options?: { code?: string; data?: unknown }) {
      super(message)
      this.name = 'ApiClientError'
      this.status = status
      this.code = options?.code
      this.data = options?.data
    }
  },
}))

vi.stubGlobal('fetch', mockFetch)


describe('serverAuthFetch', () => {
  beforeEach(() => {
    resolveServerSessionMock.mockReset()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('calls fetch with the resolved auth token', async () => {
    resolveServerSessionMock.mockResolvedValue({
      token: 'test-token',
      expiresAt: Date.now() + 3600000,
      refreshed: false,
    })
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 'h-1' })),
    })

    const result = await serverAuthFetch('/api/habits')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/habits'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
      }),
    )
    expect(result).toEqual({ id: 'h-1' })
  })

  it('retries once with a force refresh after a 401', async () => {
    resolveServerSessionMock
      .mockResolvedValueOnce({
        token: 'stale-token',
        expiresAt: Date.now() + 30000,
        refreshed: false,
      })
      .mockResolvedValueOnce({
        token: 'fresh-token',
        expiresAt: Date.now() + 3600000,
        refreshed: true,
      })
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      })

    const result = await serverAuthFetch('/api/habits')

    expect(result).toEqual({ ok: true })
    expect(resolveServerSessionMock).toHaveBeenCalledTimes(2)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(resolveServerSessionMock).toHaveBeenNthCalledWith(1)
    expect(resolveServerSessionMock).toHaveBeenNthCalledWith(2, { forceRefresh: true })
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer fresh-token',
        }),
      }),
    )
  })

  it('throws unauthorized when no session token can be resolved', async () => {
    resolveServerSessionMock.mockResolvedValue({
      token: null,
      expiresAt: null,
      refreshed: false,
    })


    await expect(serverAuthFetch('/api/habits')).rejects.toMatchObject({ status: 401 })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('attaches the X-App-Version header when APP_VERSION is set', async () => {
    vi.stubEnv('APP_VERSION', '1.2.3')
    resolveServerSessionMock.mockResolvedValue({
      token: 'test-token',
      expiresAt: Date.now() + 3600000,
      refreshed: false,
    })
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ ok: true })),
    })

    await serverAuthFetch('/api/habits')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-App-Version': '1.2.3' }),
      }),
    )
  })

  it('omits the X-App-Version header when APP_VERSION is unset', async () => {
    vi.stubEnv('APP_VERSION', undefined)
    resolveServerSessionMock.mockResolvedValue({
      token: 'test-token',
      expiresAt: Date.now() + 3600000,
      refreshed: false,
    })
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ ok: true })),
    })

    await serverAuthFetch('/api/habits')

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect((options.headers as Record<string, string>)['X-App-Version']).toBeUndefined()
  })

  it('validates and returns the parsed body when a schema is supplied', async () => {
    resolveServerSessionMock.mockResolvedValue({
      token: 'test-token',
      expiresAt: Date.now() + 3600000,
      refreshed: false,
    })
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 'h-1', extra: 'stripped' })),
    })

    const schema = z.object({ id: z.string() })
    const result = await serverAuthFetch('/api/habits/h-1', {}, schema)

    expect(result).toEqual({ id: 'h-1' })
  })

  it('rejects a malformed body with a typed 502 ApiClientError', async () => {
    resolveServerSessionMock.mockResolvedValue({
      token: 'test-token',
      expiresAt: Date.now() + 3600000,
      refreshed: false,
    })
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 123 })),
    })

    const schema = z.object({ id: z.string() })

    await expect(serverAuthFetch('/api/habits/h-1', {}, schema)).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 502,
      code: 'INVALID_RESPONSE_SCHEMA',
    })
  })

})

describe('serverPublicFetch', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('validates and returns the parsed body when a schema is supplied', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ slug: 'ada', extra: 'stripped' })),
    })

    const schema = z.object({ slug: z.string() })
    const result = await serverPublicFetch('/api/u/ada', {}, schema)

    expect(result).toEqual({ slug: 'ada' })
  })

  it('rejects a malformed body with a typed 502 ApiClientError', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ slug: null })),
    })

    const schema = z.object({ slug: z.string() })

    await expect(serverPublicFetch('/api/u/ada', {}, schema)).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 502,
      code: 'INVALID_RESPONSE_SCHEMA',
    })
  })

  it('returns null for a 404 without invoking the schema', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve(null),
    })

    const schema = z.object({ slug: z.string() })
    const result = await serverPublicFetch('/api/u/missing', {}, schema)

    expect(result).toBeNull()
  })
})

/**
 * The claim the API puts the account id under. It is the literal `auth-api.ts` reads and the one
 * `JwtTokenServiceTests` in the orbit-api repository pins, so a token built here carries an account
 * the real `getAccountIdFromToken` can find.
 */
const ACCOUNT_CLAIM = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'

function encodeJwtSegment(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function makeAccessToken(accountId: string): string {
  return [
    encodeJwtSegment({ alg: 'HS256', typ: 'JWT' }),
    encodeJwtSegment({ [ACCOUNT_CLAIM]: accountId }),
    'ZmFrZS1zaWduYXR1cmU',
  ].join('.')
}

describe('serverAuthMutate', () => {
  beforeEach(() => {
    resolveServerSessionMock.mockReset()
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      text: () => Promise.resolve(''),
    })
  })

  function holdCookieForAccount(accountId: string): void {
    resolveServerSessionMock.mockResolvedValue({
      token: makeAccessToken(accountId),
      expiresAt: Date.now() + 3600000,
      refreshed: false,
    })
  }

  it('refuses a write whose account no longer holds the cookie, before any request goes out', async () => {
    holdCookieForAccount('account-b')

    await expect(
      serverAuthMutate('/api/habits/h-1', { method: 'DELETE' }, 'account-a'),
    ).rejects.toMatchObject({ status: 409 })

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('sends a write while the cookie still holds the account that formed it', async () => {
    holdCookieForAccount('account-a')

    await serverAuthMutate('/api/habits/h-1', { method: 'DELETE' }, 'account-a')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url] = mockFetch.mock.calls[0] as [string]
    expect(url).toContain('/api/habits/h-1')
  })

  it('sends a write that names no account because the cookie proves no mismatch', async () => {
    holdCookieForAccount('account-b')

    await serverAuthMutate('/api/habits/h-1', { method: 'DELETE' }, null)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url] = mockFetch.mock.calls[0] as [string]
    expect(url).toContain('/api/habits/h-1')
  })

  it('sends a write whose token carries no readable account, rather than failing shut', async () => {
    resolveServerSessionMock.mockResolvedValue({
      token: 'not-a-jwt',
      expiresAt: Date.now() + 3600000,
      refreshed: false,
    })

    await serverAuthMutate('/api/habits/h-1', { method: 'DELETE' }, 'account-a')

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('refuses a write when a refresh swaps the account mid-flight, before the retry goes out', async () => {
    resolveServerSessionMock
      .mockResolvedValueOnce({
        token: makeAccessToken('account-a'),
        expiresAt: Date.now() + 3600000,
        refreshed: false,
      })
      .mockResolvedValueOnce({
        token: makeAccessToken('account-b'),
        expiresAt: Date.now() + 3600000,
        refreshed: true,
      })
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve(null),
    })

    await expect(
      serverAuthMutate('/api/habits/h-1', { method: 'DELETE' }, 'account-a'),
    ).rejects.toMatchObject({ status: 409 })

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('validates the response body against a schema supplied after the account', async () => {
    holdCookieForAccount('account-a')
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 'h-1', extra: 'stripped' })),
    })

    const schema = z.object({ id: z.string() })
    const result = await serverAuthMutate('/api/habits', { method: 'POST' }, 'account-a', schema)

    expect(result).toEqual({ id: 'h-1' })
  })

  it('does not recurse when the refresh endpoint returns 401', async () => {
    resolveServerSessionMock
      .mockResolvedValueOnce({
        token: 'stale-token',
        expiresAt: Date.now() + 30000,
        refreshed: false,
      })
      .mockResolvedValueOnce({
        token: 'unexpected-token',
        expiresAt: Date.now() + 3600000,
        refreshed: true,
      })
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    })

    await expect(
      serverAuthMutate(API.auth.refresh, { method: 'POST' }, 'account-a'),
    ).rejects.toMatchObject({ status: 401 })

    expect(resolveServerSessionMock).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('returns null for 204 responses', async () => {
    holdCookieForAccount('account-a')
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      text: () => Promise.resolve(''),
    })

    const result = await serverAuthMutate('/api/habits/h-1', { method: 'DELETE' }, 'account-a')

    expect(result).toBeNull()
  })

  it('skips schema validation for empty (204) responses', async () => {
    holdCookieForAccount('account-a')
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      text: () => Promise.resolve(''),
    })

    const schema = z.object({ id: z.string() })
    const result = await serverAuthMutate(
      '/api/habits/h-1',
      { method: 'DELETE' },
      'account-a',
      schema,
    )

    expect(result).toBeNull()
  })
})
