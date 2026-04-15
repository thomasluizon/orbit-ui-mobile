'use client'

import { useMemo } from 'react'
import { endOfMonth, startOfMonth } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import { habitKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { buildCalendarDayMap, formatAPIDate } from '@orbit/shared/utils'
import type { CalendarMonthResponse } from '@orbit/shared/types/habit'
import { apiClient } from '@/lib/api-client'

/**
 * Month-grouped calendar data for the habit calendar view. Mirrors
 * apps/web/hooks/use-calendar-data.ts so the two platforms share the same
 * organization, query key, and dayMap memoization policy.
 */
export function useCalendarData(currentMonth: Date) {
  const monthStart = formatAPIDate(startOfMonth(currentMonth))
  const monthEnd = formatAPIDate(endOfMonth(currentMonth))

  const query = useQuery({
    queryKey: habitKeys.calendar(monthStart, monthEnd),
    queryFn: () =>
      apiClient<CalendarMonthResponse>(
        `${API.habits.calendarMonth}?dateFrom=${monthStart}&dateTo=${monthEnd}`,
      ),
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
