import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { startOfMonth, endOfMonth } from 'date-fns'
import { habitKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { buildCalendarDayMap, formatAPIDate } from '@orbit/shared/utils'
import type { CalendarMonthResponse } from '@orbit/shared/types/habit'
import { apiClient } from '@/lib/api-client'

/**
 * Mobile parity port of `apps/web/hooks/use-calendar-data.ts`.
 *
 * Same query key, same staleTime, same response shape. Mobile reaches
 * the API directly via the SecureStore-backed `apiClient` instead of the
 * web's BFF proxy, which is the only allowed delta between the two.
 */
async function fetchCalendarMonth(
  monthStart: string,
  monthEnd: string,
): Promise<CalendarMonthResponse> {
  return apiClient<CalendarMonthResponse>(
    `${API.habits.calendarMonth}?dateFrom=${monthStart}&dateTo=${monthEnd}`,
  )
}

export function useCalendarData(currentMonth: Date) {
  const monthStart = formatAPIDate(startOfMonth(currentMonth))
  const monthEnd = formatAPIDate(endOfMonth(currentMonth))

  const query = useQuery({
    queryKey: habitKeys.calendar(monthStart, monthEnd),
    queryFn: () => fetchCalendarMonth(monthStart, monthEnd),
    staleTime: QUERY_STALE_TIMES.habits,
  })

  const dayMap = useMemo(() => {
    if (!query.data) return new Map()
    return buildCalendarDayMap(query.data)
  }, [query.data])

  return {
    dayMap,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message ?? null,
    refresh: () => query.refetch(),
  }
}
