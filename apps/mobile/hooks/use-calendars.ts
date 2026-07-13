import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { calendarKeys } from '@orbit/shared/query'
import {
  userCalendarsSchema,
  type UserCalendar,
} from '@orbit/shared/types/calendar'
import { isCalendarSyncNotConnectedMessage } from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'

interface CalendarsQueryOptions {
  enabled?: boolean
}

async function fetchUserCalendars(): Promise<UserCalendar[]> {
  try {
    const raw = await apiClient<unknown>(API.calendar.calendars)
    return userCalendarsSchema.parse(raw)
  } catch (error) {
    if (
      error instanceof Error &&
      isCalendarSyncNotConnectedMessage(error.message.toLowerCase())
    ) {
      return []
    }
    throw error
  }
}

/**
 * Loads the user's Google calendars, each flagged with whether Orbit currently
 * syncs it. Returns `[]` while disabled or empty so callers can render plainly.
 */
export function useCalendars(options?: CalendarsQueryOptions) {
  return useQuery({
    queryKey: calendarKeys.calendars(),
    queryFn: fetchUserCalendars,
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
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
      const calendarIds: string[] = []
      for (const calendar of current) {
        const nextIsSynced = calendar.id === id ? isSynced : calendar.isSynced
        if (nextIsSynced) calendarIds.push(calendar.id)
      }
      await apiClient<unknown>(API.calendar.selectedCalendars, {
        method: 'PUT',
        body: JSON.stringify({ calendarIds }),
      })
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
      void queryClient.invalidateQueries({ queryKey: calendarKeys.all })
    },
  })
}
