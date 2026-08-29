import { API } from '@orbit/shared/api'
import {
  buildHabitQueryString,
  buildUrlWithQuery,
  formatAPIDate,
} from '@orbit/shared/utils'
import {
  createPaginatedSchema,
  habitScheduleItemSchema,
  type HabitScheduleItem,
} from '@orbit/shared/types/habit'
import { serverAuthFetch } from '@/lib/server-fetch'

const paginatedHabitsSchema = createPaginatedSchema(habitScheduleItemSchema)

export interface TodayInitialHabits {
  dateStr: string
  items: HabitScheduleItem[]
}

export async function loadTodayInitialHabits(
  requestedDate: string | undefined,
): Promise<TodayInitialHabits | null> {
  const today = formatAPIDate(new Date())
  const dateStr = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? requestedDate
    : today
  const queryString = buildHabitQueryString({
    dateFrom: dateStr,
    dateTo: dateStr,
    includeOverdue: dateStr === today,
  })

  try {
    const response = await serverAuthFetch(
      buildUrlWithQuery(API.habits.list, queryString),
      { cache: 'no-store' },
      paginatedHabitsSchema,
    )
    return { dateStr, items: response.items }
  } catch {
    return null
  }
}
