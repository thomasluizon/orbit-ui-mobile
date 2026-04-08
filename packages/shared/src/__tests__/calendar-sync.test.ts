import { describe, expect, it } from 'vitest'
import {
  buildCalendarSyncImportRequest,
  formatCalendarSyncRecurrenceLabel,
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
        },
      ],
    })
  })

  it('recognizes not-connected messages', () => {
    expect(isCalendarSyncNotConnectedMessage('Unauthorized')).toBe(true)
    expect(isCalendarSyncNotConnectedMessage('Calendar connection is missing')).toBe(true)
    expect(isCalendarSyncNotConnectedMessage('Something else')).toBe(false)
  })
})
