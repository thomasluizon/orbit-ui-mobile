import { describe, expect, it } from 'vitest'
import {
  getNotificationDetailActionVisibility,
  getNotificationGlyph,
  isViewableNotificationUrl,
  getReturningCompletionGuidance,
  getReturningCompletionWindow,
  selectNewestUnreadProactiveCheckin,
  shouldShowTodayAstraLine,
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

  it('derives the bounded request window from Today', () => {
    expect(getReturningCompletionWindow('2026-08-29')).toEqual({
      dateFrom: '2026-07-30',
      dateTo: '2026-08-29',
    })
  })

  it('uses the newest positive completion after missed days', () => {
    const calendarMonth = {
      habits: [],
      logs: {
        first: [{ id: 'older', date: '2026-08-20', value: 1, createdAtUtc: '2026-08-20T10:00:00Z' }],
        second: [{ id: 'newest', date: '2026-08-25', value: 1, createdAtUtc: '2026-08-25T10:00:00Z' }],
      },
    }

    expect(getReturningCompletionGuidance(calendarMonth, '2026-08-29', true)).toEqual({
      kind: 'elapsed',
      days: 4,
    })
  })

  it('does not move the completion date for a newer non-positive log', () => {
    const calendarMonth = {
      habits: [],
      logs: {
        habit: [
          { id: 'completion', date: '2026-08-23', value: 1, createdAtUtc: '2026-08-23T10:00:00Z' },
          { id: 'skip', date: '2026-08-28', value: 0, createdAtUtc: '2026-08-28T10:00:00Z' },
        ],
      },
    }

    expect(getReturningCompletionGuidance(calendarMonth, '2026-08-29', true)).toEqual({
      kind: 'elapsed',
      days: 6,
    })
  })

  it('does not infer a completion interval when the response has no positive log', () => {
    const calendarMonth = {
      habits: [],
      logs: {
        habit: [{ id: 'skip', date: '2026-08-28', value: 0, createdAtUtc: '2026-08-28T10:00:00Z' }],
      },
    }

    expect(getReturningCompletionGuidance(calendarMonth, '2026-08-29', true)).toBeNull()
    expect(getReturningCompletionGuidance(calendarMonth, '2026-08-29', false)).toBeNull()
    expect(getReturningCompletionGuidance(calendarMonth, '2026-08-29', undefined)).toBeNull()
    expect(getReturningCompletionGuidance(undefined, '2026-08-29', true)).toBeNull()
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
