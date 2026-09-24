'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
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
import { fetchJson } from '@/lib/api-fetch'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import {
  dismissCalendarSuggestion as dismissCalendarSuggestionAction,
  runCalendarSyncNow as runCalendarSyncNowAction,
  setCalendarAutoSync as setCalendarAutoSyncAction,
} from '@/lib/actions/calendar'

interface CalendarQueryOptions {
  enabled?: boolean
}

interface CalendarAutoSyncQueryOptions extends CalendarQueryOptions {
  initialData?: CalendarAutoSyncState
}

export function useCalendarAutoSyncState(options?: CalendarAutoSyncQueryOptions) {
  return useQuery<CalendarAutoSyncState>({
    queryKey: calendarKeys.autoSyncState(),
    queryFn: async () => {
      const raw = await fetchJson<unknown>(API.calendar.autoSyncState)
      return calendarAutoSyncStateSchema.parse(raw)
    },
    enabled: options?.enabled ?? true,
    initialData: options?.initialData,
    initialDataUpdatedAt: options?.initialData ? 0 : undefined,
    staleTime: 30 * 1000,
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

/**
 * Toggles auto-sync on/off.
 * Optimistically flips the `enabled` flag in the cached state; rolls back on error.
 */
export function useSetCalendarAutoSync() {
  const queryClient = useQueryClient()

  const mutation = useMutation<void, Error, { enabled: boolean; accountGeneration: number }, {
    previous: CalendarAutoSyncState | undefined
    accountGeneration: number
  }>({
    mutationFn: async ({ enabled, accountGeneration }) => {
      if (accountGeneration !== getAccountGeneration()) return
      await setCalendarAutoSyncAction(enabled)
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
        queryClient.setQueryData<CalendarAutoSyncState>(
          calendarKeys.autoSyncState(),
          { ...previous, enabled },
        )
      }

      return { previous, accountGeneration }
    },

    onError: (_err, _vars, context) => {
      if (context?.accountGeneration === getAccountGeneration() && context.previous) {
        queryClient.setQueryData(calendarKeys.autoSyncState(), context.previous)
      }
    },

    onSettled: (_result, _error, _vars, context) => {
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

/**
 * Triggers an immediate background sync run.
 * Invalidates calendar + notification caches so the UI picks up any new suggestions.
 */
export function useRunCalendarSyncNow() {
  const queryClient = useQueryClient()

  const mutation = useMutation<CalendarAutoSyncResult, Error, number>({
    mutationFn: async (accountGeneration) => {
      if (accountGeneration !== getAccountGeneration()) throw new Error('Account changed')
      const raw = await runCalendarSyncNowAction()
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

/**
 * Dismisses a single suggestion.
 * Optimistically removes it from the cached list; rolls back on error.
 */
export function useDismissCalendarSuggestion() {
  const queryClient = useQueryClient()

  const mutation = useMutation<void, Error, { id: string; accountGeneration: number }, {
    previous: CalendarSyncSuggestion[] | undefined
    accountGeneration: number
  }>({
    mutationFn: async ({ id, accountGeneration }) => {
      if (accountGeneration !== getAccountGeneration()) return
      await dismissCalendarSuggestionAction(id)
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
          previous.filter((s) => s.id !== id),
        )
      }

      return { previous, accountGeneration }
    },

    onError: (_err, _vars, context) => {
      if (context?.accountGeneration === getAccountGeneration() && context.previous) {
        queryClient.setQueryData(calendarKeys.syncSuggestions(), context.previous)
      }
    },

    onSettled: (_result, _error, _vars, context) => {
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
