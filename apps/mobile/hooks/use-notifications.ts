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
        queryClient.invalidateQueries({ queryKey: notificationKeys.lists() })
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
        queryClient.invalidateQueries({ queryKey: notificationKeys.lists() })
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
    mutationFn: (notificationId: string) =>
      apiClient<void>(API.notifications.markRead(notificationId), { method: 'PUT' }),

    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.lists() })

      const previous = queryClient.getQueryData<NotificationsResponse>(notificationKeys.lists())

      queryClient.setQueryData<NotificationsResponse>(notificationKeys.lists(), (old) => {
        if (!old) return old
        const item = old.items.find((n) => n.id === notificationId)
        if (!item || item.isRead) return old
        return {
          ...old,
          items: old.items.map((n) =>
            n.id === notificationId ? { ...n, isRead: true } : n
          ),
          unreadCount: Math.max(0, old.unreadCount - 1),
        }
      })

      return { previous }
    },

    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationKeys.lists(), context.previous)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() })
    },
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      apiClient<void>(API.notifications.markAllRead, { method: 'PUT' }),

    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.lists() })

      const previous = queryClient.getQueryData<NotificationsResponse>(notificationKeys.lists())

      queryClient.setQueryData<NotificationsResponse>(notificationKeys.lists(), (old) => {
        if (!old) return old
        return {
          ...old,
          items: old.items.map((n) => ({ ...n, isRead: true })),
          unreadCount: 0,
        }
      })

      return { previous }
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationKeys.lists(), context.previous)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() })
    },
  })
}

export function useDeleteNotification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (notificationId: string) =>
      apiClient<void>(API.notifications.delete(notificationId), { method: 'DELETE' }),

    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.lists() })

      const previous = queryClient.getQueryData<NotificationsResponse>(notificationKeys.lists())

      queryClient.setQueryData<NotificationsResponse>(notificationKeys.lists(), (old) => {
        if (!old) return old
        const item = old.items.find((n) => n.id === notificationId)
        const wasUnread = item && !item.isRead
        return {
          ...old,
          items: old.items.filter((n) => n.id !== notificationId),
          unreadCount: wasUnread ? Math.max(0, old.unreadCount - 1) : old.unreadCount,
        }
      })

      return { previous }
    },

    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationKeys.lists(), context.previous)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() })
    },
  })
}

export function useDeleteAllNotifications() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      apiClient<void>(API.notifications.deleteAll, { method: 'DELETE' }),

    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.lists() })

      const previous = queryClient.getQueryData<NotificationsResponse>(notificationKeys.lists())

      queryClient.setQueryData<NotificationsResponse>(notificationKeys.lists(), () => ({
        items: [],
        unreadCount: 0,
      }))

      return { previous }
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationKeys.lists(), context.previous)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() })
    },
  })
}
