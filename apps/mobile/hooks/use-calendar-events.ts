import { useQuery, useQueryClient } from '@tanstack/react-query'
import { calendarKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { calendarEventsResponseSchema, type CalendarSyncEvent } from '@orbit/shared/types'
import type { CalendarAutoSyncState } from '@orbit/shared/types/calendar'
import {
  extractBackendErrorCode,
  isCalendarSyncNotConnectedMessage,
  reconcileCalendarAutoSyncGrantRevocation,
  resolveCalendarEventsGrantRevocation,
} from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'

interface CalendarEventsQueryOptions {
  timeZone: string | null
  enabled?: boolean
}

export type CalendarEventsResult =
  | { status: 'connected'; events: CalendarSyncEvent[] }
  | { status: 'not-connected' }

/**
 * Fetches the user's upcoming Google Calendar events for the manual import flow. Mirrors
 * apps/web/hooks/use-calendar-events.ts: a cached query returning a discriminated union so
 * callers branch on `status` to render the not-connected prompt vs the event list.
 */
export function useCalendarEvents(options: CalendarEventsQueryOptions) {
  const queryClient = useQueryClient()
  return useQuery<CalendarEventsResult>({
    queryKey: [...calendarKeys.all, 'manual-fetch', options.timeZone],
    queryFn: async () => {
      try {
        const events = calendarEventsResponseSchema.parse(
          await apiClient<unknown>(`${API.calendar.events}?includeImported=true`),
        )
        return { status: 'connected', events }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : ''
        const currentAutoSyncState = queryClient.getQueryData<CalendarAutoSyncState>(
          calendarKeys.autoSyncState(),
        )
        const revocationAction = resolveCalendarEventsGrantRevocation(
          extractBackendErrorCode(err),
          currentAutoSyncState,
        )
        if (revocationAction !== null) {
          await queryClient.cancelQueries({ queryKey: calendarKeys.autoSyncState() })
          if (revocationAction === 'reconcile') {
            queryClient.setQueryData<CalendarAutoSyncState>(
              calendarKeys.autoSyncState(),
              reconcileCalendarAutoSyncGrantRevocation,
            )
          }
          return { status: 'not-connected' }
        }
        if (
          message === 'Unauthorized' ||
          isCalendarSyncNotConnectedMessage(message)
        ) {
          return { status: 'not-connected' }
        }
        throw err
      }
    },
    enabled: options.enabled ?? true,
    retry: false,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
