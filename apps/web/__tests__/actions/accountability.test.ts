import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { InviteAccountabilityBuddyRequest } from '@orbit/shared/types/accountability'

const mockServerAuthFetch = vi.fn()
vi.mock('@/lib/server-fetch', () => ({
  serverAuthFetch: mockServerAuthFetch,
}))

const {
  inviteAccountabilityBuddy,
  acceptAccountabilityPair,
  endAccountabilityPair,
  setAccountabilityHabits,
  checkInAccountability,
} = await import('@/app/actions/accountability')

const inviteInput: InviteAccountabilityBuddyRequest = {
  buddyUserId: 'user-2',
  cadence: 'Daily',
  habitIds: ['habit-1'],
}

function unauthorized() {
  return Object.assign(new Error('Unauthorized'), { status: 401, code: 'UNAUTHORIZED' })
}

describe('accountability server actions', () => {
  beforeEach(() => {
    mockServerAuthFetch.mockReset()
  })

  it('invites a buddy through the pairs endpoint', async () => {
    mockServerAuthFetch.mockResolvedValue({ id: 'pair-1' })

    const result = await inviteAccountabilityBuddy(inviteInput)

    expect(result).toEqual({ ok: true, data: { id: 'pair-1' } })
    expect(mockServerAuthFetch).toHaveBeenCalledWith('/api/accountability/pairs', {
      method: 'POST',
      body: JSON.stringify(inviteInput),
    })
  })

  it('checks in through the check-ins endpoint', async () => {
    mockServerAuthFetch.mockResolvedValue({ id: 'checkin-1' })

    const result = await checkInAccountability('pair-1', { note: 'done' })

    expect(result).toEqual({ ok: true, data: { id: 'checkin-1' } })
    expect(mockServerAuthFetch).toHaveBeenCalledWith('/api/accountability/pairs/pair-1/check-ins', {
      method: 'POST',
      body: JSON.stringify({ note: 'done' }),
    })
  })

  it('forwards the backend error code when a call fails', async () => {
    mockServerAuthFetch.mockRejectedValue(
      Object.assign(new Error('Conflict'), { status: 409, code: 'PAIR_ALREADY_EXISTS' }),
    )

    const result = await inviteAccountabilityBuddy(inviteInput)

    expect(result).toEqual({ ok: false, status: 409, code: 'PAIR_ALREADY_EXISTS' })
  })

  it('rejects an unauthenticated call with 401 (serverAuthFetch throws before any request)', async () => {
    mockServerAuthFetch.mockRejectedValue(unauthorized())

    await expect(inviteAccountabilityBuddy(inviteInput)).resolves.toEqual({
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
    })
    await expect(acceptAccountabilityPair('pair-1', { habitIds: ['habit-1'] })).resolves.toMatchObject({
      ok: false,
      status: 401,
    })
    await expect(endAccountabilityPair('pair-1')).resolves.toMatchObject({ ok: false, status: 401 })
    await expect(
      setAccountabilityHabits('pair-1', { habitIds: ['habit-1'] }),
    ).resolves.toMatchObject({ ok: false, status: 401 })
  })
})
