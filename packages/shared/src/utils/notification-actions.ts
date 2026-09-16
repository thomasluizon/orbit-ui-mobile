import type { NotificationItem } from '../types/notification'
import { parseWrappedRouteSelection } from './share-card'

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
  const resolvedUrl = resolveNotificationUrl(url)
  if (!resolvedUrl) return false
  const pathname = resolvedUrl.split(/[?#]/, 1)[0] ?? resolvedUrl
  return ['/', '/calendar', '/progress', '/profile'].includes(pathname) ||
    pathname === '/wrapped' ||
    /^\/habits\/[^/\\.%]+$/.test(pathname)
}

const ABSORBED_PROGRESS_ROUTES = [
  '/goals',
  '/streak',
  '/achievements',
  '/insights',
  '/retrospective',
] as const

export function resolveNotificationUrl(url: string): string | null {
  const pathname = url.split(/[?#]/, 1)[0] ?? url
  if (pathname === '/chat') return '/'
  if (pathname === '/calendar-sync') return '/calendar'
  if (pathname === '/progress' && url.includes('?')) {
    const params = new URLSearchParams(url.slice(url.indexOf('?') + 1).split('#', 1)[0])
    if (params.has('wrapped')) {
      const selection = parseWrappedRouteSelection(
        params.get('wrapped'),
        params.get('year'),
        params.get('month'),
      )
      if (!selection.closedMonth) return null
      const destinationParams = new URLSearchParams({
        period: selection.period,
        year: String(selection.closedMonth.year),
        month: String(selection.closedMonth.month),
      })
      return `/wrapped?${destinationParams.toString()}`
    }
  }
  const isAbsorbedRoute = ABSORBED_PROGRESS_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  )
  return isAbsorbedRoute ? '/progress' : url
}

export function getNotificationDetailActionVisibility(
  notification: Pick<NotificationItem, 'isRead' | 'url' | 'habitId'>,
): { canView: boolean; canMarkAsRead: boolean } {
  return {
    canView: getNotificationDestination(notification.url, notification.habitId) !== null,
    canMarkAsRead: !notification.isRead,
  }
}

export function getNotificationDestination(
  url: string | null | undefined,
  habitId: string | null = null,
): { url: string; opensAstra: boolean } | null {
  if (!isViewableNotificationUrl(url)) return null
  const destination = habitId === null ? resolveNotificationUrl(url) : `/habits/${encodeURIComponent(habitId)}`
  if (!destination) return null
  if (!isViewableNotificationUrl(destination)) return null
  return { url: destination, opensAstra: habitId === null && url.split(/[?#]/, 1)[0] === '/chat' }
}

export function getNotificationTargetKey(url: string | null, habitId: string | null = null):
  'nav.today' | 'nav.calendar' | 'nav.progress' | 'nav.profile' | 'profile.wrappedTitle' | 'notifications.habit' | null {
  const destination = getNotificationDestination(url, habitId)
  if (!destination) return null
  const pathname = destination.url.split(/[?#]/, 1)[0]
  switch (pathname) {
    case '/': return 'nav.today'
    case '/calendar': return 'nav.calendar'
    case '/progress': return 'nav.progress'
    case '/profile': return 'nav.profile'
    case '/wrapped': return 'profile.wrappedTitle'
    default: return 'notifications.habit'
  }
}

export function getNotificationInboxState(
  notifications: readonly NotificationItem[],
  unreadCount: number,
  pendingDeleteIds: readonly string[],
): { visibleNotifications: NotificationItem[]; visibleUnreadCount: number } {
  const pending = new Set(pendingDeleteIds)
  const hiddenUnread = notifications.filter((item) => pending.has(item.id) && !item.isRead).length
  return {
    visibleNotifications: notifications.filter((item) => !pending.has(item.id)),
    visibleUnreadCount: Math.max(0, unreadCount - hiddenUnread),
  }
}
