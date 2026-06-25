'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { calendarKeys } from '@orbit/shared/query'
import { userCalendarsSchema } from '@orbit/shared/types/calendar'
import type { UserCalendar } from '@orbit/shared/types/calendar'
import {
  getUserCalendars as getUserCalendarsAction,
  setSelectedCalendars as setSelectedCalendarsAction,
} from '@/app/actions/calendar'

interface CalendarsQueryOptions {
  enabled?: boolean
}

/**
 * Loads the user's Google calendars, each flagged with whether Orbit currently
 * syncs it. Returns `[]` while disabled or empty so callers can render plainly.
 */
export function useCalendars(options?: CalendarsQueryOptions) {
  return useQuery<UserCalendar[]>({
    queryKey: calendarKeys.calendars(),
    queryFn: async () => {
      const raw = await getUserCalendarsAction()
      return userCalendarsSchema.parse(raw)
    },
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })
}

interface SetSelectedCalendarsContext {
  previous: UserCalendar[] | undefined
}

/**
 * Persists which calendars Orbit syncs. Optimistically flips `isSynced` for the
 * toggled calendar in the cached list and rolls back if the request fails.
 */
export function useSetSelectedCalendars() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { id: string; isSynced: boolean }, SetSelectedCalendarsContext>({
    mutationFn: async ({ id, isSynced }) => {
      const current =
        queryClient.getQueryData<UserCalendar[]>(calendarKeys.calendars()) ?? []
      const selectedIds = current
        .map((calendar) =>
          calendar.id === id ? { ...calendar, isSynced } : calendar,
        )
        .filter((calendar) => calendar.isSynced)
        .map((calendar) => calendar.id)
      await setSelectedCalendarsAction(selectedIds)
    },

    onMutate: async ({ id, isSynced }) => {
      await queryClient.cancelQueries({ queryKey: calendarKeys.calendars() })

      const previous = queryClient.getQueryData<UserCalendar[]>(
        calendarKeys.calendars(),
      )

      if (previous) {
        queryClient.setQueryData<UserCalendar[]>(
          calendarKeys.calendars(),
          previous.map((calendar) =>
            calendar.id === id ? { ...calendar, isSynced } : calendar,
          ),
        )
      }

      return { previous }
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(calendarKeys.calendars(), context.previous)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.calendars() })
    },
  })
}
