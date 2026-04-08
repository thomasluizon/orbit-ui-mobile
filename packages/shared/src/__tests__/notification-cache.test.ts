import { describe, expect, it, vi } from 'vitest'
import { notificationKeys } from '../query'
import type { NotificationsResponse } from '../types/notification'
import {
  createEmptyNotificationsResponse,
  deleteNotificationFromList,
  invalidateNotificationList,
  markAllNotificationsReadInList,
  markNotificationReadInList,
  restoreNotificationList,
  snapshotNotificationList,
} from '../utils/notification-cache'

function createNotificationsResponse(): NotificationsResponse {
  return {
    items: [
      {
        id: 'n-1',
        title: 'Unread',
        body: 'Unread body',
        url: null,
        habitId: null,
        isRead: false,
        createdAtUtc: '2025-01-01T00:00:00Z',
      },
      {
        id: 'n-2',
        title: 'Read',
        body: 'Read body',
        url: null,
        habitId: null,
        isRead: true,
        createdAtUtc: '2025-01-01T00:00:00Z',
      },
    ],
    unreadCount: 1,
  }
}

describe('notification cache helpers', () => {
  it('creates an empty notifications response', () => {
    expect(createEmptyNotificationsResponse()).toEqual({
      items: [],
      unreadCount: 0,
    })
  })

  it('snapshots and restores the notification list cache', () => {
    const queryClient = {
      getQueryData: vi.fn(() => createNotificationsResponse()),
      setQueryData: vi.fn(),
    }

    const snapshot = snapshotNotificationList(queryClient)

    expect(snapshot).toEqual(createNotificationsResponse())
    restoreNotificationList(queryClient, snapshot)

    expect(queryClient.setQueryData).toHaveBeenCalledWith(notificationKeys.lists(), snapshot)
  })

  it('marks a single notification as read and decrements unread count', () => {
    const updated = markNotificationReadInList(createNotificationsResponse(), 'n-1')

    expect(updated.items.find((item) => item.id === 'n-1')?.isRead).toBe(true)
    expect(updated.unreadCount).toBe(0)
  })

  it('marks all notifications as read', () => {
    const updated = markAllNotificationsReadInList(createNotificationsResponse())

    expect(updated.items.every((item) => item.isRead)).toBe(true)
    expect(updated.unreadCount).toBe(0)
  })

  it('deletes a notification and updates unread count when needed', () => {
    const updated = deleteNotificationFromList(createNotificationsResponse(), 'n-1')

    expect(updated.items.map((item) => item.id)).toEqual(['n-2'])
    expect(updated.unreadCount).toBe(0)
  })

  it('invalidates the notification list query', async () => {
    const queryClient = {
      invalidateQueries: vi.fn(async () => {}),
    }

    await invalidateNotificationList(queryClient)

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: notificationKeys.lists(),
    })
  })
})
