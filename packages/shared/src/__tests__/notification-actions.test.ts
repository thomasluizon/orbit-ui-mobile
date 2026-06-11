import { describe, expect, it } from 'vitest'
import {
  getNotificationDetailActionVisibility,
  getNotificationGlyph,
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

  it('maps streak notifications to the flame glyph', () => {
    expect(getNotificationGlyph({ url: '/streak', habitId: null })).toBe('streak')
  })

  it('maps Astra-produced notifications to the sparkles glyph', () => {
    expect(getNotificationGlyph({ url: '/chat', habitId: null })).toBe('astra')
    expect(
      getNotificationGlyph({ url: '/calendar-sync?mode=review', habitId: null }),
    ).toBe('astra')
  })

  it('maps gamification and referral notifications to the celebration glyph', () => {
    expect(getNotificationGlyph({ url: null, habitId: null })).toBe('celebration')
    expect(getNotificationGlyph({ url: '/profile', habitId: null })).toBe('celebration')
  })

  it('falls back to the reminder glyph for habit notifications', () => {
    expect(getNotificationGlyph({ url: '/', habitId: 'habit-1' })).toBe('reminder')
    expect(getNotificationGlyph({ url: '/calendar-sync', habitId: null })).toBe('reminder')
  })
})
