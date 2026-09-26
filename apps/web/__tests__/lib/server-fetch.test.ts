import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { serverAuthFetch, serverAuthMutate, serverPublicFetch } from '@/lib/server-fetch'
import { createHabit, updateHabit } from '@/app/actions/habits'
import { API } from '@orbit/shared/api'

/**
 * vi.hoisted, because vi.mock is hoisted above the static import and a plain `const` would not be
 * initialized when the factory runs. The dynamic imports this file used to carry hid that ordering.
 */
const { resolveServerSessionMock, mockFetch } = vi.hoisted(() => ({
  resolveServerSessionMock: vi.fn(),
  mockFetch: vi.fn(),
}))

vi.mock('@/lib/auth-api', () => ({
  resolveServerSession: resolveServerSessionMock,
}))

vi.stubGlobal('fetch', mockFetch)

describe('createHabit action error boundary', () => {
  beforeEach(() => {
    resolveServerSessionMock.mockReset()
    mockFetch.mockReset()
    resolveServerSessionMock.mockResolvedValue({ token: 'test-token', refreshFailed: false })
  })

  it.each([
    [400, 'VALIDATION_ERROR', 'Title must be 200 characters or fewer'],
    [403, 'PAY_GATE', 'Calendar integration is a Pro feature. Upgrade to unlock!'],
    [429, 'RATE_LIMITED', 'Rate limited'],
    [500, 'INTERNAL_SERVER_ERROR', 'Server failed'],
  ])('returns upstream %i details without throwing', async (status, errorCode, message) => {
    mockFetch.mockResolvedValue({
      ok: false,
      status,
      json: () => Promise.resolve({ error: message, errorCode }),
    })
    await expect(createHabit({ title: 'Test' }, null)).resolves.toMatchObject({
      ok: false,
      status,
      code: errorCode,
      error: message,
    })
  })

  it('returns an uncoded edge 403 from an HTML response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    })
    await expect(createHabit({ title: 'Test' }, null)).resolves.toMatchObject({
      ok: false,
      status: 403,
      error: 'Failed with status 403',
    })
  })

  it.each(['create', 'update'])('rejects an overlong %s description before fetch', async (operation) => {
    const request = { title: 'Test', description: 'x'.repeat(10001), isBadHabit: false }
    const result = operation === 'create'
      ? await createHabit(request, null)
      : await updateHabit('habit-1', request, null)
    expect(result).toMatchObject({ ok: false, status: 400, code: 'VALIDATION_ERROR' })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

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

    await expect(serverAuthMutate(API.auth.refresh, { method: 'POST' }, null)).rejects.toMatchObject({
      status: 401,
    })

    expect(resolveServerSessionMock).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledTimes(1)
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

  it('returns null for 204 responses', async () => {
    resolveServerSessionMock.mockResolvedValue({
      token: 'test-token',
      expiresAt: Date.now() + 3600000,
      refreshed: false,
    })
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      text: () => Promise.resolve(''),
    })

    const result = await serverAuthMutate('/api/habits/h-1', { method: 'DELETE' }, null)

    expect(result).toBeNull()
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

  it('skips schema validation for empty (204) responses', async () => {
    resolveServerSessionMock.mockResolvedValue({
      token: 'test-token',
      expiresAt: Date.now() + 3600000,
      refreshed: false,
    })
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      text: () => Promise.resolve(''),
    })

    const schema = z.object({ id: z.string() })
    const result = await serverAuthMutate('/api/habits/h-1', { method: 'DELETE' }, null, schema)

    expect(result).toBeNull()
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
