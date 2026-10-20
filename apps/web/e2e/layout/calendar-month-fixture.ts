import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'

export const emptyCalendarMonth = calendarMonthResponseSchema.parse({ habits: [], logs: {} })
