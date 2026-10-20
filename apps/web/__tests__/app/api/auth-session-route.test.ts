import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/auth/session/route'
import { getAccountIdFromToken, resolveServerSession } from '@/lib/auth-api'

vi.mock('@/lib/auth-api', () => ({
  resolveServerSession: vi.fn(),
  getAccountIdFromToken: vi.fn(),
}))

describe('auth session route', () => {
  beforeEach(() => {
    vi.mocked(resolveServerSession).mockReset()
    vi.mocked(getAccountIdFromToken).mockReset()
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
      userId: null,
      refreshFailed: true,
    })
  })

  it('names the account the cookie belongs to on an active session', async () => {
    vi.mocked(resolveServerSession).mockResolvedValue({
      token: 'access-token',
      expiresAt: 1_700_000_000_000,
      refreshed: false,
      refreshFailed: false,
    })
    vi.mocked(getAccountIdFromToken).mockReturnValue('account-b')

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      expiresAt: 1_700_000_000_000,
      userId: 'account-b',
      refreshFailed: false,
    })
    expect(getAccountIdFromToken).toHaveBeenCalledWith('access-token')
  })
})
