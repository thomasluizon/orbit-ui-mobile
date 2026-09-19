import { describe, it, expect, vi, beforeEach } from 'vitest'

const { resolveServerSessionMock } = vi.hoisted(() => ({
  resolveServerSessionMock: vi.fn(),
}))

vi.mock('@/lib/auth-api', () => ({
  getAuthHeaders: vi.fn().mockResolvedValue({
    Authorization: 'Bearer test-token',
  }),
  resolveServerSession: resolveServerSessionMock,
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const habitServerActions = await import('@/app/actions/habits')
const { bindServerAction, runServerAction } = await import('@/lib/client-action')
const { useAuthStore } = await import('@/stores/auth-store')

const createHabit = bindServerAction(habitServerActions.createHabit)
const updateHabit = bindServerAction(habitServerActions.updateHabit)
const deleteHabit = bindServerAction(habitServerActions.deleteHabit)
const logHabit = bindServerAction(habitServerActions.logHabit)
const skipHabit = bindServerAction(habitServerActions.skipHabit)
const reorderHabits = bindServerAction(habitServerActions.reorderHabits)
const duplicateHabit = bindServerAction(habitServerActions.duplicateHabit)
const bulkCreateHabits = bindServerAction(habitServerActions.bulkCreateHabits)
const bulkDeleteHabits = bindServerAction(habitServerActions.bulkDeleteHabits)

describe('habit server actions', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    useAuthStore.setState({ sessionRefreshFailed: false })
    resolveServerSessionMock.mockReset()
    resolveServerSessionMock.mockResolvedValue({
      token: 'test-token',
      expiresAt: null,
      refreshed: false,
      refreshFailed: false,
    })
  })

  function mockApiResponse(body: any, status = 200) {
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


  describe('createHabit', () => {
    it('returns a serializable refresh rejection for the client boundary', async () => {
      resolveServerSessionMock
        .mockResolvedValueOnce({
          token: 'stale-token',
          expiresAt: null,
          refreshed: false,
          refreshFailed: false,
        })
        .mockResolvedValueOnce({
          token: null,
          expiresAt: null,
          refreshed: false,
          refreshFailed: true,
        })
      mockApiResponse({ error: 'Unauthorized' }, 401)

      const result = await habitServerActions.createHabit({ title: 'Exercise' }, null)

      const serializedResult = JSON.parse(JSON.stringify(result))
      expect(serializedResult).toEqual({
        ok: false,
        error: 'Unauthorized',
        status: 401,
        sessionRefreshFailed: true,
      })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ expiresAt: null, refreshFailed: true }),
      })
      await expect(runServerAction(Promise.resolve(serializedResult))).rejects.toThrow(
        'Unauthorized',
      )
      expect(useAuthStore.getState().sessionRefreshFailed).toBe(true)
    })

    it('sends POST to /api/habits with request body', async () => {
      mockApiResponse({ id: 'new-habit' })

      const result = await createHabit({ title: 'Exercise' }, null)

      expect(result).toEqual({ id: 'new-habit' })
      expect(mockFetch).toHaveBeenCalledTimes(1)

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/habits')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body)).toEqual({ title: 'Exercise' })
    })

    it('includes auth headers', async () => {
      mockApiResponse({ id: 'new-habit' })

      await createHabit({ title: 'Test' }, null)

      const [, init] = mockFetch.mock.calls[0]!
      expect(init.headers).toHaveProperty('Authorization', 'Bearer test-token')
    })

    it('throws on non-OK response', async () => {
      mockApiResponse({ error: 'Title is required' }, 400)

      await expect(createHabit({ title: '' }, null)).rejects.toThrow()
    })
  })


  describe('updateHabit', () => {
    it('sends PUT to /api/habits/:id', async () => {
      mock204()

      await updateHabit('h-1', {
        title: 'Updated',
        isBadHabit: false,
      }, null)

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/habits/h-1')
      expect(init.method).toBe('PUT')
    })
  })


  describe('deleteHabit', () => {
    it('sends DELETE to /api/habits/:id', async () => {
      mock204()

      await deleteHabit('h-1', null)

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/habits/h-1')
      expect(init.method).toBe('DELETE')
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Not found' }, 404)

      await expect(deleteHabit('nonexistent', null)).rejects.toThrow()
    })
  })


  describe('logHabit', () => {
    it('sends POST to /api/habits/:id/log', async () => {
      mockApiResponse({
        logId: 'log-1',
        isFirstCompletionToday: true,
        currentStreak: 5,
      })

      const result = await logHabit('h-1', undefined, null)

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/habits/h-1/log')
      expect(init.method).toBe('POST')
      expect(result.logId).toBe('log-1')
    })

    it('sends date in body when provided', async () => {
      mockApiResponse({
        logId: 'log-3',
        isFirstCompletionToday: false,
        currentStreak: 1,
      })

      await logHabit('h-1', { date: '2025-01-15' }, null)

      const [, init] = mockFetch.mock.calls[0]!
      const body = JSON.parse(init.body)
      expect(body.date).toBe('2025-01-15')
    })
  })


  describe('skipHabit', () => {
    it('sends POST to /api/habits/:id/skip', async () => {
      mock204()

      await skipHabit('h-1', undefined, null)

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/habits/h-1/skip')
      expect(init.method).toBe('POST')
    })

    it('sends date when provided', async () => {
      mock204()

      await skipHabit('h-1', '2025-01-15', null)

      const [, init] = mockFetch.mock.calls[0]!
      const body = JSON.parse(init.body)
      expect(body.date).toBe('2025-01-15')
    })
  })


  describe('reorderHabits', () => {
    it('sends PUT to /api/habits/reorder', async () => {
      mock204()

      await reorderHabits({
        positions: [
          { habitId: 'h-1', position: 1 },
          { habitId: 'h-2', position: 0 },
        ],
      }, null)

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/habits/reorder')
      expect(init.method).toBe('PUT')
    })
  })


  describe('duplicateHabit', () => {
    it('sends POST to /api/habits/:id/duplicate', async () => {
      mock204()

      await duplicateHabit('h-1', null)

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/habits/h-1/duplicate')
      expect(init.method).toBe('POST')
    })
  })


  describe('bulkCreateHabits', () => {
    it('sends POST to /api/habits/bulk', async () => {
      mockApiResponse({
        results: [
          { index: 0, status: 'Success', habitId: 'h-new', title: 'New', error: null, field: null },
        ],
      })

      const result = await bulkCreateHabits({
        habits: [{ title: 'New' }],
      }, null)

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/habits/bulk')
      expect(init.method).toBe('POST')
      expect(result.results).toHaveLength(1)
    })
  })


  describe('bulkDeleteHabits', () => {
    it('sends DELETE to /api/habits/bulk', async () => {
      mockApiResponse({
        results: [
          { index: 0, status: 'Success', habitId: 'h-1', error: null },
        ],
      })

      const result = await bulkDeleteHabits(['h-1'], null)

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/habits/bulk')
      expect(init.method).toBe('DELETE')
      expect(result.results).toHaveLength(1)
    })
  })


  describe('error handling', () => {
    it('throws with error message from response body', async () => {
      mockApiResponse({ error: 'Habit not found' }, 404)

      await expect(logHabit('nonexistent', undefined, null)).rejects.toThrow('Habit not found')
    })

    it('throws with message field from response body', async () => {
      mockApiResponse({ message: 'Validation failed' }, 400)

      await expect(createHabit({ title: '' }, null)).rejects.toThrow('Validation failed')
    })

    it('throws with status code when no error body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('No JSON')),
      })

      await expect(logHabit('h-1', undefined, null)).rejects.toThrow('500')
    })
  })
})
