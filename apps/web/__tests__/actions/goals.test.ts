import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth-api', () => ({
  getAuthHeaders: vi.fn().mockResolvedValue({
    Authorization: 'Bearer test-token',
  }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const {
  createGoal,
  updateGoal,
  deleteGoal,
  updateGoalProgress,
  updateGoalStatus,
  reorderGoals,
  linkHabitsToGoal,
} = await import('@/app/actions/goals')

describe('goal server actions', () => {
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
  // createGoal
  // -------------------------------------------------------------------------

  describe('createGoal', () => {
    it('sends POST to /api/goals with request body', async () => {
      mockApiResponse({ id: 'goal-1' })

      const result = await createGoal({
        title: 'Learn TypeScript',
        targetValue: 100,
        unit: 'lessons',
      })

      expect(result).toEqual({ id: 'goal-1' })
      expect(mockFetch).toHaveBeenCalledTimes(1)

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/goals')
      expect(init.method).toBe('POST')
      const body = JSON.parse(init.body)
      expect(body.title).toBe('Learn TypeScript')
      expect(body.targetValue).toBe(100)
    })

    it('includes auth headers', async () => {
      mockApiResponse({ id: 'goal-1' })

      await createGoal({ title: 'Test Goal', targetValue: 100, unit: 'km' })

      const [, init] = mockFetch.mock.calls[0]!
      expect(init.headers).toHaveProperty('Authorization', 'Bearer test-token')
    })

    it('throws on non-OK response', async () => {
      mockApiResponse({ error: 'Title is required' }, 400)

      await expect(createGoal({ title: '', targetValue: 0, unit: '' })).rejects.toThrow('Title is required')
    })
  })

  // -------------------------------------------------------------------------
  // updateGoal
  // -------------------------------------------------------------------------

  describe('updateGoal', () => {
    it('sends PUT to /api/goals/:id', async () => {
      mock204()

      await updateGoal('goal-1', { title: 'Updated Goal', targetValue: 100, unit: 'km' })

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/goals/goal-1')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ title: 'Updated Goal', targetValue: 100, unit: 'km' })
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Goal not found' }, 404)

      await expect(updateGoal('nonexistent', { title: 'X', targetValue: 50, unit: 'km' })).rejects.toThrow(
        'Goal not found',
      )
    })
  })

  // -------------------------------------------------------------------------
  // deleteGoal
  // -------------------------------------------------------------------------

  describe('deleteGoal', () => {
    it('sends DELETE to /api/goals/:id', async () => {
      mock204()

      await deleteGoal('goal-1')

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/goals/goal-1')
      expect(init.method).toBe('DELETE')
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Not found' }, 404)

      await expect(deleteGoal('nonexistent')).rejects.toThrow('Not found')
    })
  })

  // -------------------------------------------------------------------------
  // updateGoalProgress
  // -------------------------------------------------------------------------

  describe('updateGoalProgress', () => {
    it('sends PUT to /api/goals/:id/progress', async () => {
      mock204()

      await updateGoalProgress('goal-1', { currentValue: 50 })

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/goals/goal-1/progress')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ currentValue: 50 })
    })

    it('throws on non-OK response', async () => {
      mockApiResponse({ error: 'Invalid value' }, 400)

      await expect(
        updateGoalProgress('goal-1', { currentValue: -1 }),
      ).rejects.toThrow('Invalid value')
    })
  })

  // -------------------------------------------------------------------------
  // updateGoalStatus
  // -------------------------------------------------------------------------

  describe('updateGoalStatus', () => {
    it('sends PUT to /api/goals/:id/status', async () => {
      mock204()

      await updateGoalStatus('goal-1', { status: 'Completed' })

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/goals/goal-1/status')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ status: 'Completed' })
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Invalid status' }, 400)

      await expect(
        updateGoalStatus('goal-1', { status: 'invalid' as never }),
      ).rejects.toThrow('Invalid status')
    })
  })

  // -------------------------------------------------------------------------
  // reorderGoals
  // -------------------------------------------------------------------------

  describe('reorderGoals', () => {
    it('sends PUT to /api/goals/reorder with positions', async () => {
      mock204()

      await reorderGoals([
        { id: 'goal-1', position: 1 },
        { id: 'goal-2', position: 0 },
      ])

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/goals/reorder')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({
        positions: [
          { id: 'goal-1', position: 1 },
          { id: 'goal-2', position: 0 },
        ],
      })
    })

    it('handles empty positions array', async () => {
      mock204()

      await reorderGoals([])

      const [, init] = mockFetch.mock.calls[0]!
      expect(JSON.parse(init.body)).toEqual({ positions: [] })
    })
  })

  // -------------------------------------------------------------------------
  // linkHabitsToGoal
  // -------------------------------------------------------------------------

  describe('linkHabitsToGoal', () => {
    it('sends PUT to /api/goals/:id/habits', async () => {
      mock204()

      await linkHabitsToGoal('goal-1', ['h-1', 'h-2'])

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/goals/goal-1/habits')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ habitIds: ['h-1', 'h-2'] })
    })

    it('handles empty habit ids to unlink all', async () => {
      mock204()

      await linkHabitsToGoal('goal-1', [])

      const [, init] = mockFetch.mock.calls[0]!
      expect(JSON.parse(init.body)).toEqual({ habitIds: [] })
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Goal not found' }, 404)

      await expect(
        linkHabitsToGoal('nonexistent', ['h-1']),
      ).rejects.toThrow('Goal not found')
    })
  })

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws with error message from response body', async () => {
      mockApiResponse({ error: 'Goal not found' }, 404)

      await expect(deleteGoal('nonexistent')).rejects.toThrow('Goal not found')
    })

    it('throws with message field from response body', async () => {
      mockApiResponse({ message: 'Validation failed' }, 400)

      await expect(createGoal({ title: '', targetValue: 0, unit: '' })).rejects.toThrow('Validation failed')
    })

    it('throws with status code when no error body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('No JSON')),
      })

      await expect(deleteGoal('goal-1')).rejects.toThrow('500')
    })
  })
})
