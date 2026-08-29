import { API } from '@orbit/shared/api'
import { habitKeys } from '@orbit/shared/query'
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
import { buildTodayFilters } from './today-model'

const paginatedHabitsSchema = createPaginatedSchema(habitScheduleItemSchema)

export interface TodayInitialHabits {
  queryKey: ReturnType<typeof habitKeys.list>
  items: HabitScheduleItem[]
}

export async function loadTodayInitialHabits(
  requestedDate: string | undefined,
  today: string = formatAPIDate(new Date()),
): Promise<TodayInitialHabits | null> {
  const dateStr = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? requestedDate
    : today
  const filters = buildTodayFilters({
    view: 'today',
    dateStr,
    isTodayDate: dateStr === today,
    searchQuery: '',
    selectedFrequency: null,
    selectedTagIds: [],
    showGeneralOnToday: false,
  })
  const queryKey = habitKeys.list(filters)
  const queryString = buildHabitQueryString(filters)

  try {
    const response = await serverAuthFetch(
      buildUrlWithQuery(API.habits.list, queryString),
      { cache: 'no-store' },
      paginatedHabitsSchema,
    )
    return { queryKey, items: response.items }
  } catch {
    return null
  }
}
