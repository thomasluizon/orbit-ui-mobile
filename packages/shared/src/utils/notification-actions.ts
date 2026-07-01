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

export type NotificationGlyph =
  | 'streak'
  | 'celebration'
  | 'astra'
  | 'friend'
  | 'cheer'
  | 'buddy'
  | 'reminder'

/** Resolves the inbox glyph for a notification from the destination the API
 *  attaches: streak alerts get the flame, gamification and referral
 *  celebrations the trophy, Astra-produced surfaces the sparkles, social
 *  friend requests/acceptances the person-plus, cheers the heart, buddy
 *  invites the group, and habit reminders fall back to the bell. */
export function getNotificationGlyph(
  notification: Pick<NotificationItem, 'url' | 'habitId'>,
): NotificationGlyph {
  const { url, habitId } = notification
  if (url?.startsWith('/streak')) return 'streak'
  if (url?.startsWith('/chat') || url?.startsWith('/calendar-sync?mode=review')) {
    return 'astra'
  }
  if (url?.includes('tab=friends')) return 'friend'
  if (url?.includes('tab=feed')) return 'cheer'
  if (url?.includes('tab=buddies')) return 'buddy'
  if (url?.startsWith('/profile') || (!url && !habitId)) return 'celebration'
  return 'reminder'
}
