import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  createMockFriendSummary,
  createMockCheer,
  createMockFriendFeedItem,
  createMockFriendRequestSummary,
} from '@orbit/shared/__tests__/factories'
import type { FriendProfileView } from '@orbit/shared/types/social'
import {
  useFriends,
  useFriendFeed,
  useCheers,
  useFriendProfile,
  useInvitePreview,
  useSendFriendRequest,
  useAcceptFriendRequest,
  useRemoveFriend,
  useSendCheer,
  useBlockUser,
  useReportUser,
  useSetHandle,
  useSetSocialOptIn,
} from '@/hooks/use-friends'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

vi.mock('@/app/actions/social', () => ({
  sendFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  removeFriend: vi.fn(),
  sendCheer: vi.fn(),
  blockUser: vi.fn(),
  reportUser: vi.fn(),
  setHandle: vi.fn(),
  setSocialOptIn: vi.fn(),
}))

function okJson(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) }
}

function errJson(status: number, body: unknown = { error: 'nope' }) {
  return { ok: false, status, json: () => Promise.resolve(body) }
}

const profileView: FriendProfileView = {
  userId: 'user-1',
  handle: 'ada',
  displayName: 'Ada Lovelace',
  currentStreak: 12,
  longestStreak: 40,
  level: 4,
  levelTitle: 'Navigator',
  totalXp: 820,
  friendsSinceUtc: '2026-05-01T00:00:00Z',
  weeklyActivity: [0, 1, 0, 2, 0, 3, 1],
  achievements: [],
  topHabits: [],
  isAccountabilityPartner: false,
  sharedChallenges: [],
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { queryClient, wrapper }
}

