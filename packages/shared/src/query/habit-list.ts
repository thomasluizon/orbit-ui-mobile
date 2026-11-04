import { CancelledError, type QueryClient, type FetchQueryOptions } from '@tanstack/query-core'
import type { HabitsFilter, HabitScheduleItem, PaginatedResponse } from '../types/habit'
import { formatAPIDate, parseAPIDate } from '../utils/dates'
import { habitListQueryFilters, shouldFetchAllHabitPages } from '../utils/habit-list-pagination-core'
import { loadHabitListSchedule } from '../utils/habit-list-schedule'
import { fetchAllPaginatedItems } from '../utils/pagination'
import { deduplicateHabitList } from './habit-cache'
import { habitKeys } from './keys'
import { QUERY_STALE_TIMES } from './options'

export interface HabitListOptions {
  completeDay?: boolean
  scheduleDate?: string
  enabled?: boolean
  prefetchAroundToday?: string
}

interface HabitListAdapters {
  readPage: (filters: HabitsFilter) => Promise<PaginatedResponse<HabitScheduleItem>>
  getAccountGeneration: () => number
}

export function habitListQueryOptions(
  filters: HabitsFilter,
  { completeDay = false, scheduleDate }: HabitListOptions,
  queryClient: QueryClient,
  adapters: HabitListAdapters,
): FetchQueryOptions<HabitScheduleItem[]> {
  const queryKey = habitKeys.list(habitListQueryFilters(filters, completeDay, scheduleDate))
  return {
    queryKey,
    staleTime: QUERY_STALE_TIMES.habits,
    queryFn: async ({ signal }): Promise<HabitScheduleItem[]> => {
      const generation = adapters.getAccountGeneration()
      const query = queryClient.getQueryCache().find({ queryKey, exact: true })!
      /** https://github.com/thomasluizon/orbit-tickets/issues/1985: a new read consumes the prior invalidation so another write can invalidate it. */
      query.setState({ isInvalidated: false })
      const unsubscribe = queryClient.getQueryCache().subscribe(event => {
        if (event.type !== 'updated' || event.action.type !== 'invalidate' || event.query !== query) return
        unsubscribe()
        /** https://github.com/thomasluizon/orbit-tickets/issues/1985: invalidation must also fence inactive, empty prefetches. */
        void queryClient.cancelQueries({ queryKey, exact: true })
        event.query.invalidate()
      })
      signal.addEventListener('abort', unsubscribe, { once: true })
      const assertCurrent = () => {
        if (signal.aborted || adapters.getAccountGeneration() !== generation) throw new CancelledError({ silent: true })
      }
      const readPage = async (pageFilters: HabitsFilter) => {
        const page = await adapters.readPage(pageFilters)
        assertCurrent()
        return page
      }
      const readList = async () => {
        const requestFilters = filters.dateFrom || filters.pageSize ? filters : { ...filters, pageSize: 200 }
        const firstPage = await readPage(requestFilters)
        const items = shouldFetchAllHabitPages(requestFilters, completeDay, firstPage.totalPages)
          ? deduplicateHabitList(await fetchAllPaginatedItems<HabitScheduleItem, PaginatedResponse<HabitScheduleItem>>(
            page => page === 1 ? Promise.resolve(firstPage) : readPage({ ...requestFilters, page }),
          ))
          : firstPage.items
        assertCurrent()
        queryClient.setQueryData(habitKeys.listTotalCount(filters), firstPage.totalCount)
        return items
      }
      try {
        return await loadHabitListSchedule(readList(), scheduleDate, readPage)
      } finally {
        unsubscribe()
        signal.removeEventListener('abort', unsubscribe)
      }
    },
  }
}

export function adjacentHabitDayFilters(filters: HabitsFilter, today: string): HabitsFilter[] {
  if (!filters.dateFrom || filters.dateFrom !== filters.dateTo || filters.isGeneral) return []
  return [-1, 1].map(offset => {
    const day = parseAPIDate(filters.dateFrom!)
    day.setDate(day.getDate() + offset)
    const date = formatAPIDate(day)
    return { ...filters, dateFrom: date, dateTo: date, includeOverdue: date === today }
  })
}
