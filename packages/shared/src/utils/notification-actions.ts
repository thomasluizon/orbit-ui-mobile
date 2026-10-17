import type { NotificationItem } from '../types/notification'
import { parseWrappedRouteSelection } from './share-card'

export function shouldShowTodayAstraSurface({
  isTodaySelected,
  inDrillOrSurface,
}: Readonly<{
  isTodaySelected: boolean
  inDrillOrSurface: boolean
}>): boolean {
  return isTodaySelected && !inDrillOrSurface
}

export function isViewableNotificationUrl(
  url: string | null | undefined,
): url is string {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return false
  const resolvedUrl = resolveNotificationUrl(url)
  if (!resolvedUrl) return false
  const pathname = resolvedUrl.split(/[?#]/, 1)[0] ?? resolvedUrl
  return ['/', '/calendar', '/progress', '/progress/streak', '/progress/goals', '/progress/achievements', '/profile'].includes(pathname) ||
    pathname === '/wrapped' ||
    /^\/habits\/[^/\\.%]+$/.test(pathname)
}

const LEGACY_PROGRESS_DESTINATIONS: Readonly<Record<string, string>> = {
  '/streak': '/progress/streak',
  '/goals': '/progress/goals',
  '/achievements': '/progress/achievements',
  '/insights': '/progress',
  '/retrospective': '/progress',
}

export function resolveNotificationUrl(url: string): string | null {
  const pathname = url.split(/[?#]/, 1)[0] ?? url
  if (pathname === '/chat') return '/'
  if (pathname === '/calendar-sync') {
    const params = new URLSearchParams(url.split('?', 2)[1]?.split('#', 1)[0] ?? '')
    return params.get('mode') === 'review' ? '/calendar?mode=review' : '/calendar'
  }
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
  const suffix = url.slice(pathname.length)
  const retired = Object.entries(LEGACY_PROGRESS_DESTINATIONS).find(
    ([route]) => pathname === route || pathname.startsWith(`${route}/`),
  )
  return retired ? `${retired[1]}${suffix}` : url
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
    case '/progress':
    case '/progress/streak':
    case '/progress/goals':
    case '/progress/achievements': return 'nav.progress'
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
