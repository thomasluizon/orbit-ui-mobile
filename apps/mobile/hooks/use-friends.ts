import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { cheerKeys, friendKeys, profileKeys } from '@orbit/shared/query'
import {
  cheersPageSchema,
  friendFeedPageSchema,
  friendsResponseSchema,
  type CheersPage,
  type FriendFeedPage,
  type FriendsResponse,
  type ReportReason,
} from '@orbit/shared/types/social'
import { apiClient } from '@/lib/api-client'

const FEED_PAGE_SIZE = 20

/** Friends list plus incoming/outgoing requests. Gated on `enabled` so disabled users never call. */
export function useFriends(options?: { enabled?: boolean }) {
  return useQuery<FriendsResponse>({
    queryKey: friendKeys.list(),
    queryFn: async () => friendsResponseSchema.parse(await apiClient<unknown>(API.friends.list)),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  })
}

/** Keyset-paginated activity feed of friends' celebratory milestones. */
export function useFriendFeed(options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: friendKeys.feed(),
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''
      return friendFeedPageSchema.parse(
        await apiClient<unknown>(`${API.friends.feed}?pageSize=${FEED_PAGE_SIZE}${cursor}`),
      )
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: FriendFeedPage) => lastPage.nextCursor,
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  })
}

/** Cheers received or sent by the current user. */
export function useCheers(direction: 'received' | 'sent', options?: { enabled?: boolean }) {
  return useQuery<CheersPage>({
    queryKey: cheerKeys.list(direction),
    queryFn: async () =>
      cheersPageSchema.parse(await apiClient<unknown>(`${API.friends.cheers}?direction=${direction}`)),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  })
}

export function useSendFriendRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { handle?: string; referralCode?: string }) =>
      apiClient<{ id: string }>(API.friends.requests, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: friendKeys.all })
    },
  })
}

export function useAcceptFriendRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (friendshipId: string) =>
      apiClient<void>(API.friends.acceptRequest(friendshipId), { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: friendKeys.all })
    },
  })
}

export function useRemoveFriend() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (friendUserId: string) =>
      apiClient<void>(API.friends.remove(friendUserId), { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: friendKeys.all })
    },
  })
}

export function useSendCheer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { recipientId: string; note?: string }) =>
      apiClient<{ id: string }>(API.friends.cheers, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cheerKeys.all })
    },
  })
}

export function useBlockUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (blockedUserId: string) =>
      apiClient<void>(API.friends.block, {
        method: 'POST',
        body: JSON.stringify({ blockedUserId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: friendKeys.all })
      void queryClient.invalidateQueries({ queryKey: cheerKeys.all })
    },
  })
}

export function useReportUser() {
  return useMutation({
    mutationFn: (input: {
      reportedUserId: string
      reason: ReportReason
      details?: string
      cheerId?: string
    }) => apiClient<{ id: string }>(API.friends.report, { method: 'POST', body: JSON.stringify(input) }),
  })
}

export function useSetHandle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (handle: string) =>
      apiClient<void>(API.profile.handle, { method: 'PUT', body: JSON.stringify({ handle }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}

export function useSetSocialOptIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) =>
      apiClient<void>(API.profile.socialOptIn, { method: 'PUT', body: JSON.stringify({ enabled }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}
