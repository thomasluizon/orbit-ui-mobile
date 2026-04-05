import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth-api', () => ({
  getAuthHeaders: vi.fn().mockResolvedValue({
    Authorization: 'Bearer test-token',
  }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const {
  bulkLogHabits,
  bulkSkipHabits,
  createSubHabit,
  moveHabitParent,
  updateChecklist,
  linkGoalsToHabit,
} = await import('@/app/actions/habits')

describe('habit server actions (extended)', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  function mockApiResponse(body: unknown, status = 200) {
    mockFetch.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
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
  // bulkLogHabits
  // -------------------------------------------------------------------------

  describe('bulkLogHabits', () => {
    it('sends POST to /api/habits/bulk/log with items', async () => {
      mockApiResponse({
        results: [
          { habitId: 'h-1', status: 'Success', logId: 'log-1', error: null },
        ],
      })

      const result = await bulkLogHabits([{ habitId: 'h-1' }])

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/habits/bulk/log')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body)).toEqual({ items: [{ habitId: 'h-1' }] })
      expect(result.results).toHaveLength(1)
    })

    it('sends multiple items', async () => {
      mockApiResponse({
        results: [
          { habitId: 'h-1', status: 'Success', logId: 'log-1', error: null },
          { habitId: 'h-2', status: 'Success', logId: 'log-2', error: null },
        ],
      })

      const items = [
        { habitId: 'h-1', note: 'Done' },
        { habitId: 'h-2', date: '2025-01-15' },
      ]
      const result = await bulkLogHabits(items)

      const [, init] = mockFetch.mock.calls[0]!
      expect(JSON.parse(init.body)).toEqual({ items })
      expect(result.results).toHaveLength(2)
    })

    it('throws on non-OK response', async () => {
      mockApiResponse({ error: 'Bulk log failed' }, 400)

      await expect(
        bulkLogHabits([{ habitId: 'h-1' }]),
      ).rejects.toThrow('Bulk log failed')
    })
  })

  // -------------------------------------------------------------------------
  // bulkSkipHabits
  // -------------------------------------------------------------------------

  describe('bulkSkipHabits', () => {
    it('sends POST to /api/habits/bulk/skip with items', async () => {
      mockApiResponse({
        results: [{ habitId: 'h-1', status: 'Success', error: null }],
      })

      const result = await bulkSkipHabits([{ habitId: 'h-1' }])

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/habits/bulk/skip')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body)).toEqual({ items: [{ habitId: 'h-1' }] })
      expect(result.results).toHaveLength(1)
    })

    it('sends date per item when provided', async () => {
      mockApiResponse({
        results: [{ habitId: 'h-1', status: 'Success', error: null }],
      })

      await bulkSkipHabits([{ habitId: 'h-1', date: '2025-01-15' }])

      const [, init] = mockFetch.mock.calls[0]!
      expect(JSON.parse(init.body)).toEqual({
        items: [{ habitId: 'h-1', date: '2025-01-15' }],
      })
    })

    it('throws on non-OK response', async () => {
      mockApiResponse({ error: 'Bulk skip failed' }, 400)

      await expect(
        bulkSkipHabits([{ habitId: 'h-1' }]),
      ).rejects.toThrow('Bulk skip failed')
    })
  })

  // -------------------------------------------------------------------------
  // createSubHabit
  // -------------------------------------------------------------------------

  describe('createSubHabit', () => {
    it('sends POST to /api/habits/:parentId/sub-habits', async () => {
      mock204()

      await createSubHabit('parent-1', { title: 'Sub Task' })

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/habits/parent-1/sub-habits')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body)).toEqual({ title: 'Sub Task' })
    })

    it('includes auth headers', async () => {
      mock204()

      await createSubHabit('parent-1', { title: 'Sub' })

      const [, init] = mockFetch.mock.calls[0]!
      expect(init.headers).toHaveProperty('Authorization', 'Bearer test-token')
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Parent not found' }, 404)

      await expect(
        createSubHabit('nonexistent', { title: 'Sub' }),
      ).rejects.toThrow('Parent not found')
    })
  })

  // -------------------------------------------------------------------------
  // moveHabitParent
  // -------------------------------------------------------------------------

  describe('moveHabitParent', () => {
    it('sends PUT to /api/habits/:id/parent', async () => {
      mock204()

      await moveHabitParent('h-1', { parentId: 'parent-2' })

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/habits/h-1/parent')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ parentId: 'parent-2' })
    })

    it('sends null parentId to make top-level', async () => {
      mock204()

      await moveHabitParent('h-1', { parentId: null })

      const [, init] = mockFetch.mock.calls[0]!
      expect(JSON.parse(init.body)).toEqual({ parentId: null })
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Circular reference' }, 400)

      await expect(
        moveHabitParent('h-1', { parentId: 'h-1' }),
      ).rejects.toThrow('Circular reference')
    })
  })

  // -------------------------------------------------------------------------
  // updateChecklist
  // -------------------------------------------------------------------------

  describe('updateChecklist', () => {
    it('sends PUT to /api/habits/:id/checklist', async () => {
      mock204()

      const items = [
        { text: 'Step 1', isChecked: false },
        { text: 'Step 2', isChecked: true },
      ]

      await updateChecklist('h-1', items)

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/habits/h-1/checklist')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ checklistItems: items })
    })

    it('handles empty checklist', async () => {
      mock204()

      await updateChecklist('h-1', [])

      const [, init] = mockFetch.mock.calls[0]!
      expect(JSON.parse(init.body)).toEqual({ checklistItems: [] })
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Habit not found' }, 404)

      await expect(
        updateChecklist('nonexistent', []),
      ).rejects.toThrow('Habit not found')
    })
  })

  // -------------------------------------------------------------------------
  // linkGoalsToHabit
  // -------------------------------------------------------------------------

  describe('linkGoalsToHabit', () => {
    it('sends PUT to /api/habits/:id/goals', async () => {
      mock204()

      await linkGoalsToHabit('h-1', ['g-1', 'g-2'])

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/habits/h-1/goals')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ goalIds: ['g-1', 'g-2'] })
    })

    it('handles empty goal ids to unlink all', async () => {
      mock204()

      await linkGoalsToHabit('h-1', [])

      const [, init] = mockFetch.mock.calls[0]!
      expect(JSON.parse(init.body)).toEqual({ goalIds: [] })
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Goal not found' }, 404)

      await expect(
        linkGoalsToHabit('h-1', ['nonexistent']),
      ).rejects.toThrow('Goal not found')
    })
  })
})
