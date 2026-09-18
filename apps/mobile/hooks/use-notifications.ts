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
import { createSessionScopedRunner } from '@orbit/shared/utils/session-scope'
import { useAppToast } from '@/hooks/use-app-toast'
import { getSessionEpoch } from '@/stores/auth-store'

const runForNotificationSession = createSessionScopedRunner(getSessionEpoch)

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
      const sessionEpoch = getSessionEpoch()
      await queryClient.cancelQueries({ queryKey: notificationKeys.lists() })

      const previous = runForNotificationSession(sessionEpoch, () => {
        const snapshot = snapshotNotificationList(queryClient)
        queryClient.setQueryData<NotificationsResponse>(notificationKeys.lists(), (old) => {
          if (!old) return old
          return markNotificationReadInList(old, notificationId)
        })
        return snapshot
      })

      return { previous, sessionEpoch }
    },

    onError: (_err, _id, context) => {
      if (!context) return
      runForNotificationSession(context.sessionEpoch, () => {
        if (context.previous) {
          restoreNotificationList(queryClient, context.previous)
        }
        showError(t('notifications.markReadError'))
      })
    },

    onSettled: (data, _error, _id, context) => {
      if (!context) return
      runForNotificationSession(context.sessionEpoch, () => {
        if (isQueuedResult(data)) return
        void invalidateNotificationList(queryClient)
      })
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
      const sessionEpoch = getSessionEpoch()
      await queryClient.cancelQueries({ queryKey: notificationKeys.lists() })

      const previous = runForNotificationSession(sessionEpoch, () => {
        const snapshot = snapshotNotificationList(queryClient)
        queryClient.setQueryData<NotificationsResponse>(notificationKeys.lists(), (old) => {
          if (!old) return old
          return markAllNotificationsReadInList(old)
        })
        return snapshot
      })

      return { previous, sessionEpoch }
    },

    onError: (_err, _vars, context) => {
      if (!context) return
      runForNotificationSession(context.sessionEpoch, () => {
        if (context.previous) {
          restoreNotificationList(queryClient, context.previous)
        }
        showError(t('notifications.markAllReadError'))
      })
    },

    onSettled: (data, _error, _vars, context) => {
      if (!context) return
      runForNotificationSession(context.sessionEpoch, () => {
        if (isQueuedResult(data)) return
        void invalidateNotificationList(queryClient)
      })
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
      return runForNotificationSession(sessionEpoch, () => {
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
      const cancellation = runForNotificationSession(
        sessionEpoch,
        () => queryClient.cancelQueries({ queryKey: notificationKeys.lists() }),
      )
      if (!cancellation) {
        return { previous: undefined, sessionEpoch }
      }
      await cancellation

      if (sessionEpoch !== getSessionEpoch()) {
        return { previous: undefined, sessionEpoch }
      }

      const previous = snapshotNotificationList(queryClient)

      const cacheChanged = runForNotificationSession(sessionEpoch, () => {
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
      runForNotificationSession(context.sessionEpoch, () => {
        restoreNotificationList(queryClient, context.previous)
      })
    },

    onSettled: (data, _error, _operation, context) => {
      if (!context) return
      runForNotificationSession(context.sessionEpoch, () => {
        if (isQueuedResult(data)) return
        void invalidateNotificationList(queryClient)
      })
    },
  })

  return {
    ...mutation,
    mutate: (notificationId: string) => mutation.mutate({
      notificationId,
      sessionEpoch: getSessionEpoch(),
    }),
    mutateAsync: (notificationId: string) => mutation.mutateAsync({
      notificationId,
      sessionEpoch: getSessionEpoch(),
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
      const sessionEpoch = getSessionEpoch()
      await queryClient.cancelQueries({ queryKey: notificationKeys.lists() })

      const previous = runForNotificationSession(sessionEpoch, () => {
        const snapshot = snapshotNotificationList(queryClient)
        queryClient.setQueryData<NotificationsResponse>(
          notificationKeys.lists(),
          () => createEmptyNotificationsResponse(),
        )
        return snapshot
      })

      return { previous, sessionEpoch }
    },

    onError: (_err, _vars, context) => {
      if (!context) return
      runForNotificationSession(context.sessionEpoch, () => {
        if (context.previous) {
          restoreNotificationList(queryClient, context.previous)
        }
        showError(t('notifications.deleteAllError'))
      })
    },

    onSettled: (data, _error, _vars, context) => {
      if (!context) return
      runForNotificationSession(context.sessionEpoch, () => {
        if (isQueuedResult(data)) return
        void invalidateNotificationList(queryClient)
      })
    },
  })
}
