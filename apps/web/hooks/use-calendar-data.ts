'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  startOfMonth,
  endOfMonth,
  isAfter,
  isToday,
} from 'date-fns'
import { habitKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { formatAPIDate, parseAPIDate } from '@orbit/shared/utils'
import type { CalendarDayEntry, HabitDayStatus } from '@orbit/shared/types/calendar'
import type { CalendarMonthResponse } from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function determineStatus(date: Date, wasLogged: boolean): HabitDayStatus {
  if (wasLogged) return 'completed'
  if (isToday(date) || isAfter(date, new Date())) return 'upcoming'
  return 'missed'
}

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
    const map = new Map<string, CalendarDayEntry[]>()
    if (!query.data) return map

    const { habits, logs } = query.data

    // Build log cache: habitId -> Set of date strings
    const logsByHabit = new Map<string, Set<string>>()
    for (const [habitId, habitLogs] of Object.entries(logs)) {
      const dateSet = new Set<string>()
      for (const log of habitLogs) {
        dateSet.add(log.date)
      }
      logsByHabit.set(habitId, dateSet)
    }

    for (const habit of habits) {
      const dates =
        habit.instances?.map((i: { date: string }) => i.date) ??
        habit.scheduledDates ??
        []
      for (const dateStr of dates) {
        const date = parseAPIDate(dateStr)
        const habitLogs = logsByHabit.get(habit.id)
        const wasLogged = habitLogs?.has(dateStr) ?? false
        const status = determineStatus(date, wasLogged)

        const entries = map.get(dateStr) ?? []
        entries.push({
          habitId: habit.id,
          title: habit.title,
          status,
          isBadHabit: habit.isBadHabit,
          dueTime: habit.dueTime ?? null,
          isOneTime: !habit.frequencyUnit,
        })
        map.set(dateStr, entries)
      }
    }

    return map
  }, [query.data])

  return {
    dayMap,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message ?? null,
    refresh: () => query.refetch(),
  }
}
