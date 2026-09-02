'use client'

import { useMemo } from 'react'
import { endOfMonth, startOfMonth } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import { habitKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { buildCalendarDayMap, formatAPIDate } from '@orbit/shared/utils'
import type { CalendarMonthResponse } from '@orbit/shared/types/habit'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { apiClient } from '@/lib/api-client'

function useCalendarRangeQuery(rangeStart: string, rangeEnd: string, enabled = true) {
  const query = useQuery({
    queryKey: habitKeys.calendar(rangeStart, rangeEnd),
    queryFn: () =>
      apiClient<CalendarMonthResponse>(
        `${API.habits.calendarMonth}?dateFrom=${rangeStart}&dateTo=${rangeEnd}`,
      ),
    staleTime: QUERY_STALE_TIMES.habits,
    enabled,
  })

  const dayMap = useMemo<Map<string, CalendarDayEntry[]>>(() => {
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

/**
 * Month-grouped calendar data for the habit calendar view. Mirrors
 * apps/web/hooks/use-calendar-data.ts so the two platforms share the same
 * organization, query key, and dayMap memoization policy.
 */
export function useCalendarData(currentMonth: Date) {
  const monthStart = formatAPIDate(startOfMonth(currentMonth))
  const monthEnd = formatAPIDate(endOfMonth(currentMonth))
  return useCalendarRangeQuery(monthStart, monthEnd)
}

/** Calendar entries for an arbitrary contiguous date range, powering the
 *  week and custom-range time-grid views. Disabled in month view. */
export function useCalendarRange(rangeStart: Date, rangeEnd: Date, enabled = true) {
  return useCalendarRangeQuery(
    formatAPIDate(rangeStart),
    formatAPIDate(rangeEnd),
    enabled,
  )
}
