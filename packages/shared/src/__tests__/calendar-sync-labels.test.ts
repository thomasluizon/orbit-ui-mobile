import { describe, expect, it } from 'vitest'
import {
  formatCalendarSyncRecurrenceLabel,
  type CalendarSyncTranslationAdapter,
} from '../utils/calendar-sync'

const adapter: CalendarSyncTranslationAdapter = {
  translate: (key) => key,
  pluralize: (text) => text,
}

describe('formatCalendarSyncRecurrenceLabel', () => {
  it('returns an empty label for no rule or an unknown frequency', () => {
    expect(formatCalendarSyncRecurrenceLabel(null, adapter)).toBe('')
    expect(formatCalendarSyncRecurrenceLabel('FREQ=HOURLY', adapter)).toBe('')
  })

  it('labels daily recurrences, singular and with an interval', () => {
    expect(formatCalendarSyncRecurrenceLabel('FREQ=DAILY', adapter)).toBe('calendar.recurrenceDaily')
    expect(formatCalendarSyncRecurrenceLabel('FREQ=DAILY;INTERVAL=3', adapter)).toBe(
      'calendar.recurrenceEveryNDays',
    )
  })

  it('labels weekly recurrences by day list and interval', () => {
    expect(formatCalendarSyncRecurrenceLabel('FREQ=WEEKLY', adapter)).toBe('calendar.recurrenceWeekly')
    expect(formatCalendarSyncRecurrenceLabel('FREQ=WEEKLY;BYDAY=MO,WE', adapter)).toBe(
      'calendar.recurrenceWeeklyDays',
    )
    expect(formatCalendarSyncRecurrenceLabel('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', adapter)).toBe(
      'calendar.recurrenceEveryNWeeks (MO)',
    )
    expect(formatCalendarSyncRecurrenceLabel('FREQ=WEEKLY;INTERVAL=2', adapter)).toBe(
      'calendar.recurrenceEveryNWeeks',
    )
  })

  it('labels monthly and yearly recurrences', () => {
    expect(formatCalendarSyncRecurrenceLabel('FREQ=MONTHLY', adapter)).toBe('calendar.recurrenceMonthly')
    expect(formatCalendarSyncRecurrenceLabel('FREQ=MONTHLY;INTERVAL=4', adapter)).toBe(
      'calendar.recurrenceEveryNMonths',
    )
    expect(formatCalendarSyncRecurrenceLabel('FREQ=YEARLY', adapter)).toBe('calendar.recurrenceYearly')
  })
})