describe('useFriends queries', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches and parses the friends response', async () => {
    mockFetch.mockResolvedValue(
      okJson({
        friends: [createMockFriendSummary({ userId: 'f-1' })],
        incomingRequests: [createMockFriendRequestSummary({ id: 'r-1' })],
        outgoingRequests: [],
      }),
    )

    const { result } = renderHook(() => useFriends(), { wrapper: createWrapper().wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data!.friends).toHaveLength(1)
    expect(result.current.data!.incomingRequests[0]!.id).toBe('r-1')
  })

  it('never fetches when disabled', () => {
    const { result } = renderHook(() => useFriends({ enabled: false }), {
      wrapper: createWrapper().wrapper,
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('surfaces a backend error as isError', async () => {
    mockFetch.mockResolvedValue(errJson(500))
    const { result } = renderHook(() => useFriends(), { wrapper: createWrapper().wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('requests the feed page with the page size and exposes the next cursor', async () => {
    mockFetch.mockResolvedValue(
      okJson({ items: [createMockFriendFeedItem()], nextCursor: 'cursor-2' }),
    )
    const { result } = renderHook(() => useFriendFeed(), { wrapper: createWrapper().wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = mockFetch.mock.calls[0]![0] as string
    expect(url).toContain('pageSize=20')
    expect(result.current.hasNextPage).toBe(true)
  })

  it('passes the cheer direction through the query string', async () => {
    mockFetch.mockResolvedValue(okJson({ items: [createMockCheer()] }))
    const { result } = renderHook(() => useCheers('sent'), { wrapper: createWrapper().wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockFetch.mock.calls[0]![0] as string).toContain('direction=sent')
  })

  it('gates the friend profile on a userId and parses when provided', async () => {
    const idle = renderHook(() => useFriendProfile(null), { wrapper: createWrapper().wrapper })
    expect(idle.result.current.fetchStatus).toBe('idle')

    mockFetch.mockResolvedValue(okJson(profileView))
    const { result } = renderHook(() => useFriendProfile('user-1'), {
      wrapper: createWrapper().wrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data!.handle).toBe('ada')
  })

  it('does not retry a 404 friend profile', async () => {
    mockFetch.mockResolvedValue(errJson(404))
    const { result } = renderHook(() => useFriendProfile('missing'), {
      wrapper: createWrapper().wrapper,
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('gates the invite preview on a code', async () => {
    const idle = renderHook(() => useInvitePreview(null), { wrapper: createWrapper().wrapper })
    expect(idle.result.current.fetchStatus).toBe('idle')

    mockFetch.mockResolvedValue(
      okJson({
        handle: 'ada',
        displayName: 'Ada',
        isSelf: false,
        isAlreadyFriend: false,
        hasPendingRequest: false,
      }),
    )
    const { result } = renderHook(() => useInvitePreview('abc'), {
      wrapper: createWrapper().wrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data!.handle).toBe('ada')
  })
})

describe('useFriends mutations', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('sends a friend request and invalidates the friends cache', async () => {
    const { sendFriendRequest } = await import('@/app/actions/social')
    vi.mocked(sendFriendRequest).mockResolvedValue({ ok: true, data: { id: 'fr-1' } })
    const { queryClient, wrapper } = createWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useSendFriendRequest(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ handle: 'ada' })
    })

    expect(sendFriendRequest).toHaveBeenCalledWith({ handle: 'ada' })
    expect(invalidate).toHaveBeenCalled()
  })

  it('unwraps a failed action result into a thrown error', async () => {
    const { acceptFriendRequest } = await import('@/app/actions/social')
    vi.mocked(acceptFriendRequest).mockResolvedValue({ ok: false, status: 409, code: 'ALREADY_FRIENDS' })
    const { result } = renderHook(() => useAcceptFriendRequest(), { wrapper: createWrapper().wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync('r-1')).rejects.toMatchObject({ status: 409 })
    })
  })

  it('removes a friend through the action', async () => {
    const { removeFriend } = await import('@/app/actions/social')
    vi.mocked(removeFriend).mockResolvedValue({ ok: true, data: null })
    const { result } = renderHook(() => useRemoveFriend(), { wrapper: createWrapper().wrapper })
    await act(async () => {
      await result.current.mutateAsync('f-1')
    })
    expect(removeFriend).toHaveBeenCalledWith('f-1')
  })

  it('sends a cheer and invalidates the cheers cache', async () => {
    const { sendCheer } = await import('@/app/actions/social')
    vi.mocked(sendCheer).mockResolvedValue({ ok: true, data: { id: 'cheer-1' } })
    const { queryClient, wrapper } = createWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useSendCheer(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ recipientId: 'u-2', note: 'nice' })
    })
    expect(sendCheer).toHaveBeenCalledWith({ recipientId: 'u-2', note: 'nice' })
    expect(invalidate).toHaveBeenCalled()
  })

  it('blocks a user and invalidates both friends and cheers', async () => {
    const { blockUser } = await import('@/app/actions/social')
    vi.mocked(blockUser).mockResolvedValue({ ok: true, data: null })
    const { queryClient, wrapper } = createWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useBlockUser(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('u-3')
    })
    expect(blockUser).toHaveBeenCalledWith('u-3')
    expect(invalidate).toHaveBeenCalledTimes(2)
  })

  it('reports a user without invalidating any cache', async () => {
    const { reportUser } = await import('@/app/actions/social')
    vi.mocked(reportUser).mockResolvedValue({ ok: true, data: { id: 'report-1' } })
    const { result } = renderHook(() => useReportUser(), { wrapper: createWrapper().wrapper })
    await act(async () => {
      await result.current.mutateAsync({ reportedUserId: 'u-4', reason: 'Spam' })
    })
    expect(reportUser).toHaveBeenCalledWith({ reportedUserId: 'u-4', reason: 'Spam' })
  })

  it('sets the handle and invalidates the profile', async () => {
    const { setHandle } = await import('@/app/actions/social')
    vi.mocked(setHandle).mockResolvedValue({ ok: true, data: null })
    const { queryClient, wrapper } = createWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useSetHandle(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('newhandle')
    })
    expect(setHandle).toHaveBeenCalledWith('newhandle')
    expect(invalidate).toHaveBeenCalled()
  })

  it('sets the social opt-in flag and invalidates the profile', async () => {
    const { setSocialOptIn } = await import('@/app/actions/social')
    vi.mocked(setSocialOptIn).mockResolvedValue({ ok: true, data: null })
    const { queryClient, wrapper } = createWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useSetSocialOptIn(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(true)
    })
    expect(setSocialOptIn).toHaveBeenCalledWith(true)
    expect(invalidate).toHaveBeenCalled()
  })
})
