import { describe, expect, it } from 'vitest'
import {
  buildCalendarAutoSyncImportRequest,
  buildCalendarSyncImportRequest,
  formatCalendarAutoSyncLastSynced,
  formatCalendarSyncRecurrenceLabel,
  isCalendarAutoSyncStatusReconnectRequired,
  isCalendarSyncNotConnectedMessage,
  parseCalendarSyncRecurrence,
} from '../utils/calendar-sync'

describe('calendar-sync utils', () => {
  it('parses RRULE recurrence data', () => {
    expect(parseCalendarSyncRecurrence('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE')).toEqual({
      frequencyUnit: 'Week',
      frequencyQuantity: 2,
      days: ['Monday', 'Wednesday'],
    })
  })

  it('formats recurrence labels with translation and plural helpers', () => {
    const label = formatCalendarSyncRecurrenceLabel('RRULE:FREQ=DAILY;INTERVAL=3', {
      translate: (key, values) => `${key}:${JSON.stringify(values ?? {})}`,
      pluralize: (text, count) => `${text}#${count}`,
    })

    expect(label).toBe('calendar.recurrenceEveryNDays:{"n":3}#3')
  })

  it('builds bulk create requests from calendar events', () => {
    expect(
      buildCalendarSyncImportRequest([
        {
          id: 'event-1',
          title: 'Morning Run',
          description: 'Daily training',
          startDate: '2026-04-08',
          startTime: '07:00',
          endTime: '07:30',
          isRecurring: true,
          recurrenceRule: 'RRULE:FREQ=DAILY',
          reminders: [15],
        },
      ]),
    ).toEqual({
      habits: [
        {
          title: 'Morning Run',
          description: 'Daily training',
          dueDate: '2026-04-08',
          dueTime: '07:00',
          dueEndTime: '07:30',
          frequencyUnit: 'Day',
          frequencyQuantity: 1,
          days: null,
          reminderEnabled: true,
          reminderTimes: [15],
          googleEventId: 'event-1',
        },
      ],
      fromSyncReview: true,
    })
  })

  it('builds bulk create requests from suggestions', () => {
    const request = buildCalendarAutoSyncImportRequest([
      {
        id: 'sugg-1',
        googleEventId: 'event-42',
        discoveredAtUtc: '2026-04-08T10:00:00Z',
        event: {
          id: 'event-42',
          title: 'Standup',
          description: null,
          startDate: '2026-04-09',
          startTime: '09:00',
          endTime: '09:15',
          isRecurring: true,
          recurrenceRule: 'RRULE:FREQ=DAILY',
          reminders: [],
        },
      },
    ])
    expect(request.habits).toHaveLength(1)
    expect(request.habits[0]?.googleEventId).toBe('event-42')
    expect(request.fromSyncReview).toBe(true)
  })

  it('formats last-synced-at values', () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key
    const now = new Date('2026-04-09T12:00:00Z')

    expect(formatCalendarAutoSyncLastSynced(null, t, now)).toBe('calendar.autoSync.lastSyncedNever')
    expect(formatCalendarAutoSyncLastSynced('2026-04-09T11:59:30Z', t, now)).toBe(
      'calendar.autoSync.lastSyncedJustNow',
    )
    expect(formatCalendarAutoSyncLastSynced('2026-04-09T11:55:00Z', t, now)).toBe(
      'calendar.autoSync.lastSyncedMinutesAgo:{"n":5}',
    )
    expect(formatCalendarAutoSyncLastSynced('2026-04-09T10:00:00Z', t, now)).toBe(
      'calendar.autoSync.lastSyncedHoursAgo:{"n":2}',
    )
    expect(formatCalendarAutoSyncLastSynced('2026-04-08T12:00:00Z', t, now)).toBe(
      'calendar.autoSync.lastSyncedYesterday',
    )
    expect(formatCalendarAutoSyncLastSynced('2026-04-06T12:00:00Z', t, now)).toBe(
      'calendar.autoSync.lastSyncedDaysAgo:{"n":3}',
    )
  })

  it('detects reconnect-required status', () => {
    expect(isCalendarAutoSyncStatusReconnectRequired('ReconnectRequired')).toBe(true)
    expect(isCalendarAutoSyncStatusReconnectRequired('Idle')).toBe(false)
    expect(isCalendarAutoSyncStatusReconnectRequired(null)).toBe(false)
  })

  it('recognizes not-connected messages', () => {
    expect(isCalendarSyncNotConnectedMessage('Unauthorized')).toBe(true)
    expect(isCalendarSyncNotConnectedMessage('Calendar connection is missing')).toBe(true)
    expect(isCalendarSyncNotConnectedMessage('Something else')).toBe(false)
  })
})
