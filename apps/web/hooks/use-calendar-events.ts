'use client'

import { useQuery } from '@tanstack/react-query'
import { calendarKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { calendarEventsResponseSchema, type CalendarSyncEvent } from '@orbit/shared/types'
import { isCalendarSyncNotConnectedMessage } from '@orbit/shared/utils'
import { sessionAwareFetch } from '@/lib/api-fetch'

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
      const res = await sessionAwareFetch(API.calendar.events)
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
      const events = calendarEventsResponseSchema.parse(await res.json())
      return { status: 'connected', events }
    },
    enabled: options?.enabled ?? true,
    retry: false,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
