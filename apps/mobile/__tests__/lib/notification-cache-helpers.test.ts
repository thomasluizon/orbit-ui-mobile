import { describe, expect, it, vi } from 'vitest'
import { notificationKeys } from '@orbit/shared/query'
import {
  invalidateNotificationList,
  restoreNotificationList,
  snapshotNotificationList,
} from '@/lib/notification-cache-helpers'

describe('notification cache helpers', () => {
  it('snapshots and restores the notification list cache', () => {
    const queryClient = {
      getQueryData: vi.fn(() => ({
        items: [{ id: 'n-1', isRead: false }],
        unreadCount: 1,
      })),
      setQueryData: vi.fn(),
    } as const

    const snapshot = snapshotNotificationList(queryClient)

    expect(snapshot).toEqual({
      items: [{ id: 'n-1', isRead: false }],
      unreadCount: 1,
    })

    restoreNotificationList(queryClient, snapshot)

    expect(queryClient.setQueryData).toHaveBeenCalledWith(notificationKeys.lists(), snapshot)
  })

  it('skips restore when no snapshot exists', () => {
    const queryClient = {
      setQueryData: vi.fn(),
    } as const

    restoreNotificationList(queryClient, undefined)

    expect(queryClient.setQueryData).not.toHaveBeenCalled()
  })

  it('invalidates the notification list query', async () => {
    const queryClient = {
      invalidateQueries: vi.fn(async () => {}),
    } as const

    await invalidateNotificationList(queryClient)

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: notificationKeys.lists(),
    })
  })
})
