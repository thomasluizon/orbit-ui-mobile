'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { calendarKeys, notificationKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import {
  calendarAutoSyncResultSchema,
  calendarAutoSyncStateSchema,
  calendarSyncSuggestionSchema,
} from '@orbit/shared/types/calendar'
import type {
  CalendarAutoSyncResult,
  CalendarAutoSyncState,
  CalendarSyncSuggestion,
} from '@orbit/shared/types/calendar'
import { z } from 'zod'
import { extractBackendError } from '@orbit/shared/utils'
import { fetchJson } from '@/lib/api-fetch'
import {
  dismissCalendarSuggestion as dismissCalendarSuggestionAction,
  runCalendarSyncNow as runCalendarSyncNowAction,
  setCalendarAutoSync as setCalendarAutoSyncAction,
} from '@/app/actions/calendar'

interface CalendarQueryOptions {
  enabled?: boolean
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/**
 * Sends a write request (PUT/POST) that may return an empty body.
 * Throws an Error with a backend-extracted message on non-2xx responses.
 */
async function sendWriteRequest(url: string, method: 'PUT' | 'POST'): Promise<unknown> {
  const res = await fetch(url, { method })
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null)
    const message = extractBackendError({ data: body }) || `Request failed with status ${res.status}`
    throw new Error(message)
  }
  if (res.status === 204) return null
  const text = await res.text()
  if (!text) return null
  return JSON.parse(text) as unknown
}

async function sendJsonRequest<TBody>(
  url: string,
  method: 'PUT' | 'POST',
  payload: TBody,
): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null)
    const message = extractBackendError({ data: body }) || `Request failed with status ${res.status}`
    throw new Error(message)
  }
  if (res.status === 204) return null
  const text = await res.text()
  if (!text) return null
  return JSON.parse(text) as unknown
}

// ---------------------------------------------------------------------------
// Read hooks
// ---------------------------------------------------------------------------

export function useCalendarAutoSyncState(options?: CalendarQueryOptions) {
  return useQuery<CalendarAutoSyncState>({
    queryKey: calendarKeys.autoSyncState(),
    queryFn: async () => {
      const raw = await fetchJson<unknown>(API.calendar.autoSyncState)
      return calendarAutoSyncStateSchema.parse(raw)
    },
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })
}

const suggestionListSchema = z.array(calendarSyncSuggestionSchema)

export function useCalendarSyncSuggestions(options?: CalendarQueryOptions) {
  return useQuery<CalendarSyncSuggestion[]>({
    queryKey: calendarKeys.syncSuggestions(),
    queryFn: async () => {
      const raw = await fetchJson<unknown>(API.calendar.autoSyncSuggestions)
      return suggestionListSchema.parse(raw)
    },
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Toggles auto-sync on/off.
 * Optimistically flips the `enabled` flag in the cached state; rolls back on error.
 */
export function useSetCalendarAutoSync() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { enabled: boolean }, { previous: CalendarAutoSyncState | undefined }>({
    mutationFn: async ({ enabled }) => {
      await setCalendarAutoSyncAction(enabled)
    },

    onMutate: async ({ enabled }) => {
      await queryClient.cancelQueries({ queryKey: calendarKeys.autoSyncState() })

      const previous = queryClient.getQueryData<CalendarAutoSyncState>(
        calendarKeys.autoSyncState(),
      )

      if (previous) {
        queryClient.setQueryData<CalendarAutoSyncState>(
          calendarKeys.autoSyncState(),
          { ...previous, enabled },
        )
      }

      return { previous }
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(calendarKeys.autoSyncState(), context.previous)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.autoSyncState() })
    },
  })
}

/**
 * Triggers an immediate background sync run.
 * Invalidates calendar + notification caches so the UI picks up any new suggestions.
 */
export function useRunCalendarSyncNow() {
  const queryClient = useQueryClient()

  return useMutation<CalendarAutoSyncResult, Error, void>({
    mutationFn: async () => {
      const raw = await runCalendarSyncNowAction()
      return calendarAutoSyncResultSchema.parse(raw)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.all })
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}

/**
 * Dismisses a single suggestion.
 * Optimistically removes it from the cached list; rolls back on error.
 */
export function useDismissCalendarSuggestion() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { id: string }, { previous: CalendarSyncSuggestion[] | undefined }>({
    mutationFn: async ({ id }) => {
      await dismissCalendarSuggestionAction(id)
    },

    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: calendarKeys.syncSuggestions() })

      const previous = queryClient.getQueryData<CalendarSyncSuggestion[]>(
        calendarKeys.syncSuggestions(),
      )

      if (previous) {
        queryClient.setQueryData<CalendarSyncSuggestion[]>(
          calendarKeys.syncSuggestions(),
          previous.filter((s) => s.id !== id),
        )
      }

      return { previous }
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(calendarKeys.syncSuggestions(), context.previous)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.syncSuggestions() })
    },
  })
}
