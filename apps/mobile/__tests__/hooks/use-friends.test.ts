import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { cheerKeys, friendKeys, profileKeys } from '@orbit/shared/query'

import {
  useAcceptFriendRequest,
  useBlockUser,
  useCheers,
  useFriendFeed,
  useFriendProfile,
  useFriends,
  useInvitePreview,
  useRemoveFriend,
  useReportUser,
  useSendCheer,
  useSendFriendRequest,
  useSetHandle,
  useSetSocialOptIn,
} from '@/hooks/use-friends'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  queries: [] as Array<{
    queryKey: readonly unknown[]
    queryFn: (context?: { pageParam?: unknown }) => unknown
  }>,
  mutations: [] as Array<{ mutationFn: (variables: unknown) => unknown }>,
  apiClient: vi.fn(),
  invalidateQueries: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: readonly unknown[]; queryFn: () => unknown }) => {
    mocks.queries.push(options)
    return { data: undefined, isLoading: false }
  },
  useInfiniteQuery: (options: {
    queryKey: readonly unknown[]
    queryFn: (context?: { pageParam?: unknown }) => unknown
  }) => {
    mocks.queries.push(options)
    return { data: undefined, isLoading: false }
  },
  useMutation: (options: { mutationFn: (variables: unknown) => unknown }) => {
    mocks.mutations.push(options)
    return { mutateAsync: vi.fn(), isPending: false }
  },
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: (...args: unknown[]) => mocks.apiClient(...args),
}))

function renderHook(hook: () => unknown) {
  function Probe() {
    hook()
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Probe))
  })
}

beforeEach(() => {
  mocks.queries = []
  mocks.mutations = []
  mocks.apiClient.mockReset()
  mocks.invalidateQueries.mockClear()
})

type MutationOptions = {
  mutationFn: (variables: unknown) => unknown
  onSuccess?: () => void
}

function lastMutation(): MutationOptions {
  return mocks.mutations.at(-1) as unknown as MutationOptions
}

type QueryOptions = {
  queryKey: readonly unknown[]
  queryFn: (context?: { pageParam?: unknown }) => unknown
  enabled?: boolean
  getNextPageParam?: (lastPage: { nextCursor: string | null }) => string | null
}

function lastQuery(): QueryOptions {
  return mocks.queries.at(-1) as unknown as QueryOptions
}

