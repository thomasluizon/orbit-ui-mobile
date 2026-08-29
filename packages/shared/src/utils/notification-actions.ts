import type { NotificationItem } from '../types/notification'
import type { CalendarMonthResponse } from '../types/habit'
import { differenceInCalendarDays, subDays } from 'date-fns'
import { formatAPIDate, parseAPIDate } from './dates'

export const RETURNING_COMPLETION_WINDOW_DAYS = 30

export type ReturningCompletionGuidance =
  | { kind: 'elapsed'; days: number }
  | null

export function selectNewestUnreadProactiveCheckin(
  notifications: readonly NotificationItem[],
): NotificationItem | null {
  const candidates = notifications
    .filter((item) => !item.isRead && item.url === '/chat' && item.habitId === null)
  candidates.sort((left, right) => right.createdAtUtc.localeCompare(left.createdAtUtc))
  return candidates[0] ?? null
}

export function getReturningCompletionWindow(today: string): {
  dateFrom: string
  dateTo: string
} {
  return {
    dateFrom: formatAPIDate(subDays(parseAPIDate(today), RETURNING_COMPLETION_WINDOW_DAYS)),
    dateTo: today,
  }
}

export function getReturningCompletionGuidance(
  calendarMonth: CalendarMonthResponse | undefined,
  today: string,
  hasLoggedFirstHabit: boolean | undefined,
): ReturningCompletionGuidance {
  if (!calendarMonth) return null

  let newestCompletionDate: string | null = null
  for (const logs of Object.values(calendarMonth.logs)) {
    for (const log of logs) {
      if (log.value > 0 && (!newestCompletionDate || log.date > newestCompletionDate)) {
        newestCompletionDate = log.date
      }
    }
  }

  if (!newestCompletionDate && hasLoggedFirstHabit === false) return null
  if (!newestCompletionDate) return null
  const days = differenceInCalendarDays(parseAPIDate(today), parseAPIDate(newestCompletionDate))
  return days >= 3 ? { kind: 'elapsed', days } : null
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
