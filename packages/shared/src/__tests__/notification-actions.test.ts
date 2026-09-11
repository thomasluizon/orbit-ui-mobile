import { describe, expect, it } from 'vitest'
import {
  getNotificationDetailActionVisibility,
  getNotificationDestination,
  getNotificationInboxState,
  getNotificationTargetKey,
  isViewableNotificationUrl,
  resolveNotificationUrl,
  selectNewestUnreadProactiveCheckin,
  shouldShowTodayAstraLine,
} from '../utils/notification-actions'
import { createMockNotification } from './factories'

describe('notification-actions', () => {
  it.each([
    ['/', 'nav.today'],
    ['/calendar', 'nav.calendar'],
    ['/progress', 'nav.progress'],
    ['/profile', 'nav.profile'],
    ['/streak', 'nav.progress'],
    ['/chat', 'nav.today'],
    ['/calendar-sync?mode=review', 'nav.calendar'],
  ])('labels the existing target %s', (url, label) => {
    expect(getNotificationTargetKey(url)).toBe(label)
    expect(isViewableNotificationUrl(url)).toBe(true)
  })

  it('labels the scheduler reminder as a habit target', () => {
    const notification = createMockNotification({ url: '/', habitId: 'a12b34cd-1234-4567-89ab-123456789abc' })
    expect(getNotificationTargetKey(notification.url, notification.habitId)).toBe('notifications.habit')
    expect(getNotificationDetailActionVisibility(notification).canView).toBe(true)
    expect(getNotificationDestination(notification.url, notification.habitId)).toEqual({
      url: '/habits/a12b34cd-1234-4567-89ab-123456789abc', opensAstra: false,
    })
  })

  it.each(['/unknown', '/social', '/habits/../login', '/habits/%2e%2e', '/habits/one/edit', '//evil.com', '/profile/unknown'])(
    'never offers a view to the unsupported destination %s', (url) => {
      expect(getNotificationTargetKey(url)).toBeNull()
      expect(getNotificationDestination(url, 'a12b34cd-1234-4567-89ab-123456789abc')).toBeNull()
      expect(getNotificationDetailActionVisibility({ url, isRead: false, habitId: null }).canView).toBe(false)
    },
  )

  it.each(['', '../profile', 'one?next=/profile', 'one#fragment', '%2e%2e'])('rejects a malformed habit target %s', (habitId) => {
    const notification = createMockNotification({ url: '/', habitId })
    expect(getNotificationDestination(notification.url, habitId)).toBeNull()
    expect(getNotificationTargetKey(notification.url, habitId)).toBeNull()
    expect(getNotificationDetailActionVisibility(notification).canView).toBe(false)
  })

  it('uses the endpoint total and subtracts only pending unread items', () => {
    const unread = createMockNotification({ id: 'unread', isRead: false })
    const read = createMockNotification({ id: 'read', isRead: true })
    expect(getNotificationInboxState([unread, read], 20, ['unread', 'read'])).toEqual({
      visibleNotifications: [], visibleUnreadCount: 19,
    })
    expect(getNotificationInboxState([], 20, []).visibleUnreadCount).toBe(20)
  })

  it('accepts safe internal URLs', () => {
    expect(isViewableNotificationUrl('/habits/1')).toBe(true)
    expect(isViewableNotificationUrl('/')).toBe(true)
  })

  it('rejects external or protocol-relative URLs', () => {
    expect(isViewableNotificationUrl('https://orbit.app')).toBe(false)
    expect(isViewableNotificationUrl('//evil.com')).toBe(false)
    expect(isViewableNotificationUrl(null)).toBe(false)
  })

  it('rejects destinations removed with the social feature', () => {
    expect(isViewableNotificationUrl('/social')).toBe(false)
    expect(isViewableNotificationUrl('/public-profile')).toBe(false)
    expect(isViewableNotificationUrl('/u/example')).toBe(false)
  })

  it.each([
    '/streak',
    '/achievements?earned=latest',
    '/insights?range=year',
    '/retrospective/year',
  ])('resolves the absorbed route %s to Progresso', (url) => {
    expect(resolveNotificationUrl(url)).toBe('/progress')
  })

  it('preserves current notification routes', () => {
    expect(resolveNotificationUrl('/habits/1?date=2026-08-28')).toBe(
      '/habits/1?date=2026-08-28',
    )
  })

  it('resolves legacy conversation and calendar links into the four destinations', () => {
    expect(resolveNotificationUrl('/chat')).toBe('/')
    expect(resolveNotificationUrl('/calendar-sync?mode=review')).toBe('/calendar')
  })

  it('derives notification detail action visibility', () => {
    expect(
      getNotificationDetailActionVisibility({
        isRead: false,
        url: '/profile',
        habitId: null,
      }),
    ).toEqual({ canView: true, canMarkAsRead: true })

    expect(
      getNotificationDetailActionVisibility({
        isRead: true,
        url: null,
        habitId: null,
      }),
    ).toEqual({ canView: false, canMarkAsRead: false })
  })

  it('selects the newest unread Astra check-in without treating habit reminders as check-ins', () => {
    const base = { title: 'Astra', body: 'Check in', habitId: null, url: '/chat' }
    const selected = selectNewestUnreadProactiveCheckin([
      { ...base, id: 'read', isRead: true, createdAtUtc: '2026-08-29T10:00:00Z' },
      { ...base, id: 'older', isRead: false, createdAtUtc: '2026-08-28T10:00:00Z' },
      { ...base, id: 'newer', isRead: false, createdAtUtc: '2026-08-29T09:00:00Z' },
      { ...base, id: 'reminder', habitId: 'habit-1', isRead: false, createdAtUtc: '2026-08-30T09:00:00Z' },
    ])
    expect(selected?.id).toBe('newer')
  })

  it('keeps the proactive line off non-Today, drill, offline, and quota-limit states', () => {
    const visible = { isTodaySelected: true, inDrillOrSurface: false, isOnline: true, atLimit: false }
    expect(shouldShowTodayAstraLine(visible)).toBe(true)
    expect(shouldShowTodayAstraLine({ ...visible, isTodaySelected: false })).toBe(false)
    expect(shouldShowTodayAstraLine({ ...visible, inDrillOrSurface: true })).toBe(false)
    expect(shouldShowTodayAstraLine({ ...visible, isOnline: false })).toBe(false)
    expect(shouldShowTodayAstraLine({ ...visible, atLimit: true })).toBe(false)
  })
})
