import { describe, expect, it } from 'vitest'
import {
  getNotificationDetailActionVisibility,
  isViewableNotificationUrl,
} from '../utils/notification-actions'

describe('notification-actions', () => {
  it('accepts safe internal URLs', () => {
    expect(isViewableNotificationUrl('/habits/1')).toBe(true)
    expect(isViewableNotificationUrl('/')).toBe(true)
  })

  it('rejects external or protocol-relative URLs', () => {
    expect(isViewableNotificationUrl('https://orbit.app')).toBe(false)
    expect(isViewableNotificationUrl('//evil.com')).toBe(false)
    expect(isViewableNotificationUrl(null)).toBe(false)
  })

  it('derives notification detail action visibility', () => {
    expect(
      getNotificationDetailActionVisibility({
        isRead: false,
        url: '/profile',
      }),
    ).toEqual({ canView: true, canMarkAsRead: true })

    expect(
      getNotificationDetailActionVisibility({
        isRead: true,
        url: null,
      }),
    ).toEqual({ canView: false, canMarkAsRead: false })
  })
})
