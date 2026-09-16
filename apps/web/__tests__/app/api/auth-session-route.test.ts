import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/auth/session/route'
import { resolveServerSession } from '@/lib/auth-api'

vi.mock('@/lib/auth-api', () => ({
  resolveServerSession: vi.fn(),
}))

describe('auth session route', () => {
  beforeEach(() => {
    vi.mocked(resolveServerSession).mockReset()
  })

  it('reports a failed refresh when no active session remains', async () => {
    vi.mocked(resolveServerSession).mockResolvedValue({
      token: null,
      expiresAt: null,
      refreshed: false,
      refreshFailed: true,
    })

    const response = await GET()

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      expiresAt: null,
      refreshFailed: true,
    })
  })
})
