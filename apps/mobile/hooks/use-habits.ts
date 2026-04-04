import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { startOfMonth, endOfMonth, isToday, isAfter } from 'date-fns'
import { habitKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { formatAPIDate, parseAPIDate } from '@orbit/shared/utils'
import type {
  HabitScheduleItem,
  HabitsFilter,
  PaginatedResponse,
  LogHabitResponse,
  CalendarMonthResponse,
} from '@orbit/shared/types/habit'
import type { CalendarDayEntry, HabitDayStatus } from '@orbit/shared/types/calendar'
import { apiClient } from '@/lib/api-client'

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

function buildQueryString(filters: HabitsFilter): string {
  const params = new URLSearchParams()
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
  if (filters.dateTo) params.set('dateTo', filters.dateTo)
  if (filters.includeOverdue) params.set('includeOverdue', 'true')
  if (filters.includeGeneral) params.set('includeGeneral', 'true')
  if (filters.isGeneral) params.set('isGeneral', 'true')
  if (filters.search) params.set('search', filters.search)
  if (filters.isCompleted !== undefined) params.set('isCompleted', String(filters.isCompleted))
  if (filters.page) params.set('page', String(filters.page))
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize))
  return params.toString()
}

async function fetchHabits(
  filters: HabitsFilter,
): Promise<PaginatedResponse<HabitScheduleItem>> {
  const qs = buildQueryString(filters)
  return apiClient<PaginatedResponse<HabitScheduleItem>>(
    `/api/habits${qs ? `?${qs}` : ''}`,
  )
}

async function logHabit(
  habitId: string,
  body?: { note?: string; date?: string },
): Promise<LogHabitResponse> {
  return apiClient<LogHabitResponse>(`/api/habits/${habitId}/log`, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  })
}

async function skipHabit(
  habitId: string,
  body?: { date?: string },
): Promise<void> {
  return apiClient<void>(`/api/habits/${habitId}/skip`, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  })
}

// ---------------------------------------------------------------------------
// useHabits -- paginated habit list
// ---------------------------------------------------------------------------

export function useHabits(filters: HabitsFilter) {
  const query = useQuery({
    queryKey: habitKeys.list(filters as Record<string, unknown>),
    queryFn: () => fetchHabits(filters),
    staleTime: QUERY_STALE_TIMES.habits,
  })

  return {
    habits: query.data?.items ?? [],
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}

// ---------------------------------------------------------------------------
// useLogHabit / useSkipHabit mutations
// ---------------------------------------------------------------------------

export function useLogHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ habitId, note, date }: { habitId: string; note?: string; date?: string }) =>
      logHabit(habitId, { note, date }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
    },
  })
}

export function useSkipHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ habitId, date }: { habitId: string; date?: string }) =>
      skipHabit(habitId, { date }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
    },
  })
}

// ---------------------------------------------------------------------------
// useCalendarData -- calendar month data
// ---------------------------------------------------------------------------

function determineStatus(date: Date, wasLogged: boolean): HabitDayStatus {
  if (wasLogged) return 'completed'
  if (isToday(date) || isAfter(date, new Date())) return 'upcoming'
  return 'missed'
}

export function useCalendarData(currentMonth: Date) {
  const monthStart = formatAPIDate(startOfMonth(currentMonth))
  const monthEnd = formatAPIDate(endOfMonth(currentMonth))

  const query = useQuery({
    queryKey: habitKeys.calendar(monthStart, monthEnd),
    queryFn: () =>
      apiClient<CalendarMonthResponse>(
        `/api/habits/calendar-month?dateFrom=${monthStart}&dateTo=${monthEnd}`,
      ),
    staleTime: QUERY_STALE_TIMES.habits,
  })

  const dayMap = useMemo(() => {
    const map = new Map<string, CalendarDayEntry[]>()
    if (!query.data) return map

    const { habits, logs } = query.data

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

// ---------------------------------------------------------------------------
// useDailySummary -- AI summary for a given date
// ---------------------------------------------------------------------------

export function useDailySummary(date: string, enabled: boolean) {
  return useQuery({
    queryKey: habitKeys.summary(date, date),
    queryFn: () =>
      apiClient<{ summary: string }>(`/api/habits/summary?date=${date}`),
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}
