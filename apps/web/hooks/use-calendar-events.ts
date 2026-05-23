'use client'

import { useQuery } from '@tanstack/react-query'
import { calendarKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { CalendarSyncEvent } from '@orbit/shared'
import { isCalendarSyncNotConnectedMessage } from '@orbit/shared/utils'

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
 * Returns a discriminated union: callers branch on `status` to render the
 * not-connected prompt vs the event list. Other network errors surface via
 * the query's `error` field.
 */
export function useCalendarEvents(options?: CalendarEventsQueryOptions) {
  return useQuery<CalendarEventsResult>({
    queryKey: CALENDAR_EVENTS_KEY,
    queryFn: async () => {
      const res = await fetch(API.calendar.events)
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null
        const msg =
          body?.error ?? body?.message ?? `Failed with status ${res.status}`
        if (isCalendarSyncNotConnectedMessage(msg.toLowerCase())) {
          return { status: 'not-connected' }
        }
        throw new Error(msg)
      }
      const data = (await res.json()) as CalendarSyncEvent[]
      return { status: 'connected', events: data }
    },
    enabled: options?.enabled ?? true,
    retry: false,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
