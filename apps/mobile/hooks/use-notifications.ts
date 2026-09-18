import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  notificationKeys,
  attachNotificationPolling,
  QUERY_STALE_TIMES,
} from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import {
  notificationsResponseSchema,
  type NotificationsResponse,
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
import { useAppToast } from '@/hooks/use-app-toast'
import { getSessionGeneration } from '@/stores/auth-store'

function runForNotificationDeleteSession<TResult>(
  sessionEpoch: number,
  operation: () => TResult,
): TResult | undefined {
  if (sessionEpoch !== getSessionGeneration().epoch) return undefined
  return operation()
}

export function useNotifications() {
  const queryClient = useQueryClient()
  useEffect(() => attachNotificationPolling(queryClient), [queryClient])

  const query = useQuery({
    queryKey: notificationKeys.lists(),
    queryFn: () => apiClient<NotificationsResponse>(API.notifications.list, undefined, notificationsResponseSchema),
    staleTime: QUERY_STALE_TIMES.notifications,
  })

  const notifications = query.data?.items ?? []
  const unreadCount = query.data?.unreadCount ?? 0

  return {
    ...query,
    notifications,
    unreadCount,
  }
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const { showError } = useAppToast()

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
      showError(t('notifications.markReadError'))
    },

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      void invalidateNotificationList(queryClient)
    },
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const { showError } = useAppToast()

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
      showError(t('notifications.markAllReadError'))
    },

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      void invalidateNotificationList(queryClient)
    },
  })
}

export function useDeleteNotification() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ notificationId, sessionEpoch }: {
      notificationId: string
      sessionEpoch: number
    }) => {
      return runForNotificationDeleteSession(sessionEpoch, () => {
        const queuedMutation = buildQueuedMutation({
          type: 'deleteNotification',
          scope: 'notifications',
          endpoint: API.notifications.delete(notificationId),
          method: 'DELETE',
          payload: null,
          entityType: 'notification',
          targetEntityId: notificationId,
        })

        return queueOrExecute({
          mutation: queuedMutation,
          execute: async () => apiClient<void>(API.notifications.delete(notificationId), {
            method: 'DELETE',
          }),
          queuedResult: createQueuedAck(queuedMutation.id),
        })
      })
    },

    onMutate: async ({ notificationId, sessionEpoch }) => {
      const cancellation = runForNotificationDeleteSession(
        sessionEpoch,
        () => queryClient.cancelQueries({ queryKey: notificationKeys.lists() }),
      )
      if (!cancellation) {
        return { previous: undefined, sessionEpoch }
      }
      await cancellation

      if (sessionEpoch !== getSessionGeneration().epoch) {
        return { previous: undefined, sessionEpoch }
      }

      const previous = snapshotNotificationList(queryClient)

      const cacheChanged = runForNotificationDeleteSession(sessionEpoch, () => {
        queryClient.setQueryData<NotificationsResponse>(notificationKeys.lists(), (old) => {
          if (!old) return old
          return deleteNotificationFromList(old, notificationId)
        })
        return true
      })

      return { previous: cacheChanged ? previous : undefined, sessionEpoch }
    },

    onError: (_err, _operation, context) => {
      if (!context?.previous) return
      runForNotificationDeleteSession(context.sessionEpoch, () => {
        restoreNotificationList(queryClient, context.previous)
      })
    },

    onSettled: (data, _error, _operation, context) => {
      if (!context) return
      runForNotificationDeleteSession(context.sessionEpoch, () => {
        if (isQueuedResult(data)) return
        void invalidateNotificationList(queryClient)
      })
    },
  })

  return {
    ...mutation,
    mutate: (notificationId: string) => mutation.mutate({
      notificationId,
      sessionEpoch: getSessionGeneration().epoch,
    }),
    mutateAsync: (notificationId: string) => mutation.mutateAsync({
      notificationId,
      sessionEpoch: getSessionGeneration().epoch,
    }),
  }
}

export function useDeleteAllNotifications() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const { showError } = useAppToast()

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
      showError(t('notifications.deleteAllError'))
    },

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      void invalidateNotificationList(queryClient)
    },
  })
}
