import { notificationKeys } from '../query'
import type { NotificationsResponse } from '../types/notification'

type QueryKey = readonly unknown[]

type NotificationCacheReader = {
  getQueryData(queryKey: QueryKey): unknown
}

type NotificationCacheWriter = {
  setQueryData(queryKey: QueryKey, value: unknown): unknown
}

type NotificationCacheInvalidator = {
  invalidateQueries(filters: { queryKey: QueryKey }): Promise<unknown> | unknown
}

export function createEmptyNotificationsResponse(): NotificationsResponse {
  return {
    items: [],
    unreadCount: 0,
  }
}

export function snapshotNotificationList(
  queryClient: NotificationCacheReader,
): NotificationsResponse | undefined {
  return queryClient.getQueryData(notificationKeys.lists()) as NotificationsResponse | undefined
}

export function restoreNotificationList(
  queryClient: NotificationCacheWriter,
  previous: NotificationsResponse | undefined,
): void {
  if (!previous) return
  queryClient.setQueryData(notificationKeys.lists(), previous)
}

export async function invalidateNotificationList(
  queryClient: NotificationCacheInvalidator,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: notificationKeys.lists() })
}

export function markNotificationReadInList(
  notifications: NotificationsResponse,
  notificationId: string,
): NotificationsResponse {
  const item = notifications.items.find((entry) => entry.id === notificationId)
  if (!item || item.isRead) return notifications

  return {
    ...notifications,
    items: notifications.items.map((entry) =>
      entry.id === notificationId ? { ...entry, isRead: true } : entry,
    ),
    unreadCount: Math.max(0, notifications.unreadCount - 1),
  }
}

export function markAllNotificationsReadInList(
  notifications: NotificationsResponse,
): NotificationsResponse {
  if (notifications.unreadCount === 0) return notifications

  return {
    ...notifications,
    items: notifications.items.map((entry) => ({ ...entry, isRead: true })),
    unreadCount: 0,
  }
}

export function deleteNotificationFromList(
  notifications: NotificationsResponse,
  notificationId: string,
): NotificationsResponse {
  const item = notifications.items.find((entry) => entry.id === notificationId)
  if (!item) return notifications

  return {
    ...notifications,
    items: notifications.items.filter((entry) => entry.id !== notificationId),
    unreadCount: item.isRead
      ? notifications.unreadCount
      : Math.max(0, notifications.unreadCount - 1),
  }
}
