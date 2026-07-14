'use client'

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
  friendInvitePreviewSchema,
  friendProfileViewSchema,
  friendsResponseSchema,
  type CheersPage,
  type FriendFeedPage,
  type FriendInvitePreview,
  type FriendProfileView,
  type FriendsResponse,
  type ReportReason,
} from '@orbit/shared/types/social'
import { createApiClientError } from '@orbit/shared/utils'
import {
  acceptFriendRequest,
  blockUser,
  removeFriend,
  reportUser,
  sendCheer,
  sendFriendRequest,
  setHandle,
  setSocialOptIn,
  type SocialActionResult,
} from '@/app/actions/social'

const FEED_PAGE_SIZE = 20

async function getSocial<T>(url: string, parse: (raw: unknown) => T): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null)
    throw createApiClientError(res.status, body, `Request failed: ${res.status}`)
  }
  return parse(await res.json())
}

function unwrap<T>(result: SocialActionResult<T>): T {
  if (result.ok) return result.data
  throw createApiClientError(
    result.status,
    result.code ? { errorCode: result.code } : null,
    'Request failed',
  )
}

/** Friends list plus incoming/outgoing requests. Gate reads on `enabled` so disabled users never call. */
export function useFriends(options?: { enabled?: boolean }) {
  return useQuery<FriendsResponse>({
    queryKey: friendKeys.list(),
    queryFn: () => getSocial(API.friends.list, (raw) => friendsResponseSchema.parse(raw)),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  })
}

/** Keyset-paginated activity feed of friends' celebratory milestones. */
export function useFriendFeed(options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: friendKeys.feed(),
    queryFn: ({ pageParam }) => {
      const cursor = pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''
      return getSocial(`${API.friends.feed}?pageSize=${FEED_PAGE_SIZE}${cursor}`, (raw) =>
        friendFeedPageSchema.parse(raw),
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
    queryFn: () =>
      getSocial(`${API.friends.cheers}?direction=${direction}`, (raw) =>
        cheersPageSchema.parse(raw),
      ),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  })
}

/** A friend's public-facing profile (streak, level, achievements). Gated on `userId` so it only
 *  fetches once a friend is selected; surfaces the backend 403/404 to the caller for empty states. */
export function useFriendProfile(userId: string | null) {
  return useQuery<FriendProfileView>({
    queryKey: friendKeys.profile(userId ?? ''),
    queryFn: () =>
      getSocial(API.friends.profile(userId!), (raw) => friendProfileViewSchema.parse(raw)),
    enabled: !!userId,
    staleTime: 30_000,
    retry: false,
  })
}

/** Preview of an invite link's owner before sending a request. Gated on `code` so it only fetches
 *  while the confirm surface is open; surfaces the backend 404 to the caller for the unknown-code state. */
export function useInvitePreview(code: string | null) {
  return useQuery<FriendInvitePreview>({
    queryKey: friendKeys.invitePreview(code ?? ''),
    queryFn: () =>
      getSocial(API.friends.invitePreview(code!), (raw) => friendInvitePreviewSchema.parse(raw)),
    enabled: !!code,
    staleTime: 30_000,
    retry: false,
  })
}

export function useSendFriendRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { handle?: string; referralCode?: string }) =>
      unwrap(await sendFriendRequest(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: friendKeys.all })
    },
  })
}

export function useAcceptFriendRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (friendshipId: string) => unwrap(await acceptFriendRequest(friendshipId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: friendKeys.all })
    },
  })
}

export function useRemoveFriend() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (friendUserId: string) => unwrap(await removeFriend(friendUserId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: friendKeys.all })
    },
  })
}

export function useSendCheer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { recipientId: string; note?: string }) =>
      unwrap(await sendCheer(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cheerKeys.all })
    },
  })
}

export function useBlockUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (blockedUserId: string) => unwrap(await blockUser(blockedUserId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: friendKeys.all })
      void queryClient.invalidateQueries({ queryKey: cheerKeys.all })
    },
  })
}

export function useReportUser() {
  // react-doctor-disable-next-line query-mutation-missing-invalidation -- reporting a user files a backend report and mutates no client-cached data, so there is nothing to invalidate; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  return useMutation({
    mutationFn: async (input: {
      reportedUserId: string
      reason: ReportReason
      details?: string
      cheerId?: string
    }) => unwrap(await reportUser(input)),
  })
}

export function useSetHandle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (handle: string) => unwrap(await setHandle(handle)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}

export function useSetSocialOptIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (enabled: boolean) => unwrap(await setSocialOptIn(enabled)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}
