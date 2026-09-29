import { describe, expect, it } from 'vitest'
import {
  getNotificationDestination,
  getNotificationDetailActionVisibility,
  getNotificationGlyph,
  isViewableNotificationUrl,
  resolveNotificationUrl,
} from '../utils/notification-actions'

describe('notification-actions', () => {
  it.each([
    ['/progress', '/streak'],
    ['/progress?wrapped=month&year=2026&month=8', '/wrapped?wrapped=month&year=2026&month=8'],
    ['/progress?', '/streak'],
    ['/progress?other=value', '/streak'],
    ['/', '/'],
    ['/chat', '/chat'],
    ['/profile', '/profile'],
    ['/calendar-sync', '/calendar-sync'],
    ['/calendar-sync?mode=review', '/calendar-sync?mode=review'],
    ['/streak', '/streak'],
    ['//evil.example', null],
    ['https://evil.example', null],
    ['/social/x', null],
    ['/public-profile/x', null],
    ['/u/example', null],
  ])('resolves %s to %s', (url, expected) => {
    expect(resolveNotificationUrl(url)).toBe(expected)
    expect(getNotificationDestination(url)).toEqual(expected ? { url: expected } : null)
    expect(getNotificationDetailActionVisibility({ url, isRead: false }).canView)
      .toBe(expected !== null)
  })

  it('does not provide a destination for a missing URL', () => {
    expect(getNotificationDestination(null)).toBeNull()
    expect(getNotificationDetailActionVisibility({ url: null, isRead: false }).canView).toBe(false)
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
    expect(getNotificationGlyph({ url: '/progress', habitId: null })).toBe('streak')
    expect(getNotificationGlyph({ url: '/progress?other=value', habitId: null })).toBe('streak')
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
