import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock auth-api
vi.mock('@/lib/auth-api', () => ({
  getAuthHeaders: vi.fn().mockResolvedValue({ Authorization: 'Bearer test-token' }),
}))

// Mock shared error utils
vi.mock('@orbit/shared', () => ({
  createApiClientError: vi.fn((status: number, _payload: unknown, fallbackMessage: string) => {
    const err = new Error(fallbackMessage)
    ;(err as Record<string, unknown>).status = status
    ;(err as Record<string, unknown>).name = 'ApiClientError'
    return err
  }),
}))

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('serverAuthFetch', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls fetch with auth headers and JSON content type', async () => {
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

  it('returns null for 204 No Content', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      text: () => Promise.resolve(''),
    })

    const { serverAuthFetch } = await import('@/lib/server-fetch')
    const result = await serverAuthFetch('/api/habits/h-1', { method: 'DELETE' })

    expect(result).toBeNull()
  })

  it('returns null for empty response body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
    })

    const { serverAuthFetch } = await import('@/lib/server-fetch')
    const result = await serverAuthFetch('/api/some-endpoint')

    expect(result).toBeNull()
  })

  it('throws ApiClientError on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Bad request' }),
    })

    const { serverAuthFetch } = await import('@/lib/server-fetch')

    await expect(serverAuthFetch('/api/habits')).rejects.toThrow()
  })

  it('handles json parse failure in error response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('Invalid JSON')),
    })

    const { serverAuthFetch } = await import('@/lib/server-fetch')

    await expect(serverAuthFetch('/api/habits')).rejects.toThrow()
  })

  it('merges custom init options', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ ok: true })),
    })

    const { serverAuthFetch } = await import('@/lib/server-fetch')
    await serverAuthFetch('/api/habits', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test' }),
    })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Test' }),
      }),
    )
  })
})
