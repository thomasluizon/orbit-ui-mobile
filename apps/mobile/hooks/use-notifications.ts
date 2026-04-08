import { useEffect, useRef } from 'react'
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { AppState, type AppStateStatus } from 'react-native'
import { notificationKeys } from '@orbit/shared/query'
import { QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type {
  NotificationItem,
  NotificationsResponse,
} from '@orbit/shared/types/notification'
import { apiClient } from '@/lib/api-client'
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
  buildQueuedMutation,
  createQueuedAck,
  isQueuedResult,
  queueOrExecute,
} from '@/lib/offline-mutations'

// ---------------------------------------------------------------------------
// Notifications list query
// ---------------------------------------------------------------------------

export function useNotifications() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: notificationKeys.lists(),
    queryFn: () => apiClient<NotificationsResponse>(API.notifications.list),
    staleTime: QUERY_STALE_TIMES.notifications,
  })

  const notifications = query.data?.items ?? []
  const unreadCount = query.data?.unreadCount ?? 0

  // Poll every 60 seconds, pause when app is backgrounded
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    function startPolling() {
      if (intervalRef.current) return
      intervalRef.current = setInterval(() => {
        void invalidateNotificationList(queryClient)
      }, 60000)
    }

    function stopPolling() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void invalidateNotificationList(queryClient)
        startPolling()
      } else {
        stopPolling()
      }
    }

    startPolling()
    const subscription = AppState.addEventListener('change', handleAppState)

    return () => {
      stopPolling()
      subscription.remove()
    }
  }, [queryClient])

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
    mutationFn: async (notificationId: string) => {
      const mutation = buildQueuedMutation({
        type: 'markNotificationRead',
        scope: 'notifications',
        endpoint: API.notifications.markRead(notificationId),
        method: 'PUT',
        payload: null,
        entityType: 'notification',
        targetEntityId: notificationId,
        dedupeKey: `notification:${notificationId}:read`,
      })

      return queueOrExecute({
        mutation,
        execute: async () => apiClient<void>(API.notifications.markRead(notificationId), {
          method: 'PUT',
        }),
        queuedResult: createQueuedAck(mutation.id),
      })
    },

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
      if (context?.previous) {
        restoreNotificationList(queryClient, context.previous)
      }
    },

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      void invalidateNotificationList(queryClient)
    },
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const mutation = buildQueuedMutation({
        type: 'markAllNotificationsRead',
        scope: 'notifications',
        endpoint: API.notifications.markAllRead,
        method: 'PUT',
        payload: null,
        dedupeKey: 'notifications:mark-all-read',
      })

      return queueOrExecute({
        mutation,
        execute: async () => apiClient<void>(API.notifications.markAllRead, { method: 'PUT' }),
        queuedResult: createQueuedAck(mutation.id),
      })
    },

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
      if (context?.previous) {
        restoreNotificationList(queryClient, context.previous)
      }
    },

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      void invalidateNotificationList(queryClient)
    },
  })
}

export function useDeleteNotification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const mutation = buildQueuedMutation({
        type: 'deleteNotification',
        scope: 'notifications',
        endpoint: API.notifications.delete(notificationId),
        method: 'DELETE',
        payload: null,
        entityType: 'notification',
        targetEntityId: notificationId,
      })

      return queueOrExecute({
        mutation,
        execute: async () => apiClient<void>(API.notifications.delete(notificationId), {
          method: 'DELETE',
        }),
        queuedResult: createQueuedAck(mutation.id),
      })
    },

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
      if (context?.previous) {
        restoreNotificationList(queryClient, context.previous)
      }
    },

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      void invalidateNotificationList(queryClient)
    },
  })
}

export function useDeleteAllNotifications() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const mutation = buildQueuedMutation({
        type: 'deleteAllNotifications',
        scope: 'notifications',
        endpoint: API.notifications.deleteAll,
        method: 'DELETE',
        payload: null,
        dedupeKey: 'notifications:delete-all',
      })

      return queueOrExecute({
        mutation,
        execute: async () => apiClient<void>(API.notifications.deleteAll, { method: 'DELETE' }),
        queuedResult: createQueuedAck(mutation.id),
      })
    },

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
      if (context?.previous) {
        restoreNotificationList(queryClient, context.previous)
      }
    },

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      void invalidateNotificationList(queryClient)
    },
  })
}
