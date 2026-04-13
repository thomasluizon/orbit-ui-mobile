import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { calendarKeys, notificationKeys } from '@orbit/shared/query'
import {
  calendarAutoSyncResultSchema,
  calendarAutoSyncStateSchema,
  calendarSyncSuggestionSchema,
  type CalendarAutoSyncResult,
  type CalendarAutoSyncState,
  type CalendarSyncSuggestion,
} from '@orbit/shared/types/calendar'
import { apiClient } from '@/lib/api-client'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

async function fetchAutoSyncState(): Promise<CalendarAutoSyncState> {
  const raw = await apiClient<unknown>(API.calendar.autoSyncState)
  return calendarAutoSyncStateSchema.parse(raw)
}

export function useCalendarAutoSyncState() {
  return useQuery({
    queryKey: calendarKeys.autoSyncState(),
    queryFn: fetchAutoSyncState,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })
}

const suggestionListSchema = z.array(calendarSyncSuggestionSchema)

async function fetchSyncSuggestions(): Promise<CalendarSyncSuggestion[]> {
  const raw = await apiClient<unknown>(API.calendar.autoSyncSuggestions)
  return suggestionListSchema.parse(raw)
}

export function useCalendarSyncSuggestions() {
  return useQuery({
    queryKey: calendarKeys.syncSuggestions(),
    queryFn: fetchSyncSuggestions,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

interface SetAutoSyncContext {
  previous: CalendarAutoSyncState | undefined
}

export function useSetCalendarAutoSync() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { enabled: boolean }, SetAutoSyncContext>({
    mutationFn: async ({ enabled }) => {
      await apiClient<unknown>(API.calendar.autoSync, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      })
    },

    onMutate: async ({ enabled }) => {
      await queryClient.cancelQueries({ queryKey: calendarKeys.autoSyncState() })
      const previous = queryClient.getQueryData<CalendarAutoSyncState>(
        calendarKeys.autoSyncState(),
      )

      if (previous) {
        queryClient.setQueryData<CalendarAutoSyncState>(calendarKeys.autoSyncState(), {
          ...previous,
          enabled,
        })
      }

      return { previous }
    },

    onError: (_err, _enabled, context) => {
      if (context?.previous) {
        queryClient.setQueryData(calendarKeys.autoSyncState(), context.previous)
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: calendarKeys.autoSyncState() })
    },
  })
}

export function useRunCalendarSyncNow() {
  const queryClient = useQueryClient()

  return useMutation<CalendarAutoSyncResult, Error, void>({
    mutationFn: async () => {
      const raw = await apiClient<unknown>(API.calendar.autoSyncRun, {
        method: 'POST',
      })
      return calendarAutoSyncResultSchema.parse(raw)
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: calendarKeys.all })
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}

interface DismissSuggestionContext {
  previous: CalendarSyncSuggestion[] | undefined
}

export function useDismissCalendarSuggestion() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { id: string }, DismissSuggestionContext>({
    mutationFn: async ({ id }) => {
      await apiClient<void>(API.calendar.autoSyncDismissSuggestion(id), {
        method: 'PUT',
      })
    },

    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: calendarKeys.syncSuggestions() })
      const previous = queryClient.getQueryData<CalendarSyncSuggestion[]>(
        calendarKeys.syncSuggestions(),
      )

      if (previous) {
        queryClient.setQueryData<CalendarSyncSuggestion[]>(
          calendarKeys.syncSuggestions(),
          previous.filter((suggestion) => suggestion.id !== id),
        )
      }

      return { previous }
    },

    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(calendarKeys.syncSuggestions(), context.previous)
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: calendarKeys.syncSuggestions() })
    },
  })
}
