'use client'

import { useMemo } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import {
  startOfMonth,
  endOfMonth,
} from 'date-fns'
import { habitKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import {
  buildCalendarDayMap,
  formatAPIDate,
  splitCalendarMonthRange,
} from '@orbit/shared/utils'
import type { CalendarMonthResponse } from '@orbit/shared/types/habit'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'

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

function useCalendarRangeQuery(rangeStart: string, rangeEnd: string, enabled = true) {
  const query = useQuery({
    queryKey: habitKeys.calendar(rangeStart, rangeEnd),
    queryFn: () => fetchCalendarMonth(rangeStart, rangeEnd),
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

export function useCalendarData(currentMonth: Date) {
  const monthStart = formatAPIDate(startOfMonth(currentMonth))
  const monthEnd = formatAPIDate(endOfMonth(currentMonth))
  return useCalendarRangeQuery(monthStart, monthEnd)
}

/** Calendar entries for an arbitrary contiguous date range, powering the
 *  web-only week and custom-range time-grid views. Disabled in month view. */
export function useCalendarRange(rangeStart: Date, rangeEnd: Date, enabled = true) {
  return useCalendarRangeQuery(
    formatAPIDate(rangeStart),
    formatAPIDate(rangeEnd),
    enabled,
  )
}

/** Calendar entries for a date range that may span more than the calendar-month
 *  endpoint's 62-day cap (e.g. the insights quarter/year heatmap). Splits the
 *  range into ≤62-day chunks, fetches each as its own cached query, and merges
 *  the per-day results so no single request breaches the API limit. */
export function useCalendarRangeChunked(rangeStart: Date, rangeEnd: Date, enabled = true) {
  const startStr = formatAPIDate(rangeStart)
  const endStr = formatAPIDate(rangeEnd)
  const chunks = useMemo(
    () => splitCalendarMonthRange(startStr, endStr),
    [startStr, endStr],
  )

  return useQueries({
    queries: chunks.map((chunk) => ({
      queryKey: habitKeys.calendar(chunk.from, chunk.to),
      queryFn: () => fetchCalendarMonth(chunk.from, chunk.to),
      staleTime: QUERY_STALE_TIMES.habits,
      enabled,
    })),
    combine: (results) => {
      const dayMap = new Map<string, CalendarDayEntry[]>()
      for (const result of results) {
        if (!result.data) continue
        for (const [day, entries] of buildCalendarDayMap(result.data)) {
          dayMap.set(day, entries)
        }
      }
      return {
        dayMap,
        isLoading: results.some((result) => result.isLoading),
        isFetching: results.some((result) => result.isFetching),
        error: results.find((result) => result.error)?.error?.message ?? null,
        refresh: () => {
          for (const result of results) void result.refetch()
        },
      }
    },
  })
}
