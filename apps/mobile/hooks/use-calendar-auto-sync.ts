import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { calendarKeys } from '@orbit/shared/query'
import {
  calendarAutoSyncResultSchema,
  calendarAutoSyncStateSchema,
  calendarSyncSuggestionSchema,
  type CalendarAutoSyncResult,
  type CalendarAutoSyncState,
  type CalendarSyncSuggestion,
} from '@orbit/shared/types/calendar'
import { apiClient } from '@/lib/api-client'

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
  })
}

async function fetchSyncSuggestions(): Promise<CalendarSyncSuggestion[]> {
  const raw = await apiClient<unknown>(API.calendar.autoSyncSuggestions)
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => {
      const parsed = calendarSyncSuggestionSchema.safeParse(entry)
      return parsed.success ? parsed.data : null
    })
    .filter((value): value is CalendarSyncSuggestion => value !== null)
}

export function useCalendarSyncSuggestions() {
  return useQuery({
    queryKey: calendarKeys.syncSuggestions(),
    queryFn: fetchSyncSuggestions,
    staleTime: 30_000,
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

  return useMutation<CalendarAutoSyncState, Error, boolean, SetAutoSyncContext>({
    mutationFn: async (enabled) => {
      const raw = await apiClient<unknown>(API.calendar.autoSync, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      })
      return calendarAutoSyncStateSchema.parse(raw)
    },

    onMutate: async (enabled) => {
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

    onSettled: (data) => {
      if (data) {
        queryClient.setQueryData(calendarKeys.autoSyncState(), data)
      } else {
        void queryClient.invalidateQueries({ queryKey: calendarKeys.autoSyncState() })
      }
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

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: calendarKeys.autoSyncState() })
      void queryClient.invalidateQueries({ queryKey: calendarKeys.syncSuggestions() })
    },
  })
}

interface DismissSuggestionContext {
  previous: CalendarSyncSuggestion[] | undefined
}

export function useDismissCalendarSuggestion() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string, DismissSuggestionContext>({
    mutationFn: async (suggestionId) => {
      await apiClient<void>(API.calendar.autoSyncDismissSuggestion(suggestionId), {
        method: 'PUT',
      })
    },

    onMutate: async (suggestionId) => {
      await queryClient.cancelQueries({ queryKey: calendarKeys.syncSuggestions() })
      const previous = queryClient.getQueryData<CalendarSyncSuggestion[]>(
        calendarKeys.syncSuggestions(),
      )

      if (previous) {
        queryClient.setQueryData<CalendarSyncSuggestion[]>(
          calendarKeys.syncSuggestions(),
          previous.filter((suggestion) => suggestion.id !== suggestionId),
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
