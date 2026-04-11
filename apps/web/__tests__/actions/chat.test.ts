import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth-api', () => ({
  getAuthHeaders: vi.fn().mockResolvedValue({
    Authorization: 'Bearer test-token',
  }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { sendChatMessage } = await import('@/app/actions/chat')

describe('chat server actions', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  function makeFormData(message: string): FormData {
    const fd = new FormData()
    fd.append('message', message)
    return fd
  }

  // -------------------------------------------------------------------------
  // sendChatMessage - success
  // -------------------------------------------------------------------------

  describe('sendChatMessage', () => {
    it('sends POST to /api/chat with formData', async () => {
      const chatResponse = {
        aiMessage: 'Hello! How can I help?',
        actions: [],
      }
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(chatResponse),
      })

      const formData = makeFormData('Hello')
      const result = await sendChatMessage(formData)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.aiMessage).toBe('Hello! How can I help?')
      }

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/chat')
      expect(init.method).toBe('POST')
      expect(init.body).toBe(formData)
    })

    it('does not set Content-Type header (multipart boundary auto-set)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ reply: 'Hi', actions: [] }),
      })

      await sendChatMessage(makeFormData('Test'))

      const [, init] = mockFetch.mock.calls[0]!
      expect(init.headers).not.toHaveProperty('Content-Type')
    })

    it('includes auth headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ reply: 'Hi', actions: [] }),
      })

      await sendChatMessage(makeFormData('Test'))

      const [, init] = mockFetch.mock.calls[0]!
      expect(init.headers).toHaveProperty('Authorization', 'Bearer test-token')
    })

    // -----------------------------------------------------------------------
    // sendChatMessage - error responses
    // -----------------------------------------------------------------------

    it('returns error result on non-OK response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Message too long' }),
      })

      const result = await sendChatMessage(makeFormData('x'.repeat(10000)))

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('Message too long')
        expect(result.status).toBe(400)
      }
    })

    it('returns error with message field from response body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ message: 'Invalid format' }),
      })

      const result = await sendChatMessage(makeFormData('bad'))

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('Invalid format')
        expect(result.status).toBe(422)
      }
    })

    it('returns fallback error when response body is not JSON', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('Not JSON')),
      })

      const result = await sendChatMessage(makeFormData('test'))

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('500')
        expect(result.status).toBe(500)
      }
    })

    // -----------------------------------------------------------------------
    // sendChatMessage - 403 (Pro gating)
    // -----------------------------------------------------------------------

    it('returns 403 error for non-pro users', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'Pro subscription required' }),
      })

      const result = await sendChatMessage(makeFormData('test'))

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.status).toBe(403)
        expect(result.error).toBe('Pro subscription required')
      }
    })

    // -----------------------------------------------------------------------
    // sendChatMessage - timeout
    // -----------------------------------------------------------------------

    it('returns timeout error when request is aborted', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError')
      mockFetch.mockRejectedValue(abortError)

      const result = await sendChatMessage(makeFormData('test'))

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('CHAT_TIMEOUT')
        expect(result.status).toBe(408)
      }
    })

    // -----------------------------------------------------------------------
    // sendChatMessage - unknown errors
    // -----------------------------------------------------------------------

    it('returns generic error for unknown exceptions', async () => {
      mockFetch.mockRejectedValue(new Error('Network failed'))

      const result = await sendChatMessage(makeFormData('test'))

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('Network failed')
        expect(result.status).toBe(500)
      }
    })

    it('returns "Unknown error" for non-Error exceptions', async () => {
      mockFetch.mockRejectedValue('string error')

      const result = await sendChatMessage(makeFormData('test'))

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('CHAT_UNKNOWN_ERROR')
        expect(result.status).toBe(500)
      }
    })
  })
})
