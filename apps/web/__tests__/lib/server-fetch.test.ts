import { beforeEach, describe, expect, it, vi } from 'vitest'

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
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('serverAuthFetch', () => {
  beforeEach(() => {
    resolveServerSessionMock.mockReset()
    mockFetch.mockReset()
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
})
