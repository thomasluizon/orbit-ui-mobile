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

const {
  listChecklistTemplatesAction,
  createChecklistTemplateAction,
  deleteChecklistTemplateAction,
} = await import('@/app/actions/checklist-templates')

function mockJson(body: unknown, status = 200) {
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
    text: () => Promise.resolve(''),
  })
}

describe('checklist template server actions', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('listChecklistTemplatesAction', () => {
    it('GETs /api/checklist-templates and returns the body', async () => {
      const templates = [{ id: 't1', name: 'Morning', items: ['Wake up'] }]
      mockJson(templates)

      const result = await listChecklistTemplatesAction()

      expect(result).toEqual(templates)
      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/checklist-templates')
      expect(init.method).toBeUndefined()
    })

    it('forwards Bearer auth header', async () => {
      mockJson([])
      await listChecklistTemplatesAction()
      const [, init] = mockFetch.mock.calls[0]!
      expect(init.headers).toHaveProperty('Authorization', 'Bearer test-token')
    })
  })

  describe('createChecklistTemplateAction', () => {
    it('POSTs to /api/checklist-templates with the request body and returns the response', async () => {
      mockJson({ id: 'new-template' })

      const result = await createChecklistTemplateAction({
        name: 'Workout',
        items: ['Warmup', 'Main'],
      })

      expect(result).toEqual({ id: 'new-template' })
      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/checklist-templates')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body as string)).toEqual({
        name: 'Workout',
        items: ['Warmup', 'Main'],
      })
    })
  })

  describe('deleteChecklistTemplateAction', () => {
    it('DELETEs /api/checklist-templates/:id', async () => {
      mock204()

      await deleteChecklistTemplateAction('tmpl-1')

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/checklist-templates/tmpl-1')
      expect(init.method).toBe('DELETE')
    })

    it('resolves without throwing on 204 No Content', async () => {
      mock204()
      await expect(deleteChecklistTemplateAction('tmpl-1')).resolves.toBeUndefined()
    })

    it('accepts GUID-shaped ids', async () => {
      mock204()
      await deleteChecklistTemplateAction('abc12345-1234-4567-89ab-123456789abc')
      const [url] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/checklist-templates/abc12345-1234-4567-89ab-123456789abc')
    })

    it('rejects ids that try to traverse the URL path', async () => {
      await expect(
        deleteChecklistTemplateAction('abc/../../other-endpoint'),
      ).rejects.toThrow('Invalid template id')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('rejects empty ids', async () => {
      await expect(deleteChecklistTemplateAction('')).rejects.toThrow('Invalid template id')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('rejects overly long ids', async () => {
      await expect(
        deleteChecklistTemplateAction('a'.repeat(129)),
      ).rejects.toThrow('Invalid template id')
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
