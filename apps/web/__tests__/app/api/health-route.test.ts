import { describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/health/route'

describe('GET /api/health', () => {
  it('returns 200 without calling the API', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    try {
      expect(GET().status).toBe(200)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
