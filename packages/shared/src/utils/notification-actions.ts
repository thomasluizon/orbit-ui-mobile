import type { NotificationItem } from '../types/notification'

export function isViewableNotificationUrl(
  url: string | null | undefined,
): url is string {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return false
  return !url.startsWith('/social') &&
    !url.startsWith('/public-profile') &&
    !url.startsWith('/u/')
}

export function resolveNotificationUrl(url: string): string | null {
  if (!isViewableNotificationUrl(url)) return null

  let destination = url
  if (url.startsWith('/progress?wrapped=')) destination = '/wrapped'
  else if (url === '/progress' || url.startsWith('/progress?')) destination = '/streak'

  return isViewableNotificationUrl(destination) ? destination : null
}

export function getNotificationDestination(
  url: string | null | undefined,
  _habitId: string | null = null,
): { url: string } | null {
  if (!isViewableNotificationUrl(url)) return null
  const destination = resolveNotificationUrl(url)
  return destination ? { url: destination } : null
}

export function getNotificationDetailActionVisibility(
  notification: Pick<NotificationItem, 'isRead' | 'url'>,
): { canView: boolean; canMarkAsRead: boolean } {
  return {
    canView: getNotificationDestination(notification.url) !== null,
    canMarkAsRead: !notification.isRead,
  }
}

export type NotificationGlyph =
  | 'streak'
  | 'celebration'
  | 'astra'
  | 'reminder'

/** Resolves the inbox glyph for a notification from the destination the API
 *  attaches: streak alerts get the flame, gamification and referral
 *  celebrations the trophy, Astra-produced surfaces the sparkles, and habit
 *  reminders fall back to the bell. */
export function getNotificationGlyph(
  notification: Pick<NotificationItem, 'url' | 'habitId'>,
): NotificationGlyph {
  const { habitId } = notification
  const url = getNotificationDestination(notification.url, habitId)?.url
  if (url?.startsWith('/streak')) return 'streak'
  if (url?.startsWith('/chat') || url?.startsWith('/calendar-sync?mode=review')) {
    return 'astra'
  }
  if (url?.startsWith('/profile') || (!url && !habitId)) return 'celebration'
  return 'reminder'
}
