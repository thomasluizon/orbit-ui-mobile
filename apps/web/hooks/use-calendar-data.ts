'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  startOfMonth,
  endOfMonth,
} from 'date-fns'
import { habitKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { buildCalendarDayMap, formatAPIDate } from '@orbit/shared/utils'
import type { CalendarMonthResponse } from '@orbit/shared/types/habit'

async function fetchCalendarMonth(
  monthStart: string,
  monthEnd: string,
): Promise<CalendarMonthResponse> {
  const url = `${API.habits.calendarMonth}?dateFrom=${monthStart}&dateTo=${monthEnd}`
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `Failed with status ${res.status}`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// useCalendarData
// ---------------------------------------------------------------------------

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
