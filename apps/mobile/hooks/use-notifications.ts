import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
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
import { getSessionEpoch } from '@/lib/session-epoch'

const runForNotificationSession = createSessionScopedRunner(getSessionEpoch)

/**
 * Cancels the list refetch for the session that owns the mutation. The await is the gap an account
 * replacement fits through, and this reports nothing about who owns the session once it closes:
 * every caller wraps the work that follows in runForNotificationSession, which re-reads the current
 * epoch immediately before each write, so a second check here would decide nothing.
 */
async function cancelNotificationListForSession(
  queryClient: QueryClient,
  sessionEpoch: number,
): Promise<void> {
  await runForNotificationSession(
    sessionEpoch,
    () => queryClient.cancelQueries({ queryKey: notificationKeys.lists() }),
  )
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

  const mutation = useMutation({
    mutationFn: async ({ notificationId, sessionEpoch }: {
      notificationId: string
      sessionEpoch: number
    }) => {
      return runForNotificationSession(sessionEpoch, () => {
        const isCurrent = () => sessionEpoch === getSessionEpoch()
        const queuedMutation = buildQueuedMutation({
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
          mutation: queuedMutation,
          execute: async () => apiClient<void>(API.notifications.markRead(notificationId), {
            method: 'PUT',
            isCurrent,
          }),
          queuedResult: createQueuedAck(queuedMutation.id),
          isCurrent,
        })
      })
    },

    onMutate: async ({ notificationId, sessionEpoch }) => {
      await cancelNotificationListForSession(queryClient, sessionEpoch)

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

    onError: (_err, _operation, context) => {
      if (!context) return
      runForNotificationSession(context.sessionEpoch, () => {
        restoreNotificationList(queryClient, context.previous)
        showError(t('notifications.markReadError'))
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

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const { showError } = useAppToast()

  const mutation = useMutation({
    mutationFn: async ({ sessionEpoch }: { sessionEpoch: number }) => {
      return runForNotificationSession(sessionEpoch, () => {
        const isCurrent = () => sessionEpoch === getSessionEpoch()
        const queuedMutation = buildQueuedMutation({
          type: 'markAllNotificationsRead',
          scope: 'notifications',
          endpoint: API.notifications.markAllRead,
          method: 'PUT',
          payload: null,
          dedupeKey: 'notifications:mark-all-read',
        })

        return queueOrExecute({
          mutation: queuedMutation,
          execute: async () => apiClient<void>(API.notifications.markAllRead, { method: 'PUT', isCurrent }),
          queuedResult: createQueuedAck(queuedMutation.id),
          isCurrent,
        })
      })
    },

    onMutate: async ({ sessionEpoch }) => {
      await cancelNotificationListForSession(queryClient, sessionEpoch)

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

    onError: (_err, _operation, context) => {
      if (!context) return
      runForNotificationSession(context.sessionEpoch, () => {
        restoreNotificationList(queryClient, context.previous)
        showError(t('notifications.markAllReadError'))
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
    mutate: () => mutation.mutate({ sessionEpoch: getSessionEpoch() }),
    mutateAsync: () => mutation.mutateAsync({ sessionEpoch: getSessionEpoch() }),
  }
}

export function useDeleteNotification() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ notificationId, sessionEpoch }: {
      notificationId: string
      sessionEpoch: number
    }) => {
      return runForNotificationSession(sessionEpoch, () => {
        const isCurrent = () => sessionEpoch === getSessionEpoch()
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
            isCurrent,
          }),
          queuedResult: createQueuedAck(queuedMutation.id),
          isCurrent,
        })
      })
    },

    onMutate: async ({ notificationId, sessionEpoch }) => {
      await cancelNotificationListForSession(queryClient, sessionEpoch)

      const previous = runForNotificationSession(sessionEpoch, () => {
        const snapshot = snapshotNotificationList(queryClient)
        queryClient.setQueryData<NotificationsResponse>(notificationKeys.lists(), (old) => {
          if (!old) return old
          return deleteNotificationFromList(old, notificationId)
        })
        return snapshot
      })

      return { previous, sessionEpoch }
    },

    onError: (_err, _operation, context) => {
      if (!context) return
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

  const mutation = useMutation({
    mutationFn: async ({ sessionEpoch }: { sessionEpoch: number }) => {
      return runForNotificationSession(sessionEpoch, () => {
        const isCurrent = () => sessionEpoch === getSessionEpoch()
        const queuedMutation = buildQueuedMutation({
          type: 'deleteAllNotifications',
          scope: 'notifications',
          endpoint: API.notifications.deleteAll,
          method: 'DELETE',
          payload: null,
          dedupeKey: 'notifications:delete-all',
        })

        return queueOrExecute({
          mutation: queuedMutation,
          execute: async () => apiClient<void>(API.notifications.deleteAll, { method: 'DELETE', isCurrent }),
          queuedResult: createQueuedAck(queuedMutation.id),
          isCurrent,
        })
      })
    },

    onMutate: async ({ sessionEpoch }) => {
      await cancelNotificationListForSession(queryClient, sessionEpoch)

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

    onError: (_err, _operation, context) => {
      if (!context) return
      runForNotificationSession(context.sessionEpoch, () => {
        restoreNotificationList(queryClient, context.previous)
        showError(t('notifications.deleteAllError'))
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
    mutate: () => mutation.mutate({ sessionEpoch: getSessionEpoch() }),
    mutateAsync: () => mutation.mutateAsync({ sessionEpoch: getSessionEpoch() }),
  }
}
