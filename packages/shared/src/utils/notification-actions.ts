import type { NotificationItem } from '../types/notification'

export function isViewableNotificationUrl(
  url: string | null | undefined,
): url is string {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return false
  return !url.startsWith('/social') &&
    !url.startsWith('/public-profile') &&
    !url.startsWith('/u/')
}

const ABSORBED_PROGRESS_ROUTES = ['/streak', '/achievements', '/retrospective'] as const

export function resolveNotificationUrl(url: string): string {
  const pathname = url.split(/[?#]/, 1)[0] ?? url
  const isAbsorbedRoute = ABSORBED_PROGRESS_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  )
  return isAbsorbedRoute ? '/progress' : url
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
