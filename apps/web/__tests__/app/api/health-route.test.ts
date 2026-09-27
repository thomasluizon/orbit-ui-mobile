import { describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/health/route'

describe('GET /api/health', () => {
  it('returns 200 with the image commit without calling the API', async () => {
    vi.stubEnv('WEB_COMMIT_SHA', 'abc123')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    try {
      const response = GET()
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ status: 'ok', commit: 'abc123' })
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
