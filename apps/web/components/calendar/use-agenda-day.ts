'use client'

import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { habitKeys } from '@orbit/shared/query'
import { formatAPIDate } from '@orbit/shared/utils'
import type {
  CalendarMonthResponse,
  HabitScheduleChild,
  HabitScheduleItem,
} from '@orbit/shared/types/habit'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { useCalendarRange } from '@/hooks/use-calendar-data'

/** A single day's calendar entry enriched with the habit's end time so the
 *  day-planner can size each block from its real start/end window. */
export interface AgendaEntry extends CalendarDayEntry {
  dueEndTime: string | null
}

export interface AgendaDayData {
  entries: AgendaEntry[]
  habitsById: Map<string, HabitScheduleItem>
  isLoading: boolean
  isFetching: boolean
  error: string | null
  refresh: () => void
}

function collectDueEndTimes(
  habits: Array<HabitScheduleItem | HabitScheduleChild>,
  dueEndTimes: Map<string, string | null>,
): void {
  for (const habit of habits) {
    dueEndTimes.set(habit.id, habit.dueEndTime)
    collectDueEndTimes(habit.children, dueEndTimes)
  }
}

/**
 * Loads a single day's habit schedule for the desktop agenda planner. Reuses the
 * shared calendar-range query (one network call, shared cache) for the derived
 * day entries, and reads the raw schedule items from the same cache so a drag can
 * rebuild a complete update request without clobbering the habit's other fields.
 */
export function useAgendaDay(date: Date, enabled: boolean): AgendaDayData {
  const dateStr = formatAPIDate(date)
  const { dayMap, isLoading, isFetching, error, refresh: refreshRange } = useCalendarRange(
    date,
    date,
    enabled,
  )
  const queryClient = useQueryClient()
  const raw = queryClient.getQueryData<CalendarMonthResponse>(
    habitKeys.calendar(dateStr, dateStr),
  )

  const habitsById = useMemo(() => {
    const map = new Map<string, HabitScheduleItem>()
    for (const habit of raw?.habits ?? []) map.set(habit.id, habit)
    return map
  }, [raw])

  const dueEndTimes = useMemo(() => {
    const endTimes = new Map<string, string | null>()
    collectDueEndTimes(raw?.habits ?? [], endTimes)
    return endTimes
  }, [raw])

  const entries = useMemo<AgendaEntry[]>(() => {
    const base = dayMap.get(dateStr) ?? []
    return base.map((entry) => ({
      ...entry,
      dueEndTime: dueEndTimes.get(entry.habitId) ?? null,
    }))
  }, [dayMap, dateStr, dueEndTimes])

  return { entries, habitsById, isLoading, isFetching, error, refresh: () => void refreshRange() }
}
