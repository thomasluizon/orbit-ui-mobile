import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { cheerKeys, friendKeys } from '@orbit/shared/query'

import { useCheers, useFriendFeed, useFriendProfile, useFriends, useSendCheer } from '@/hooks/use-friends'

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
})

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
    })
    await query.queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/friends/user-1/profile')
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
})
