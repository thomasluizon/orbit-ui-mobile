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
import { fetchJson } from '@/lib/api-fetch'
import { useAppToast } from '@/hooks/use-app-toast'
import { getSessionGeneration } from '@/stores/auth-store'

function runForNotificationDeleteSession<TResult>(
  sessionGeneration: number,
  operation: () => TResult,
): TResult | undefined {
  if (sessionGeneration !== getSessionGeneration()) return undefined
  return operation()
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
      showError(t('notifications.markReadError'))
    },

    onSettled: () => {
      void invalidateNotificationList(queryClient)
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
      showError(t('notifications.markAllReadError'))
    },

    onSettled: () => {
      void invalidateNotificationList(queryClient)
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
      return runForNotificationDeleteSession(
        sessionGeneration,
        () => deleteNotificationAction(notificationId),
      ) ?? Promise.resolve(undefined)
    },

    onMutate: async ({ notificationId, sessionGeneration }) => {
      const cancellation = runForNotificationDeleteSession(
        sessionGeneration,
        () => queryClient.cancelQueries({ queryKey: notificationKeys.lists() }),
      )
      if (!cancellation) {
        return { previous: undefined, sessionGeneration }
      }
      await cancellation

      if (sessionGeneration !== getSessionGeneration()) {
        return { previous: undefined, sessionGeneration }
      }

      const previous = snapshotNotificationList(queryClient)

      const cacheChanged = runForNotificationDeleteSession(sessionGeneration, () => {
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
      runForNotificationDeleteSession(context.sessionGeneration, () => {
        restoreNotificationList(queryClient, context.previous)
      })
    },

    onSettled: (_data, _error, _operation, context) => {
      if (!context) return
      runForNotificationDeleteSession(context.sessionGeneration, () => {
        void invalidateNotificationList(queryClient)
      })
    },
  })

  return {
    ...mutation,
    mutate: (notificationId: string) => mutation.mutate({
      notificationId,
      sessionGeneration: getSessionGeneration(),
    }),
    mutateAsync: (notificationId: string) => mutation.mutateAsync({
      notificationId,
      sessionGeneration: getSessionGeneration(),
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
      showError(t('notifications.deleteAllError'))
    },

    onSettled: () => {
      void invalidateNotificationList(queryClient)
    },
  })
}
