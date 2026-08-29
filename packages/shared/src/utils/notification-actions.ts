import type { NotificationItem } from '../types/notification'

export function selectNewestUnreadProactiveCheckin(
  notifications: readonly NotificationItem[],
): NotificationItem | null {
  const candidates = notifications
    .filter((item) => !item.isRead && item.url === '/chat' && item.habitId === null)
  candidates.sort((left, right) => right.createdAtUtc.localeCompare(left.createdAtUtc))
  return candidates[0] ?? null
}

export function shouldShowTodayAstraLine({
  isTodaySelected,
  inDrillOrSurface,
  isOnline,
  atLimit,
}: Readonly<{
  isTodaySelected: boolean
  inDrillOrSurface: boolean
  isOnline: boolean
  atLimit: boolean
}>): boolean {
  return isTodaySelected && !inDrillOrSurface && isOnline && !atLimit
}

export function isViewableNotificationUrl(
  url: string | null | undefined,
): url is string {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return false
  return !url.startsWith('/social') &&
    !url.startsWith('/public-profile') &&
    !url.startsWith('/u/')
}

export function getNotificationDetailActionVisibility(
  notification: Pick<NotificationItem, 'isRead' | 'url'>,
): { canView: boolean; canMarkAsRead: boolean } {
  return {
    canView: isViewableNotificationUrl(notification.url),
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
  const { url, habitId } = notification
  if (url?.startsWith('/streak')) return 'streak'
  if (url?.startsWith('/chat') || url?.startsWith('/calendar-sync?mode=review')) {
    return 'astra'
  }
  if (url?.startsWith('/profile') || (!url && !habitId)) return 'celebration'
  return 'reminder'
}
