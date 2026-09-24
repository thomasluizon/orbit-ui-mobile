import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
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
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import { z } from 'zod'

interface CalendarQueryOptions {
  enabled?: boolean
}

interface CalendarAutoSyncQueryOptions extends CalendarQueryOptions {
  initialData?: CalendarAutoSyncState
}

async function fetchAutoSyncState(): Promise<CalendarAutoSyncState> {
  const raw = await apiClient<unknown>(API.calendar.autoSyncState)
  return calendarAutoSyncStateSchema.parse(raw)
}

export function useCalendarAutoSyncState(options?: CalendarAutoSyncQueryOptions) {
  return useQuery({
    queryKey: calendarKeys.autoSyncState(),
    queryFn: fetchAutoSyncState,
    enabled: options?.enabled ?? true,
    initialData: options?.initialData,
    initialDataUpdatedAt: options?.initialData ? 0 : undefined,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })
}

const suggestionListSchema = z.array(calendarSyncSuggestionSchema)

function useResetMutationForAccount(reset: () => void): number {
  const accountGeneration = useAccountGeneration()
  useEffect(() => { reset() }, [accountGeneration, reset])
  return accountGeneration
}

function visibleMutationForAccount<TData, TError, TVariables, TContext>(
  mutation: UseMutationResult<TData, TError, TVariables, TContext>,
  isCurrentAccount: boolean,
): UseMutationResult<TData, TError, TVariables, TContext> {
  if (isCurrentAccount) return mutation
  return {
    ...mutation,
    context: undefined,
    data: undefined,
    error: null,
    failureCount: 0,
    failureReason: null,
    isError: false,
    isIdle: true,
    isPaused: false,
    isPending: false,
    isSuccess: false,
    status: 'idle',
    submittedAt: 0,
    variables: undefined,
  }
}

async function fetchSyncSuggestions(): Promise<CalendarSyncSuggestion[]> {
  const raw = await apiClient<unknown>(API.calendar.autoSyncSuggestions)
  return suggestionListSchema.parse(raw)
}

export function useCalendarSyncSuggestions(options?: CalendarQueryOptions) {
  return useQuery({
    queryKey: calendarKeys.syncSuggestions(),
    queryFn: fetchSyncSuggestions,
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })
}

interface SetAutoSyncContext {
  previous: CalendarAutoSyncState | undefined
  accountGeneration: number
}

export function useSetCalendarAutoSync() {
  const queryClient = useQueryClient()

  const mutation = useMutation<void, Error, { enabled: boolean; accountGeneration: number }, SetAutoSyncContext>({
    mutationFn: async ({ enabled, accountGeneration }) => {
      if (accountGeneration !== getAccountGeneration()) return
      await apiClient<unknown>(API.calendar.autoSync, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      })
    },

    onMutate: async ({ enabled, accountGeneration }) => {
      await queryClient.cancelQueries({ queryKey: calendarKeys.autoSyncState() })
      if (getAccountGeneration() !== accountGeneration) {
        return { previous: undefined, accountGeneration }
      }
      const previous = queryClient.getQueryData<CalendarAutoSyncState>(
        calendarKeys.autoSyncState(),
      )

      if (previous) {
        queryClient.setQueryData<CalendarAutoSyncState>(calendarKeys.autoSyncState(), {
          ...previous,
          enabled,
        })
      }

      return { previous, accountGeneration }
    },

    onError: (_err, _enabled, context) => {
      if (context?.accountGeneration === getAccountGeneration() && context.previous) {
        queryClient.setQueryData(calendarKeys.autoSyncState(), context.previous)
      }
    },

    onSettled: (_result, _error, _enabled, context) => {
      if (context?.accountGeneration !== getAccountGeneration()) return
      void queryClient.invalidateQueries({ queryKey: calendarKeys.autoSyncState() })
    },
  })

  const accountGeneration = useResetMutationForAccount(mutation.reset)
  const [pendingGeneration, setPendingGeneration] = useState<number | null>(null)

  return {
    ...visibleMutationForAccount(mutation, pendingGeneration === accountGeneration),
    mutate: (variables: { enabled: boolean }, options?: Parameters<typeof mutation.mutate>[1]) => {
      const requestGeneration = getAccountGeneration()
      setPendingGeneration(requestGeneration)
      mutation.mutate({ ...variables, accountGeneration: requestGeneration }, options)
    },
    mutateAsync: (variables: { enabled: boolean }, options?: Parameters<typeof mutation.mutateAsync>[1]) => {
      const requestGeneration = getAccountGeneration()
      setPendingGeneration(requestGeneration)
      return mutation.mutateAsync({ ...variables, accountGeneration: requestGeneration }, options)
    },
  }
}

