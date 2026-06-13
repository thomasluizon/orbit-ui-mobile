import { useQuery } from '@tanstack/react-query'
import { calendarKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { CalendarSyncEvent } from '@orbit/shared'
import { isCalendarSyncNotConnectedMessage } from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'

interface CalendarEventsQueryOptions {
  enabled?: boolean
}

export type CalendarEventsResult =
  | { status: 'connected'; events: CalendarSyncEvent[] }
  | { status: 'not-connected' }

const CALENDAR_EVENTS_KEY = [...calendarKeys.all, 'manual-fetch'] as const

/**
 * Fetches the user's upcoming Google Calendar events for the manual import flow.
 *
 * Mirrors apps/web/hooks/use-calendar-events.ts: a cached query returning a
 * discriminated union so callers branch on `status` to render the not-connected
 * prompt vs the event list. Other network errors surface via the query's
 * `error` field.
 */
export function useCalendarEvents(options?: CalendarEventsQueryOptions) {
  return useQuery<CalendarEventsResult>({
    queryKey: CALENDAR_EVENTS_KEY,
    queryFn: async () => {
      try {
        const data = await apiClient<CalendarSyncEvent[]>(API.calendar.events)
        return { status: 'connected', events: Array.isArray(data) ? data : [] }
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
