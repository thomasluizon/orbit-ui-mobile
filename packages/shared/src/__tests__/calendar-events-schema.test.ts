import { describe, expect, it } from 'vitest'
import { calendarEventsResponseSchema } from '../types/calendar'
import { createMockCalendarSyncEvent } from './factories'

describe('calendarEventsResponseSchema', () => {
  it('accepts an empty event list', () => {
    expect(calendarEventsResponseSchema.parse([])).toEqual([])
  })

  it('accepts timed recurring events and nullable all-day event fields', () => {
    const events = [
      createMockCalendarSyncEvent(),
      createMockCalendarSyncEvent({
        id: 'event-2',
        description: 'Training',
        startTime: '09:00',
        endTime: '10:00',
        isRecurring: true,
        recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
        reminders: [15, 30],
      }),
      createMockCalendarSyncEvent({ startDate: null, calendarId: undefined, calendarName: undefined }),
    ]
    expect(calendarEventsResponseSchema.parse(events)).toEqual(events)
  })

  it('accepts the additional timestamp and time-zone fields emitted by the API DTO', () => {
    const event = createMockCalendarSyncEvent()
    expect(calendarEventsResponseSchema.parse([{
      ...event,
      startUtc: null,
      endUtc: null,
      recurrenceTimeZone: null,
    }])).toEqual([event])
  })

  it.each([{}, null, [{ id: 1 }]])('rejects malformed response %j', (body) => {
    expect(calendarEventsResponseSchema.safeParse(body).success).toBe(false)
  })

  it('rejects an invalid event alongside a valid event', () => {
    expect(calendarEventsResponseSchema.safeParse([
      createMockCalendarSyncEvent(),
      { ...createMockCalendarSyncEvent(), reminders: ['15'] },
    ]).success).toBe(false)
  })
})
