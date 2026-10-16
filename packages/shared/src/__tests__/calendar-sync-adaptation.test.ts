import { describe, expect, it } from 'vitest'
import { createMockCalendarSyncEvent } from './factories'
import { bulkCreateRequestSchema } from '../types/habit'
import {
  buildCalendarAutoSyncImportRequest,
  buildCalendarSyncImportRequest,
  formatCalendarSyncRecurrenceLabel,
  getCalendarSyncImportIssue,
  isCalendarSyncEventImportable,
} from '../utils/calendar-sync'

const translations = {
  translate: (key: string, values?: Record<string, unknown>) => `${key}${values ? `:${String(values.n)}` : ''}`,
  pluralize: (text: string) => text,
}

describe('calendar recurrence adaptation', () => {
  it.each([
    ['monthly ordinal', 'FREQ=MONTHLY;BYDAY=2MO', '2026-09-14', 'Month', 1, null, 'calendar.recurrenceMonthly'],
    ['monthly position', 'FREQ=MONTHLY;BYDAY=MO;BYSETPOS=2', '2026-09-14', 'Month', 1, null, 'calendar.recurrenceMonthly'],
    ['last weekday', 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1', '2026-09-30', 'Month', 1, null, 'calendar.recurrenceMonthly'],
    ['yearly ordinal', 'FREQ=YEARLY;BYDAY=2MO', '2026-09-14', 'Year', 1, null, 'calendar.recurrenceYearly'],
    ['monthly interval', 'FREQ=MONTHLY;INTERVAL=2;BYDAY=MO;COUNT=3', '2026-09-14', 'Month', 2, '2027-01-14', 'calendar.recurrenceEveryNMonths:2'],
    ['daily interval', 'FREQ=DAILY;INTERVAL=2;BYDAY=MO;COUNT=3', '2026-09-14', 'Day', 2, '2026-09-18', 'calendar.recurrenceEveryNDays:2'],
    ['yearly interval', 'FREQ=YEARLY;INTERVAL=2;BYDAY=MO;COUNT=3', '2026-09-14', 'Year', 2, '2030-09-14', 'calendar.recurrenceEveryNYears:2'],
    ['long weekly interval', 'FREQ=WEEKLY;INTERVAL=53;BYDAY=MO;COUNT=2', '2026-09-14', 'Week', 53, '2027-09-20', 'calendar.recurrenceEveryNWeeks:53'],
    ['month end', 'FREQ=MONTHLY;COUNT=3', '2026-01-31', 'Month', 1, '2026-03-31', 'calendar.recurrenceMonthly'],
    ['leap day', 'FREQ=YEARLY;COUNT=3', '2024-02-29', 'Year', 1, '2026-02-28', 'calendar.recurrenceYearly'],
    ['large count', 'FREQ=MONTHLY;COUNT=5000000', '2026-01-15', 'Month', 1, '9999-12-31', 'calendar.recurrenceMonthly'],
    ['large interval', 'FREQ=MONTHLY;INTERVAL=100000;COUNT=2', '2026-01-15', 'Month', 100000, '9999-12-31', 'calendar.recurrenceEveryNMonths:100000'],
    ['large until', 'FREQ=DAILY;UNTIL=100000101', '2026-01-15', 'Day', 1, '9999-12-31', 'calendar.recurrenceDaily'],
  ])('imports the adapted %s with a contract-valid frequency', (_name, rule, startDate, frequencyUnit, frequencyQuantity, endDate, label) => {
    const event = createMockCalendarSyncEvent({ recurrenceRule: `RRULE:${rule}`, startDate, startTime: null, isRecurring: true })
    expect(getCalendarSyncImportIssue(event.recurrenceRule, startDate)).toBeNull()
    expect(isCalendarSyncEventImportable(event)).toBe(true)
    const request = buildCalendarSyncImportRequest([event])
    expect(bulkCreateRequestSchema.parse(request).habits[0]).toMatchObject({
      frequencyUnit, frequencyQuantity, dueDate: startDate, days: null, endDate,
    })
    expect(request.habits[0]).not.toHaveProperty('intervalWeeks')
    expect(formatCalendarSyncRecurrenceLabel(event.recurrenceRule, translations)).toBe(label)
    expect(buildCalendarAutoSyncImportRequest([{
      id: 'suggestion', googleEventId: event.id, discoveredAtUtc: '2026-09-14T00:00:00Z', event,
    }])).toEqual(request)
  })

  it('adapts the week partition to the account while retaining the supported frequency', () => {
    const event = createMockCalendarSyncEvent({ recurrenceRule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO;WKST=MO', startDate: '2026-09-27' })
    expect(isCalendarSyncEventImportable(event, 0)).toBe(true)
    expect(bulkCreateRequestSchema.parse(buildCalendarSyncImportRequest([event], 0)).habits[0])
      .toMatchObject({ frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Sunday', 'Monday'], intervalWeeks: 2 })
  })

  it.each([
    [0, '2026-10-12'],
    [1, '2026-10-19'],
  ] as const)('counts alternating weeks using account week start %s', (weekStartDay, endDate) => {
    const event = createMockCalendarSyncEvent({
      recurrenceRule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO;WKST=MO;COUNT=4',
      startDate: '2026-09-27',
    })
    expect(buildCalendarSyncImportRequest([event], weekStartDay).habits[0]).toMatchObject({
      frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Sunday', 'Monday'], intervalWeeks: 2, endDate,
    })
  })
})
