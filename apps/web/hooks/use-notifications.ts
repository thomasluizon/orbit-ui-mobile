'use client'

import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { notificationKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type {
  NotificationsResponse,
} from '@orbit/shared/types/notification'
import {
  createEmptyNotificationsResponse,
  deleteNotificationFromList,
  invalidateNotificationList,
  markAllNotificationsReadInList,
  markNotificationReadInList,
  restoreNotificationList,
  snapshotNotificationList,
} from '@/lib/notification-cache-helpers'
import {
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification as deleteNotificationAction,
  deleteAllNotifications as deleteAllNotificationsAction,
} from '@/app/actions/notifications'
import { fetchJson } from '@/lib/api-fetch'

// ---------------------------------------------------------------------------
// Notifications list query
// ---------------------------------------------------------------------------

export function useNotifications() {
  const query = useQuery({
    queryKey: notificationKeys.lists(),
    queryFn: () => fetchJson<NotificationsResponse>(API.notifications.list),
    staleTime: QUERY_STALE_TIMES.notifications,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })

  const notifications = query.data?.items ?? []
  const unreadCount = query.data?.unreadCount ?? 0

  return {
    ...query,
    notifications,
    unreadCount,
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),

    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.lists() })

      const previous = snapshotNotificationList(queryClient)

      queryClient.setQueryData<NotificationsResponse>(notificationKeys.lists(), (old) => {
        if (!old) return old
        return markNotificationReadInList(old, notificationId)
      })

      return { previous }
    },

    onError: (_err, _id, context) => {
      restoreNotificationList(queryClient, context?.previous)
    },

    onSettled: () => {
      void invalidateNotificationList(queryClient)
    },
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => markAllNotificationsRead(),

    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.lists() })

      const previous = snapshotNotificationList(queryClient)

      queryClient.setQueryData<NotificationsResponse>(notificationKeys.lists(), (old) => {
        if (!old) return old
        return markAllNotificationsReadInList(old)
      })

      return { previous }
    },

    onError: (_err, _vars, context) => {
      restoreNotificationList(queryClient, context?.previous)
    },

    onSettled: () => {
      void invalidateNotificationList(queryClient)
    },
  })
}

export function useDeleteNotification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (notificationId: string) => deleteNotificationAction(notificationId),

    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.lists() })

      const previous = snapshotNotificationList(queryClient)

      queryClient.setQueryData<NotificationsResponse>(notificationKeys.lists(), (old) => {
        if (!old) return old
        return deleteNotificationFromList(old, notificationId)
      })

      return { previous }
    },

    onError: (_err, _id, context) => {
      restoreNotificationList(queryClient, context?.previous)
    },

    onSettled: () => {
      void invalidateNotificationList(queryClient)
    },
  })
}

export function useDeleteAllNotifications() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => deleteAllNotificationsAction(),

    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.lists() })

      const previous = snapshotNotificationList(queryClient)

      queryClient.setQueryData<NotificationsResponse>(
        notificationKeys.lists(),
        () => createEmptyNotificationsResponse(),
      )

      return { previous }
    },

    onError: (_err, _vars, context) => {
      restoreNotificationList(queryClient, context?.previous)
    },

    onSettled: () => {
      void invalidateNotificationList(queryClient)
    },
  })
}
