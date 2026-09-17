import { describe, expect, it } from 'vitest'
import {
  buildCalendarAutoSyncImportRequest,
  buildCalendarSyncImportRequest,
  formatCalendarAutoSyncLastSynced,
  formatCalendarSyncRecurrenceLabel,
  getCalendarSyncClockValue,
  filterCalendarSyncEventsByDate,
  getCalendarSyncImportIssue,
  getCalendarSyncImportIssueMessageKey,
  isCalendarSyncEventImportable,
  isCalendarAutoSyncStatusReconnectRequired,
  isCalendarSyncConnectionActive,
  isCalendarSyncNotConnectedMessage,
  parseCalendarSyncRecurrence,
  reconcileCalendarAutoSyncGrantRevocation,
  resolveCalendarEventsGrantRevocation,
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

  it('encodes a weekly weekday event as a daily quantity-one habit', () => {
    expect(
      buildCalendarSyncImportRequest([
        {
          id: 'event-wednesday',
          title: 'Wednesday class',
          description: null,
          startDate: '2026-09-23',
          startTime: '18:00',
          endTime: '19:00',
          isRecurring: true,
          recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=WE',
          reminders: [],
        },
      ]),
    ).toEqual({
      habits: [
        {
          title: 'Wednesday class',
          description: null,
          dueDate: '2026-09-23',
          dueTime: '18:00',
          dueEndTime: '19:00',
          frequencyUnit: 'Day',
          frequencyQuantity: 1,
          days: ['Wednesday'],
          reminderEnabled: false,
          reminderTimes: null,
          googleEventId: 'event-wednesday',
        },
      ],
      fromSyncReview: true,
    })
  })

  it('preserves every weekday in a multi-day weekly event', () => {
    expect(
      buildCalendarSyncImportRequest([
        {
          id: 'event-multiple-days',
          title: 'Training days',
          description: 'Strength work',
          startDate: '2026-09-21',
          startTime: '07:00',
          endTime: '08:00',
          isRecurring: true,
          recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR',
          reminders: [30],
        },
      ]),
    ).toEqual({
      habits: [
        {
          title: 'Training days',
          description: 'Strength work',
          dueDate: '2026-09-21',
          dueTime: '07:00',
          dueEndTime: '08:00',
          frequencyUnit: 'Day',
          frequencyQuantity: 1,
          days: ['Monday', 'Wednesday', 'Friday'],
          reminderEnabled: true,
          reminderTimes: [30],
          googleEventId: 'event-multiple-days',
        },
      ],
      fromSyncReview: true,
    })
  })

  it('refuses weekday intervals instead of dropping their days', () => {
    const event = {
      id: 'event-alternate-weeks',
      title: 'Alternate week training',
      description: null,
      startDate: '2026-09-21',
      startTime: null,
      endTime: null,
      isRecurring: true,
      recurrenceRule: 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE',
      reminders: [],
    }

    expect(getCalendarSyncImportIssue(event.recurrenceRule)).toBe('weekday-interval')
    expect(() => buildCalendarSyncImportRequest([event])).toThrow(
      'Unsupported calendar recurrence: weekday-interval',
    )
  })

  it('refuses ordinal weekdays instead of importing a different monthly schedule', () => {
    const event = {
      id: 'event-second-monday',
      title: 'Second Monday review',
      description: null,
      startDate: '2026-09-14',
      startTime: null,
      endTime: null,
      isRecurring: true,
      recurrenceRule: 'RRULE:FREQ=MONTHLY;BYDAY=2MO',
      reminders: [],
    }

    expect(getCalendarSyncImportIssue(event.recurrenceRule)).toBe('ordinal-weekday')
    expect(() => buildCalendarSyncImportRequest([event])).toThrow(
      'Unsupported calendar recurrence: ordinal-weekday',
    )
  })

  it('refuses a BYSETPOS ordinal weekday, which spells the same schedule another way', () => {
    const event = {
      id: 'event-second-monday-setpos',
      title: 'Second Monday review',
      description: null,
      startDate: '2026-09-14',
      startTime: null,
      endTime: null,
      isRecurring: true,
      recurrenceRule: 'RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=2',
      reminders: [],
    }

    expect(getCalendarSyncImportIssue(event.recurrenceRule)).toBe('ordinal-weekday')
    expect(isCalendarSyncEventImportable(event)).toBe(false)
    expect(() => buildCalendarSyncImportRequest([event])).toThrow(
      'Unsupported calendar recurrence: ordinal-weekday',
    )
  })

  it('refuses the last weekday of the month, which Google spells with BYSETPOS=-1', () => {
    const event = {
      id: 'event-last-weekday',
      title: 'Month end wrap up',
      description: null,
      startDate: '2026-09-30',
      startTime: null,
      endTime: null,
      isRecurring: true,
      recurrenceRule: 'RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1',
      reminders: [],
    }

    expect(getCalendarSyncImportIssue(event.recurrenceRule)).toBe('ordinal-weekday')
    expect(isCalendarSyncEventImportable(event)).toBe(false)
  })


  it('filters events to one calendar day, and to nothing when no day is selected', () => {
    const onThatDay = { id: 'a', title: 'A', description: null, startDate: '2026-09-14', startTime: null, endTime: null, isRecurring: false, recurrenceRule: null, reminders: [] }
    const anotherDay = { ...onThatDay, id: 'b', startDate: '2026-09-15' }

    expect(filterCalendarSyncEventsByDate([onThatDay, anotherDay], '2026-09-14')).toEqual([onThatDay])
    expect(filterCalendarSyncEventsByDate([onThatDay, anotherDay], null)).toEqual([])
  })

  it('names a message key per import issue', () => {
    expect(getCalendarSyncImportIssueMessageKey('ordinal-weekday')).toBe('calendar.importIssue.ordinalWeekday')
    expect(getCalendarSyncImportIssueMessageKey('weekday-interval')).toBe('calendar.importIssue.weekdayInterval')
  })

  it('turns a revoked Google grant into a reconnect state and keeps the last sync time', () => {
    expect(reconcileCalendarAutoSyncGrantRevocation({
      enabled: true,
      status: 'Idle',
      lastSyncedAt: '2026-09-14T10:00:00Z',
      hasGoogleConnection: true,
    })).toEqual({
      enabled: false,
      status: 'ReconnectRequired',
      lastSyncedAt: '2026-09-14T10:00:00Z',
      hasGoogleConnection: false,
    })

    expect(reconcileCalendarAutoSyncGrantRevocation(undefined)).toEqual({
      enabled: false,
      status: 'ReconnectRequired',
      lastSyncedAt: null,
      hasGoogleConnection: false,
    })
  })

  it('falls back to a quantity of one when a frequency carries none', () => {
    expect(parseCalendarSyncRecurrence('RRULE:FREQ=MONTHLY')).toEqual({ frequencyUnit: 'Month', frequencyQuantity: 1 })
    expect(parseCalendarSyncRecurrence('RRULE:FREQ=WEEKLY;INTERVAL=0')).toEqual({ frequencyUnit: 'Week' })

    const request = buildCalendarSyncImportRequest([{
      id: 'event-zero-interval',
      title: 'Zero interval',
      description: null,
      startDate: '2026-09-14',
      startTime: null,
      endTime: null,
      isRecurring: true,
      recurrenceRule: 'RRULE:FREQ=WEEKLY;INTERVAL=0',
      reminders: [],
    }])

    const [habit] = request.habits
    expect(habit).toBeDefined()
    expect(habit?.frequencyUnit).toBe('Week')
    expect(habit?.frequencyQuantity).toBe(1)
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

  it('recognizes the events signals that revoke a cached connection', () => {
    const connectedState = {
      enabled: true,
      status: 'Idle' as const,
      lastSyncedAt: null,
      hasGoogleConnection: true,
    }

    expect(resolveCalendarEventsGrantRevocation('CALENDAR_RECONNECT_REQUIRED', undefined))
      .toBe('reconcile')
    expect(resolveCalendarEventsGrantRevocation('CALENDAR_NOT_CONNECTED', connectedState))
      .toBe('reconcile')
    expect(resolveCalendarEventsGrantRevocation('CALENDAR_NOT_CONNECTED', undefined))
      .toBe('cancel-state-read')
    expect(resolveCalendarEventsGrantRevocation('CALENDAR_FETCH_FAILED', connectedState))
      .toBeNull()
  })

  it('derives the connection line from confirmed profile fields', () => {
    expect(isCalendarSyncConnectionActive(true, 'Idle')).toBe(true)
    expect(isCalendarSyncConnectionActive(true, 'TransientError')).toBe(true)
    expect(isCalendarSyncConnectionActive(true, 'ReconnectRequired')).toBe(false)
    expect(isCalendarSyncConnectionActive(false, 'Idle')).toBe(false)
  })

  it('extracts the local clock value from the last sync timestamp', () => {
    expect(getCalendarSyncClockValue('2026-09-12T09:12:00')).toBe('09:12')
    expect(getCalendarSyncClockValue(null)).toBeNull()
    expect(getCalendarSyncClockValue('invalid')).toBeNull()
  })

  it('recognizes not-connected messages', () => {
    expect(isCalendarSyncNotConnectedMessage('Unauthorized')).toBe(true)
    expect(isCalendarSyncNotConnectedMessage('Calendar connection is missing')).toBe(true)
    expect(isCalendarSyncNotConnectedMessage('Google Calendar connection expired. Please reconnect.')).toBe(true)
    expect(isCalendarSyncNotConnectedMessage('Something else')).toBe(false)
  })
})
