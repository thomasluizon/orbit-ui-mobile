'use client'

import { fetchWithThrottle } from '@/lib/throttle-fetch'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { calendarKeys, shouldRetryQuery } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { calendarEventsResponseSchema, type CalendarSyncEvent } from '@orbit/shared/types'
import type { CalendarAutoSyncState } from '@orbit/shared/types/calendar'
import {
  extractBackendStatus,
  isCalendarSyncNotConnectedMessage,
  reconcileCalendarAutoSyncGrantRevocation,
  resolveCalendarEventsGrantRevocation,
} from '@orbit/shared/utils'

interface CalendarEventsQueryOptions {
  timeZone: string | null
  enabled?: boolean
}

export type CalendarEventsResult =
  | { status: 'connected'; events: CalendarSyncEvent[] }
  | { status: 'not-connected' }

/**
 * Fetches the user's upcoming Google Calendar events for the manual import flow. Returns a
 * discriminated union: callers branch on `status` to render the not-connected prompt vs the
 * event list.
 */
export function useCalendarEvents(options: CalendarEventsQueryOptions) {
  const queryClient = useQueryClient()
  return useQuery<CalendarEventsResult>({
    queryKey: [...calendarKeys.all, 'manual-fetch', options.timeZone],
    queryFn: async () => {
      const res = await fetchWithThrottle(`${API.calendar.events}?includeImported=true`)
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string; errorCode?: string; message?: string }
          | null
        const msg =
          body?.error ?? body?.message ?? `Failed with status ${res.status}`
        const currentAutoSyncState = queryClient.getQueryData<CalendarAutoSyncState>(
          calendarKeys.autoSyncState(),
        )
        const revocationAction = resolveCalendarEventsGrantRevocation(
          body?.errorCode,
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
        if (isCalendarSyncNotConnectedMessage(msg.toLowerCase())) {
          return { status: 'not-connected' }
        }
        throw new Error(msg)
      }
      const events = calendarEventsResponseSchema.parse(await res.json())
      return { status: 'connected', events }
    },
    enabled: options.enabled ?? true,
    retry: (failureCount, error) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return false
      return extractBackendStatus(error) === 429 && shouldRetryQuery(failureCount, error)
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
