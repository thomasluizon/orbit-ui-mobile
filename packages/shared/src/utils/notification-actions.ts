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
  const pathname = resolveNotificationUrl(url).split(/[?#]/, 1)[0] ?? url
  return ['/', '/calendar', '/progress', '/profile'].includes(pathname) ||
    /^\/habits\/[^/\\.%]+$/.test(pathname)
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

export function getNotificationTargetKey(url: string | null): string | null {
  if (!isViewableNotificationUrl(url)) return null
  const pathname = resolveNotificationUrl(url).split(/[?#]/, 1)[0]
  switch (pathname) {
    case '/': return 'nav.today'
    case '/calendar': return 'nav.calendar'
    case '/progress': return 'nav.progress'
    case '/profile': return 'nav.profile'
    default: return 'notifications.habit'
  }
}

export function getNotificationInboxState(
  notifications: readonly NotificationItem[],
  unreadCount: number,
  pendingDeleteIds: readonly string[],
) {
  const pending = new Set(pendingDeleteIds)
  const hiddenUnread = notifications.filter((item) => pending.has(item.id) && !item.isRead).length
  return {
    visibleNotifications: notifications.filter((item) => !pending.has(item.id)),
    visibleUnreadCount: Math.max(0, unreadCount - hiddenUnread),
  }
}
