import type { NotificationItem } from '../types/notification'

export function isViewableNotificationUrl(
  url: string | null | undefined,
): url is string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')
}

export function getNotificationDetailActionVisibility(
  notification: Pick<NotificationItem, 'isRead' | 'url'>,
) {
  return {
    canView: isViewableNotificationUrl(notification.url),
    canMarkAsRead: !notification.isRead,
  }
}
