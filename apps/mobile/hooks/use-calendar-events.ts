import { useQuery } from '@tanstack/react-query'
import { calendarKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { calendarEventsResponseSchema, type CalendarSyncEvent } from '@orbit/shared/types'
import { isCalendarSyncNotConnectedMessage } from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'

interface CalendarEventsQueryOptions {
  enabled?: boolean
}

export type CalendarEventsResult =
  | { status: 'connected'; events: CalendarSyncEvent[] }
  | { status: 'not-connected' }

const CALENDAR_EVENTS_KEY = [...calendarKeys.all, 'manual-fetch'] as const

export function useCalendarEvents(options?: CalendarEventsQueryOptions) {
  return useQuery<CalendarEventsResult>({
    queryKey: CALENDAR_EVENTS_KEY,
    queryFn: async () => {
      try {
        const events = calendarEventsResponseSchema.parse(await apiClient<unknown>(API.calendar.events))
        return { status: 'connected', events }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : ''
        if (
          message === 'Unauthorized' ||
          isCalendarSyncNotConnectedMessage(message)
        ) {
          return { status: 'not-connected' }
        }
        throw err
      }
    },
    enabled: options?.enabled ?? true,
    retry: false,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
