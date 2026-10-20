import { API } from '@orbit/shared/api'
import { deduplicateHabitList, habitKeys } from '@orbit/shared/query'
import {
  buildHabitQueryString,
  buildUrlWithQuery,
  fetchAllPaginatedItems,
  formatAPIDate,
  habitListQueryFilters,
} from '@orbit/shared/utils'
import {
  createPaginatedSchema,
  habitScheduleItemSchema,
  type HabitScheduleItem,
  type PaginatedResponse,
} from '@orbit/shared/types/habit'
import { serverAuthFetch } from '@/lib/server-fetch'
import { buildTodayFilters } from './today-model'

const paginatedHabitsSchema = createPaginatedSchema(habitScheduleItemSchema)

export interface TodayInitialHabits {
  queryKey: ReturnType<typeof habitKeys.list>
  items: HabitScheduleItem[]
  totalCount: number
}

export async function loadTodayInitialHabits(
  requestedDate: string | undefined,
  today: string = formatAPIDate(new Date()),
): Promise<TodayInitialHabits | null> {
  const dateStr = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? requestedDate
    : today
  const filters = buildTodayFilters({
    dateStr,
    isTodayDate: dateStr === today,
    searchQuery: '',
    selectedFrequency: null,
    selectedTagIds: [],
    showGeneralOnToday: false,
  })
  const queryKey = habitKeys.list(habitListQueryFilters(filters, true))
  const queryString = buildHabitQueryString(filters)

  try {
    const firstPage = await serverAuthFetch(
      buildUrlWithQuery(API.habits.list, queryString),
      { cache: 'no-store' },
      paginatedHabitsSchema,
    )
    const items = firstPage.totalPages > 1
      ? await fetchAllPaginatedItems<HabitScheduleItem, PaginatedResponse<HabitScheduleItem>>(async (page) => {
          if (page === 1) return firstPage
          return serverAuthFetch(
            buildUrlWithQuery(API.habits.list, buildHabitQueryString({ ...filters, page })),
            { cache: 'no-store' },
            paginatedHabitsSchema,
          )
        })
      : firstPage.items
    return { queryKey, items: deduplicateHabitList(items), totalCount: firstPage.totalCount }
  } catch {
    return null
  }
}
