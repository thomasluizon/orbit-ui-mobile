import { describe, expect, it } from 'vitest'
import { formatNotificationRelativeTime } from '../utils/notification-time'

describe('formatNotificationRelativeTime', () => {
  const translate = (key: 'now' | 'minutesAgo' | 'hoursAgo' | 'daysAgo', values?: { n: number }) =>
    values?.n ? `${key}:${values.n}` : key

  it('formats recent notifications as now', () => {
    expect(
      formatNotificationRelativeTime(
        '2025-01-01T12:00:30Z',
        translate,
        new Date('2025-01-01T12:00:59Z'),
      ),
    ).toBe('now')
  })

  it('formats minute differences', () => {
    expect(
      formatNotificationRelativeTime(
        '2025-01-01T12:00:00Z',
        translate,
        new Date('2025-01-01T12:15:00Z'),
      ),
    ).toBe('minutesAgo:15')
  })

  it('formats hour differences', () => {
    expect(
      formatNotificationRelativeTime(
        '2025-01-01T10:00:00Z',
        translate,
        new Date('2025-01-01T15:00:00Z'),
      ),
    ).toBe('hoursAgo:5')
  })

  it('formats day differences', () => {
    expect(
      formatNotificationRelativeTime(
        '2025-01-01T10:00:00Z',
        translate,
        new Date('2025-01-04T10:00:00Z'),
      ),
    ).toBe('daysAgo:3')
  })
})