describe('useFriends hooks (mobile)', () => {
  it('keys the friends query and fetches the friends endpoint', async () => {
    renderHook(() => useFriends())
    const query = mocks.queries.at(-1)!
    expect(query.queryKey).toEqual(friendKeys.list())

    mocks.apiClient.mockResolvedValue({ friends: [], incomingRequests: [], outgoingRequests: [] })
    await query.queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith(API.friends.list)
  })

  it('keys the feed query and requests the first keyset page', async () => {
    renderHook(() => useFriendFeed())
    const query = mocks.queries.at(-1)!
    expect(query.queryKey).toEqual(friendKeys.feed())

    mocks.apiClient.mockResolvedValue({ items: [], nextCursor: null })
    await query.queryFn({ pageParam: null })
    expect(mocks.apiClient).toHaveBeenCalledWith(
      expect.stringContaining('/api/friends/feed?pageSize=20'),
    )
  })

  it('keys the friend profile query by userId and fetches the profile endpoint', async () => {
    renderHook(() => useFriendProfile('user-1'))
    const query = mocks.queries.at(-1)!
    expect(query.queryKey).toEqual(friendKeys.profile('user-1'))

    mocks.apiClient.mockResolvedValue({
      userId: '11111111-1111-1111-1111-111111111111',
      handle: 'grace_h',
      displayName: 'Grace Hopper',
      currentStreak: 12,
      level: 4,
      achievements: [],
      longestStreak: 20,
      levelTitle: 'Explorer',
      totalXp: 1450,
      friendsSinceUtc: '2026-05-01T00:00:00Z',
      weeklyActivity: [1, 0, 2, 3, 0, 1, 4],
      topHabits: [],
      isAccountabilityPartner: false,
      sharedChallenges: [],
    })
    await query.queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/friends/user-1/profile')
  })

  it('keys the invite preview by code and fetches the invite-preview endpoint', async () => {
    renderHook(() => useInvitePreview('ABCD2345'))
    const query = mocks.queries.at(-1)!
    expect(query.queryKey).toEqual(friendKeys.invitePreview('ABCD2345'))

    mocks.apiClient.mockResolvedValue({
      handle: 'grace_h',
      displayName: 'Grace Hopper',
      isSelf: false,
      isAlreadyFriend: false,
      hasPendingRequest: false,
    })
    await query.queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/friends/invite-preview?code=ABCD2345')
  })

  it('keys the cheers query by direction and fetches received cheers', async () => {
    renderHook(() => useCheers('received'))
    const query = mocks.queries.at(-1)!
    expect(query.queryKey).toEqual(cheerKeys.list('received'))

    mocks.apiClient.mockResolvedValue({ items: [] })
    await query.queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith(expect.stringContaining('direction=received'))
  })

  it('sends a cheer without a habitId', async () => {
    renderHook(() => useSendCheer())
    const mutation = mocks.mutations.at(-1)!

    mocks.apiClient.mockResolvedValue({ id: 'cheer-1' })
    await mutation.mutationFn({ recipientId: 'user-1', note: 'Keep going!' })

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.friends.cheers,
      expect.objectContaining({ method: 'POST' }),
    )
    const lastCall = mocks.apiClient.mock.calls.at(-1)!
    const body = JSON.parse((lastCall[1] as { body: string }).body)
    expect(body).toEqual({ recipientId: 'user-1', note: 'Keep going!' })
    expect('habitId' in body).toBe(false)
  })

  it('appends an encoded keyset cursor and threads nextCursor through pagination', async () => {
    renderHook(() => useFriendFeed())
    const query = lastQuery()

    mocks.apiClient.mockResolvedValue({ items: [], nextCursor: 'next-2' })
    await query.queryFn?.({ pageParam: 'a b/c' })

    expect(mocks.apiClient).toHaveBeenCalledWith(
      expect.stringContaining('&cursor=a%20b%2Fc'),
    )
    expect(query.getNextPageParam?.({ nextCursor: 'next-2' })).toBe('next-2')
    expect(query.getNextPageParam?.({ nextCursor: null })).toBeNull()
  })

  it('disables the friend-profile query until a friend is selected', () => {
    renderHook(() => useFriendProfile(null))
    const query = lastQuery()

    expect(query.enabled).toBe(false)
    expect(query.queryKey).toEqual(friendKeys.profile(''))
  })

  it('disables the invite-preview query until a code is present', () => {
    renderHook(() => useInvitePreview(null))
    const query = lastQuery()

    expect(query.enabled).toBe(false)
    expect(query.queryKey).toEqual(friendKeys.invitePreview(''))
  })

  it('respects an explicit enabled:false gate on the friends list', () => {
    renderHook(() => useFriends({ enabled: false }))
    expect(lastQuery().enabled).toBe(false)
  })

  it('rejects when the friends payload fails schema validation', async () => {
    renderHook(() => useFriends())
    const query = lastQuery()

    mocks.apiClient.mockResolvedValue({ unexpected: true })
    await expect(query.queryFn?.()).rejects.toThrow()
  })

  it('posts a friend request and invalidates the friends cache on success', async () => {
    renderHook(() => useSendFriendRequest())
    const mutation = lastMutation()

    mocks.apiClient.mockResolvedValue({ id: 'req-1' })
    await mutation.mutationFn({ referralCode: 'ABCD2345' })

    const lastCall = mocks.apiClient.mock.calls.at(-1)!
    expect(lastCall[0]).toBe(API.friends.requests)
    expect(JSON.parse((lastCall[1] as { body: string }).body)).toEqual({ referralCode: 'ABCD2345' })

    mutation.onSuccess?.()
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: friendKeys.all })
  })

  it('surfaces a failed friend request to the caller', async () => {
    renderHook(() => useSendFriendRequest())
    const mutation = lastMutation()

    mocks.apiClient.mockRejectedValue(new Error('already friends'))
    await expect(mutation.mutationFn({ handle: 'grace_h' })).rejects.toThrow('already friends')
    expect(mocks.invalidateQueries).not.toHaveBeenCalled()
  })

  it('accepts a friend request against the accept endpoint and invalidates friends', async () => {
    renderHook(() => useAcceptFriendRequest())
    const mutation = lastMutation()

    mocks.apiClient.mockResolvedValue(undefined)
    await mutation.mutationFn('friendship-1')

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.friends.acceptRequest('friendship-1'),
      expect.objectContaining({ method: 'POST' }),
    )
    mutation.onSuccess?.()
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: friendKeys.all })
  })

  it('removes a friend with a DELETE and invalidates friends', async () => {
    renderHook(() => useRemoveFriend())
    const mutation = lastMutation()

    mocks.apiClient.mockResolvedValue(undefined)
    await mutation.mutationFn('user-9')

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.friends.remove('user-9'),
      expect.objectContaining({ method: 'DELETE' }),
    )
    mutation.onSuccess?.()
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: friendKeys.all })
  })

  it('blocks a user and invalidates both the friends and cheers caches', async () => {
    renderHook(() => useBlockUser())
    const mutation = lastMutation()

    mocks.apiClient.mockResolvedValue(undefined)
    await mutation.mutationFn('user-3')

    const lastCall = mocks.apiClient.mock.calls.at(-1)!
    expect(lastCall[0]).toBe(API.friends.block)
    expect(JSON.parse((lastCall[1] as { body: string }).body)).toEqual({ blockedUserId: 'user-3' })

    mutation.onSuccess?.()
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: friendKeys.all })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: cheerKeys.all })
  })

  it('reports a user without touching any cached query', async () => {
    renderHook(() => useReportUser())
    const mutation = lastMutation()

    mocks.apiClient.mockResolvedValue({ id: 'report-1' })
    await mutation.mutationFn({ reportedUserId: 'user-4', reason: 'Spam' })

    const lastCall = mocks.apiClient.mock.calls.at(-1)!
    expect(lastCall[0]).toBe(API.friends.report)
    expect(JSON.parse((lastCall[1] as { body: string }).body)).toEqual({
      reportedUserId: 'user-4',
      reason: 'Spam',
    })
    expect(mutation.onSuccess).toBeUndefined()
    expect(mocks.invalidateQueries).not.toHaveBeenCalled()
  })

  it('sets the handle against the profile endpoint and invalidates the profile cache', async () => {
    renderHook(() => useSetHandle())
    const mutation = lastMutation()

    mocks.apiClient.mockResolvedValue(undefined)
    await mutation.mutationFn('grace_h')

    const lastCall = mocks.apiClient.mock.calls.at(-1)!
    expect(lastCall[0]).toBe(API.profile.handle)
    expect(lastCall[1]).toMatchObject({ method: 'PUT' })
    expect(JSON.parse((lastCall[1] as { body: string }).body)).toEqual({ handle: 'grace_h' })

    mutation.onSuccess?.()
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: profileKeys.all })
  })

  it('toggles the social opt-in flag and invalidates the profile cache', async () => {
    renderHook(() => useSetSocialOptIn())
    const mutation = lastMutation()

    mocks.apiClient.mockResolvedValue(undefined)
    await mutation.mutationFn(true)

    const lastCall = mocks.apiClient.mock.calls.at(-1)!
    expect(lastCall[0]).toBe(API.profile.socialOptIn)
    expect(JSON.parse((lastCall[1] as { body: string }).body)).toEqual({ enabled: true })

    mutation.onSuccess?.()
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: profileKeys.all })
  })
})
