import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth-api', () => ({
  getAuthHeaders: vi.fn().mockResolvedValue({
    Authorization: 'Bearer test-token',
  }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { getTags, createTag, updateTag, deleteTag, assignTags } =
  await import('@/app/actions/tags')

describe('tag server actions', () => {
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
  // getTags
  // -------------------------------------------------------------------------

  describe('getTags', () => {
    it('sends GET to /api/tags', async () => {
      const tags = [
        { id: 'tag-1', name: 'Health', color: '#ff0000' },
        { id: 'tag-2', name: 'Work', color: '#0000ff' },
      ]
      mockApiResponse(tags)

      const result = await getTags()

      expect(result).toEqual(tags)
      expect(result).toHaveLength(2)

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/tags')
      expect(init.method).toBe('GET')
    })

    it('includes auth headers', async () => {
      mockApiResponse([])

      await getTags()

      const [, init] = mockFetch.mock.calls[0]!
      expect(init.headers).toHaveProperty('Authorization', 'Bearer test-token')
    })

    it('returns empty array when no tags exist', async () => {
      mockApiResponse([])

      const result = await getTags()

      expect(result).toEqual([])
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Not authenticated' }, 401)

      await expect(getTags()).rejects.toThrow('Not authenticated')
    })
  })

  // -------------------------------------------------------------------------
  // createTag
  // -------------------------------------------------------------------------

  describe('createTag', () => {
    it('sends POST to /api/tags with name and color', async () => {
      mockApiResponse({ id: 'tag-new' })

      const result = await createTag('Fitness', '#00ff00')

      expect(result).toEqual({ id: 'tag-new' })

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/tags')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body)).toEqual({
        name: 'Fitness',
        color: '#00ff00',
      })
    })

    it('throws on duplicate name', async () => {
      mockApiResponse({ error: 'Tag name already exists' }, 409)

      await expect(createTag('Health', '#ff0000')).rejects.toThrow(
        'Tag name already exists',
      )
    })

    it('throws on validation error', async () => {
      mockApiResponse({ error: 'Name is required' }, 400)

      await expect(createTag('', '#ff0000')).rejects.toThrow(
        'Name is required',
      )
    })
  })

  // -------------------------------------------------------------------------
  // updateTag
  // -------------------------------------------------------------------------

  describe('updateTag', () => {
    it('sends PUT to /api/tags/:id with name and color', async () => {
      mock204()

      await updateTag('tag-1', 'Updated Name', '#abcdef')

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/tags/tag-1')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({
        name: 'Updated Name',
        color: '#abcdef',
      })
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Tag not found' }, 404)

      await expect(
        updateTag('nonexistent', 'Name', '#000000'),
      ).rejects.toThrow('Tag not found')
    })
  })

  // -------------------------------------------------------------------------
  // deleteTag
  // -------------------------------------------------------------------------

  describe('deleteTag', () => {
    it('sends DELETE to /api/tags/:id', async () => {
      mock204()

      await deleteTag('tag-1')

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/tags/tag-1')
      expect(init.method).toBe('DELETE')
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Not found' }, 404)

      await expect(deleteTag('nonexistent')).rejects.toThrow('Not found')
    })
  })

  // -------------------------------------------------------------------------
  // assignTags
  // -------------------------------------------------------------------------

  describe('assignTags', () => {
    it('sends PUT to /api/tags/:habitId/assign with tagIds', async () => {
      mock204()

      await assignTags('h-1', ['tag-1', 'tag-2'])

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/tags/h-1/assign')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ tagIds: ['tag-1', 'tag-2'] })
    })

    it('handles empty tagIds to unassign all', async () => {
      mock204()

      await assignTags('h-1', [])

      const [, init] = mockFetch.mock.calls[0]!
      expect(JSON.parse(init.body)).toEqual({ tagIds: [] })
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Habit not found' }, 404)

      await expect(assignTags('nonexistent', ['tag-1'])).rejects.toThrow(
        'Habit not found',
      )
    })
  })

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws with error message from response body', async () => {
      mockApiResponse({ error: 'Tag not found' }, 404)

      await expect(deleteTag('x')).rejects.toThrow('Tag not found')
    })

    it('throws with message field from response body', async () => {
      mockApiResponse({ message: 'Validation failed' }, 400)

      await expect(createTag('', '')).rejects.toThrow('Validation failed')
    })

    it('throws with status code when no error body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('No JSON')),
      })

      await expect(getTags()).rejects.toThrow('500')
    })
  })
})
