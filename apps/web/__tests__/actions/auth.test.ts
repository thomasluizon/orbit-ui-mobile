import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth-api', () => ({
  getAuthHeaders: vi.fn().mockResolvedValue({
    Authorization: 'Bearer test-token',
  }),
  resolveServerSession: vi.fn().mockResolvedValue({
    token: 'test-token',
    expiresAt: null,
    refreshed: false,
  }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { requestDeletion, confirmDeletion } = await import(
  '@/app/actions/auth'
)

describe('auth server actions', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  function mockApiResponse(body: unknown, status = 200) {
    mockFetch.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    })
  }

  function mock204() {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error('No body')),
    })
  }

  // -------------------------------------------------------------------------
  // requestDeletion
  // -------------------------------------------------------------------------

  describe('requestDeletion', () => {
    it('sends POST to /api/auth/request-deletion', async () => {
      mock204()

      await requestDeletion()

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/auth/request-deletion')
      expect(init.method).toBe('POST')
    })

    it('includes auth headers', async () => {
      mock204()

      await requestDeletion()

      const [, init] = mockFetch.mock.calls[0]!
      expect(init.headers).toHaveProperty('Authorization', 'Bearer test-token')
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Not authenticated' }, 401)

      await expect(requestDeletion()).rejects.toThrow('Not authenticated')
    })

    it('throws on rate limit', async () => {
      mockApiResponse({ error: 'Too many requests' }, 429)

      await expect(requestDeletion()).rejects.toThrow('Too many requests')
    })
  })

  // -------------------------------------------------------------------------
  // confirmDeletion
  // -------------------------------------------------------------------------

  describe('confirmDeletion', () => {
    it('sends POST to /api/auth/confirm-deletion with code', async () => {
      mockApiResponse({ scheduledDeletionAt: '2025-02-15T00:00:00Z' })

      const result = await confirmDeletion('123456')

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/auth/confirm-deletion')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body)).toEqual({ code: '123456' })
      expect(result.scheduledDeletionAt).toBe('2025-02-15T00:00:00Z')
    })

    it('includes auth headers', async () => {
      mockApiResponse({ scheduledDeletionAt: '2025-02-15T00:00:00Z' })

      await confirmDeletion('123456')

      const [, init] = mockFetch.mock.calls[0]!
      expect(init.headers).toHaveProperty('Authorization', 'Bearer test-token')
    })

    it('returns empty object when response is 204', async () => {
      mock204()

      const result = await confirmDeletion('123456')

      expect(result).toEqual({})
    })

    it('throws on invalid code', async () => {
      mockApiResponse({ error: 'Invalid or expired code' }, 400)

      await expect(confirmDeletion('000000')).rejects.toThrow(
        'Invalid or expired code',
      )
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Internal error' }, 500)

      await expect(confirmDeletion('123456')).rejects.toThrow('Internal error')
    })
  })

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws with error message from response body', async () => {
      mockApiResponse({ error: 'Forbidden' }, 403)

      await expect(requestDeletion()).rejects.toThrow('Forbidden')
    })

    it('throws with message field from response body', async () => {
      mockApiResponse({ message: 'Validation failed' }, 400)

      await expect(confirmDeletion('')).rejects.toThrow('Validation failed')
    })

    it('throws with status code when no error body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('No JSON')),
      })

      await expect(requestDeletion()).rejects.toThrow('500')
    })
  })
})
