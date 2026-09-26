'use client'

import { fetchWithThrottle } from '@/lib/throttle-fetch'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { calendarKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { CalendarSyncEvent } from '@orbit/shared'
import type { CalendarAutoSyncState } from '@orbit/shared/types/calendar'
import {
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
      const res = await fetchWithThrottle(API.calendar.events)
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
      const data = (await res.json()) as CalendarSyncEvent[]
      return { status: 'connected', events: data }
    },
    enabled: options.enabled ?? true,
    retry: false,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
