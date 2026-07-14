import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const resolveServerSessionMock = vi.fn()

vi.mock('@/lib/auth-api', () => ({
  resolveServerSession: resolveServerSessionMock,
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

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('serverAuthFetch', () => {
  beforeEach(() => {
    vi.resetModules()
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

    const { serverAuthFetch } = await import('@/lib/server-fetch')
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

    const { serverAuthFetch } = await import('@/lib/server-fetch')
    const result = await serverAuthFetch('/api/habits')

    expect(result).toEqual({ ok: true })
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

    const { serverAuthFetch } = await import('@/lib/server-fetch')

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

    const { serverAuthFetch } = await import('@/lib/server-fetch')
    const result = await serverAuthFetch('/api/habits/h-1', { method: 'DELETE' })

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

    const { serverAuthFetch } = await import('@/lib/server-fetch')
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

    const { serverAuthFetch } = await import('@/lib/server-fetch')
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

    const { serverAuthFetch } = await import('@/lib/server-fetch')
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

    const { serverAuthFetch } = await import('@/lib/server-fetch')
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

    const { serverAuthFetch } = await import('@/lib/server-fetch')
    const schema = z.object({ id: z.string() })
    const result = await serverAuthFetch('/api/habits/h-1', { method: 'DELETE' }, schema)

    expect(result).toBeNull()
  })
})

describe('serverPublicFetch', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFetch.mockReset()
  })

  it('validates and returns the parsed body when a schema is supplied', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ slug: 'ada', extra: 'stripped' })),
    })

    const { serverPublicFetch } = await import('@/lib/server-fetch')
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

    const { serverPublicFetch } = await import('@/lib/server-fetch')
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

    const { serverPublicFetch } = await import('@/lib/server-fetch')
    const schema = z.object({ slug: z.string() })
    const result = await serverPublicFetch('/api/u/missing', {}, schema)

    expect(result).toBeNull()
  })
})