export function useRunCalendarSyncNow() {
  const queryClient = useQueryClient()

  const mutation = useMutation<CalendarAutoSyncResult, Error, number>({
    mutationFn: async (accountGeneration) => {
      if (accountGeneration !== getAccountGeneration()) throw new Error('Account changed')
      const raw = await apiClient<unknown>(API.calendar.autoSyncRun, {
        method: 'POST',
      })
      return calendarAutoSyncResultSchema.parse(raw)
    },

    onSettled: (_result, _error, accountGeneration) => {
      if (accountGeneration !== getAccountGeneration()) return
      void queryClient.invalidateQueries({ queryKey: calendarKeys.all })
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })

  const accountGeneration = useResetMutationForAccount(mutation.reset)
  const [pendingGeneration, setPendingGeneration] = useState<number | null>(null)

  return {
    ...visibleMutationForAccount(mutation, pendingGeneration === accountGeneration),
    mutate: (_variables?: void, options?: Parameters<typeof mutation.mutate>[1]) => {
      const requestGeneration = getAccountGeneration()
      setPendingGeneration(requestGeneration)
      mutation.mutate(requestGeneration, options)
    },
    mutateAsync: (_variables?: void, options?: Parameters<typeof mutation.mutateAsync>[1]) => {
      const requestGeneration = getAccountGeneration()
      setPendingGeneration(requestGeneration)
      return mutation.mutateAsync(requestGeneration, options)
    },
  }
}

interface DismissSuggestionContext {
  previous: CalendarSyncSuggestion[] | undefined
  accountGeneration: number
}

export function useDismissCalendarSuggestion() {
  const queryClient = useQueryClient()

  const mutation = useMutation<void, Error, { id: string; accountGeneration: number }, DismissSuggestionContext>({
    mutationFn: async ({ id, accountGeneration }) => {
      if (accountGeneration !== getAccountGeneration()) return
      await apiClient<void>(API.calendar.autoSyncDismissSuggestion(id), {
        method: 'PUT',
      })
    },

    onMutate: async ({ id, accountGeneration }) => {
      await queryClient.cancelQueries({ queryKey: calendarKeys.syncSuggestions() })
      if (getAccountGeneration() !== accountGeneration) {
        return { previous: undefined, accountGeneration }
      }
      const previous = queryClient.getQueryData<CalendarSyncSuggestion[]>(
        calendarKeys.syncSuggestions(),
      )

      if (previous) {
        queryClient.setQueryData<CalendarSyncSuggestion[]>(
          calendarKeys.syncSuggestions(),
          previous.filter((suggestion) => suggestion.id !== id),
        )
      }

      return { previous, accountGeneration }
    },

    onError: (_err, _id, context) => {
      if (context?.accountGeneration === getAccountGeneration() && context.previous) {
        queryClient.setQueryData(calendarKeys.syncSuggestions(), context.previous)
      }
    },

    onSettled: (_result, _error, _id, context) => {
      if (context?.accountGeneration !== getAccountGeneration()) return
      void queryClient.invalidateQueries({ queryKey: calendarKeys.syncSuggestions() })
    },
  })

  const accountGeneration = useResetMutationForAccount(mutation.reset)
  const [pendingGeneration, setPendingGeneration] = useState<number | null>(null)

  return {
    ...visibleMutationForAccount(mutation, pendingGeneration === accountGeneration),
    mutate: (variables: { id: string }, options?: Parameters<typeof mutation.mutate>[1]) => {
      const requestGeneration = getAccountGeneration()
      setPendingGeneration(requestGeneration)
      mutation.mutate({ ...variables, accountGeneration: requestGeneration }, options)
    },
    mutateAsync: (variables: { id: string }, options?: Parameters<typeof mutation.mutateAsync>[1]) => {
      const requestGeneration = getAccountGeneration()
      setPendingGeneration(requestGeneration)
      return mutation.mutateAsync({ ...variables, accountGeneration: requestGeneration }, options)
    },
  }
}
