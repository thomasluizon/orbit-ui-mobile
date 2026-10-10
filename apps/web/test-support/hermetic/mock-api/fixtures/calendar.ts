import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'

export const emptyCalendarMonthFixture = calendarMonthResponseSchema.parse({ habits: [], logs: {} })
