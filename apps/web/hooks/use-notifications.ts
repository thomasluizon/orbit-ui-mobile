'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
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
} from '@/lib/actions/notifications'
import { createSessionScopedRunner } from '@orbit/shared/utils/session-scope'
import { fetchJson } from '@/lib/api-fetch'
import { useAppToast } from '@/hooks/use-app-toast'
import { getSessionEpoch } from '@/stores/auth-store'

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
    queryFn: () => fetchJson<NotificationsResponse>(API.notifications.list, notificationsResponseSchema),
    staleTime: QUERY_STALE_TIMES.notifications,
    refetchOnWindowFocus: true,
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
  const t = useTranslations()
  const { showError } = useAppToast()

  const mutation = useMutation({
    mutationFn: ({ notificationId, sessionEpoch }: {
      notificationId: string
      sessionEpoch: number
    }) => {
      return runForNotificationSession(
        sessionEpoch,
        () => markNotificationRead(notificationId),
      ) ?? Promise.resolve(undefined)
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

    onSettled: (_data, _error, _operation, context) => {
      if (!context) return
      runForNotificationSession(context.sessionEpoch, () => {
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
  const t = useTranslations()
  const { showError } = useAppToast()

  const mutation = useMutation({
    mutationFn: ({ sessionEpoch }: { sessionEpoch: number }) => {
      return runForNotificationSession(
        sessionEpoch,
        () => markAllNotificationsRead(),
      ) ?? Promise.resolve(undefined)
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

    onSettled: (_data, _error, _operation, context) => {
      if (!context) return
      runForNotificationSession(context.sessionEpoch, () => {
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
    mutationFn: ({ notificationId, sessionEpoch }: {
      notificationId: string
      sessionEpoch: number
    }) => {
      return runForNotificationSession(
        sessionEpoch,
        () => deleteNotificationAction(notificationId),
      ) ?? Promise.resolve(undefined)
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

    onSettled: (_data, _error, _operation, context) => {
      if (!context) return
      runForNotificationSession(context.sessionEpoch, () => {
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
  const t = useTranslations()
  const { showError } = useAppToast()

  const mutation = useMutation({
    mutationFn: ({ sessionEpoch }: { sessionEpoch: number }) => {
      return runForNotificationSession(
        sessionEpoch,
        () => deleteAllNotificationsAction(),
      ) ?? Promise.resolve(undefined)
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

    onSettled: (_data, _error, _operation, context) => {
      if (!context) return
      runForNotificationSession(context.sessionEpoch, () => {
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
