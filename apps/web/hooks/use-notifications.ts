'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
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

  return useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),

    onMutate: async (notificationId) => {
      const sessionGeneration = getSessionEpoch()
      await queryClient.cancelQueries({ queryKey: notificationKeys.lists() })

      const previous = runForNotificationSession(sessionGeneration, () => {
        const snapshot = snapshotNotificationList(queryClient)
        queryClient.setQueryData<NotificationsResponse>(notificationKeys.lists(), (old) => {
          if (!old) return old
          return markNotificationReadInList(old, notificationId)
        })
        return snapshot
      })

      return { previous, sessionGeneration }
    },

    onError: (_err, _id, context) => {
      if (!context) return
      runForNotificationSession(context.sessionGeneration, () => {
        restoreNotificationList(queryClient, context.previous)
        showError(t('notifications.markReadError'))
      })
    },

    onSettled: (_data, _error, _id, context) => {
      if (!context) return
      runForNotificationSession(context.sessionGeneration, () => {
        void invalidateNotificationList(queryClient)
      })
    },
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const { showError } = useAppToast()

  return useMutation({
    mutationFn: () => markAllNotificationsRead(),

    onMutate: async () => {
      const sessionGeneration = getSessionEpoch()
      await queryClient.cancelQueries({ queryKey: notificationKeys.lists() })

      const previous = runForNotificationSession(sessionGeneration, () => {
        const snapshot = snapshotNotificationList(queryClient)
        queryClient.setQueryData<NotificationsResponse>(notificationKeys.lists(), (old) => {
          if (!old) return old
          return markAllNotificationsReadInList(old)
        })
        return snapshot
      })

      return { previous, sessionGeneration }
    },

    onError: (_err, _vars, context) => {
      if (!context) return
      runForNotificationSession(context.sessionGeneration, () => {
        restoreNotificationList(queryClient, context.previous)
        showError(t('notifications.markAllReadError'))
      })
    },

    onSettled: (_data, _error, _vars, context) => {
      if (!context) return
      runForNotificationSession(context.sessionGeneration, () => {
        void invalidateNotificationList(queryClient)
      })
    },
  })
}

export function useDeleteNotification() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: ({ notificationId, sessionGeneration }: {
      notificationId: string
      sessionGeneration: number
    }) => {
      return runForNotificationSession(
        sessionGeneration,
        () => deleteNotificationAction(notificationId),
      ) ?? Promise.resolve(undefined)
    },

    onMutate: async ({ notificationId, sessionGeneration }) => {
      const cancellation = runForNotificationSession(
        sessionGeneration,
        () => queryClient.cancelQueries({ queryKey: notificationKeys.lists() }),
      )
      if (!cancellation) {
        return { previous: undefined, sessionGeneration }
      }
      await cancellation

      if (sessionGeneration !== getSessionEpoch()) {
        return { previous: undefined, sessionGeneration }
      }

      const previous = snapshotNotificationList(queryClient)

      const cacheChanged = runForNotificationSession(sessionGeneration, () => {
        queryClient.setQueryData<NotificationsResponse>(notificationKeys.lists(), (old) => {
          if (!old) return old
          return deleteNotificationFromList(old, notificationId)
        })
        return true
      })

      return { previous: cacheChanged ? previous : undefined, sessionGeneration }
    },

    onError: (_err, _operation, context) => {
      if (!context) return
      runForNotificationSession(context.sessionGeneration, () => {
        restoreNotificationList(queryClient, context.previous)
      })
    },

    onSettled: (_data, _error, _operation, context) => {
      if (!context) return
      runForNotificationSession(context.sessionGeneration, () => {
        void invalidateNotificationList(queryClient)
      })
    },
  })

  return {
    ...mutation,
    mutate: (notificationId: string) => mutation.mutate({
      notificationId,
      sessionGeneration: getSessionEpoch(),
    }),
    mutateAsync: (notificationId: string) => mutation.mutateAsync({
      notificationId,
      sessionGeneration: getSessionEpoch(),
    }),
  }
}

export function useDeleteAllNotifications() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const { showError } = useAppToast()

  return useMutation({
    mutationFn: () => deleteAllNotificationsAction(),

    onMutate: async () => {
      const sessionGeneration = getSessionEpoch()
      await queryClient.cancelQueries({ queryKey: notificationKeys.lists() })

      const previous = runForNotificationSession(sessionGeneration, () => {
        const snapshot = snapshotNotificationList(queryClient)
        queryClient.setQueryData<NotificationsResponse>(
          notificationKeys.lists(),
          () => createEmptyNotificationsResponse(),
        )
        return snapshot
      })

      return { previous, sessionGeneration }
    },

    onError: (_err, _vars, context) => {
      if (!context) return
      runForNotificationSession(context.sessionGeneration, () => {
        restoreNotificationList(queryClient, context.previous)
        showError(t('notifications.deleteAllError'))
      })
    },

    onSettled: (_data, _error, _vars, context) => {
      if (!context) return
      runForNotificationSession(context.sessionGeneration, () => {
        void invalidateNotificationList(queryClient)
      })
    },
  })
}
