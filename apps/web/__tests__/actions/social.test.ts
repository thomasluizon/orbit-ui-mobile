import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockServerAuthFetch = vi.fn()
vi.mock('@/lib/server-fetch', () => ({
  serverAuthFetch: mockServerAuthFetch,
}))

const {
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
  sendCheer,
  reportUser,
  setHandle,
} = await import('@/app/actions/social')

function unauthorized() {
  return Object.assign(new Error('Unauthorized'), { status: 401, code: 'UNAUTHORIZED' })
}

describe('social server actions', () => {
  beforeEach(() => {
    mockServerAuthFetch.mockReset()
  })

  it('sends a friend request through the friends endpoint', async () => {
    mockServerAuthFetch.mockResolvedValue({ id: 'friendship-1' })

    const result = await sendFriendRequest({ handle: 'ada' })

    expect(result).toEqual({ ok: true, data: { id: 'friendship-1' } })
    expect(mockServerAuthFetch).toHaveBeenCalledWith('/api/friends/requests', {
      method: 'POST',
      body: JSON.stringify({ handle: 'ada' }),
    })
  })

  it('sends a cheer through the cheers endpoint', async () => {
    mockServerAuthFetch.mockResolvedValue({ id: 'cheer-1' })

    const result = await sendCheer({ recipientId: 'user-2', note: 'nice work' })

    expect(result).toEqual({ ok: true, data: { id: 'cheer-1' } })
    expect(mockServerAuthFetch).toHaveBeenCalledWith('/api/friends/cheers', {
      method: 'POST',
      body: JSON.stringify({ recipientId: 'user-2', note: 'nice work' }),
    })
  })

  it('accepts a friend request through the accept endpoint', async () => {
    mockServerAuthFetch.mockResolvedValue(null)

    const result = await acceptFriendRequest('friendship-1')

    expect(result).toEqual({ ok: true, data: null })
    expect(mockServerAuthFetch).toHaveBeenCalledWith('/api/friends/requests/friendship-1/accept', {
      method: 'POST',
    })
  })

  it('forwards the backend error code when a call fails', async () => {
    mockServerAuthFetch.mockRejectedValue(
      Object.assign(new Error('Rate limited'), { status: 429, code: 'RATE_LIMITED' }),
    )

    const result = await sendFriendRequest({ handle: 'ada' })

    expect(result).toEqual({ ok: false, status: 429, code: 'RATE_LIMITED' })
  })

  it('rejects an unauthenticated call with 401 (serverAuthFetch throws before any request)', async () => {
    mockServerAuthFetch.mockRejectedValue(unauthorized())

    await expect(sendFriendRequest({ handle: 'ada' })).resolves.toEqual({
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
    })
    await expect(removeFriend('user-2')).resolves.toMatchObject({ ok: false, status: 401 })
    await expect(reportUser({ reportedUserId: 'user-2', reason: 'Spam' })).resolves.toMatchObject({
      ok: false,
      status: 401,
    })
    await expect(setHandle('ada')).resolves.toMatchObject({ ok: false, status: 401 })
  })
})
