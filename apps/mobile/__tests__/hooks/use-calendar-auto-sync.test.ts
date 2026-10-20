import { beforeEach, describe, expect, it, vi } from 'vitest'
import { calendarKeys, notificationKeys } from '@orbit/shared/query'
import type {
  CalendarAutoSyncState,
  CalendarAutoSyncResult,
  CalendarSyncSuggestion,
} from '@orbit/shared/types/calendar'
import { advanceAccountGeneration, getAccountGeneration } from '@/lib/session-epoch'

import {
  useCalendarAutoSyncState,
  useDismissCalendarSuggestion,
  useSetCalendarAutoSync,
} from '@/hooks/use-calendar-auto-sync'

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: () => {},
  useState: (value: unknown) => [value, () => {}],
}))

vi.mock('@/hooks/use-session-reset', () => ({
  useAccountGeneration: () => getAccountGeneration(),
}))


const mocks = vi.hoisted(() => {
  type Store = {
    state: CalendarAutoSyncState | undefined
    suggestions: CalendarSyncSuggestion[] | undefined
  }

  const store: Store = {
    state: undefined,
    suggestions: undefined,
  }

  function readKey(queryKey: readonly unknown[]): 'state' | 'suggestions' | null {
    const serialized = JSON.stringify(queryKey)
    if (serialized === JSON.stringify(calendarKeys.autoSyncState())) return 'state'
    if (serialized === JSON.stringify(calendarKeys.syncSuggestions())) return 'suggestions'
    return null
  }

  const queryClient = {
    cancelQueries: vi.fn(async () => {}),
    invalidateQueries: vi.fn(async () => {}),
    getQueryData: vi.fn((queryKey: readonly unknown[]) => {
      const key = readKey(queryKey)
      if (key === 'state') return store.state
      if (key === 'suggestions') return store.suggestions
      return undefined
    }),
    setQueryData: vi.fn(
      (
        queryKey: readonly unknown[],
        updater:
          | CalendarAutoSyncState
          | CalendarSyncSuggestion[]
          | undefined
          | ((old: unknown) => unknown),
      ) => {
        const key = readKey(queryKey)
        if (!key) return

        const currentValue = key === 'state' ? store.state : store.suggestions
        const nextValue =
          typeof updater === 'function'
            ? (updater)(currentValue)
            : updater

        if (key === 'state') {
          store.state = nextValue as CalendarAutoSyncState | undefined
        } else {
          store.suggestions = nextValue as CalendarSyncSuggestion[] | undefined
        }
      },
    ),
  }

  return {
    store,
    queryClient,
    useQuery: vi.fn(),
    useQueryClient: vi.fn(() => queryClient),
    useMutation: vi.fn((config: unknown) => {
      const mutation = config as MutationConfig<unknown, unknown, unknown>
      return {
        ...mutation,
        mutateAsync: async (variables: unknown) => {
          await mutation.onMutate?.(variables)
          return mutation.mutationFn(variables)
        },
      }
    }),
    apiClient: vi.fn(),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
  useQueryClient: mocks.useQueryClient,
  useMutation: mocks.useMutation,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))


type MutationConfig<TResult, TVariables, TContext> = {
  mutationFn: (variables: TVariables) => Promise<TResult>
  onMutate?: (variables: TVariables) => Promise<TContext> | TContext
  onError?: (
    error: Error,
    variables: TVariables,
    context: TContext | undefined,
  ) => void
  onSettled?: (
    data: TResult | undefined,
    error: Error | null,
    variables: TVariables,
    context: TContext | undefined,
  ) => void
}

function buildState(overrides: Partial<CalendarAutoSyncState> = {}): CalendarAutoSyncState {
  return {
    enabled: false,
    status: 'Idle',
    lastSyncedAt: null,
    hasGoogleConnection: true,
    ...overrides,
  }
}

function buildSuggestion(id: string): CalendarSyncSuggestion {
  return {
    id,
    googleEventId: `gc-${id}`,
    event: {
      id: `event-${id}`,
      title: `Event ${id}`,
      description: null,
      startDate: '2025-01-01',
      startTime: null,
      endTime: null,
      isRecurring: false,
      recurrenceRule: null,
      reminders: [],
    },
    discoveredAtUtc: '2025-01-01T00:00:00Z',
  }
}


describe('mobile calendar auto-sync hooks', () => {
  beforeEach(() => {
    mocks.store.state = buildState({ enabled: false })
    mocks.store.suggestions = [buildSuggestion('s-1'), buildSuggestion('s-2')]
    mocks.apiClient.mockReset()
    mocks.useQuery.mockReset()
    mocks.useQueryClient.mockClear()
    mocks.useMutation.mockClear()
    mocks.queryClient.cancelQueries.mockClear()
    mocks.queryClient.invalidateQueries.mockClear()
    mocks.queryClient.getQueryData.mockClear()
    mocks.queryClient.setQueryData.mockClear()
  })

  it('useCalendarAutoSyncState loads and parses state from the api', async () => {
    let capturedFn: (() => Promise<CalendarAutoSyncState>) | null = null

    mocks.useQuery.mockImplementation(
      (config: { queryKey: readonly unknown[]; queryFn: () => Promise<CalendarAutoSyncState> }) => {
        capturedFn = config.queryFn
        return { data: undefined }
      },
    )

    mocks.apiClient.mockResolvedValue({
      enabled: true,
      status: 'Idle',
      lastSyncedAt: '2025-01-01T00:00:00Z',
      hasGoogleConnection: true,
    })

    useCalendarAutoSyncState()

    expect(mocks.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: calendarKeys.autoSyncState() }),
    )

    const result = await capturedFn!()
    expect(result.enabled).toBe(true)
    expect(result.status).toBe('Idle')
    expect(result.hasGoogleConnection).toBe(true)
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/calendar/auto-sync/state')
  })

  it('useSetCalendarAutoSync applies optimistic update then commits the server state', async () => {
    const mutation = useSetCalendarAutoSync() as unknown as MutationConfig<
      void,
      { enabled: boolean; accountGeneration?: number },
      { previous: CalendarAutoSyncState | undefined }
    >

    mocks.store.state = buildState({ enabled: false })

    mocks.apiClient.mockResolvedValue({ success: true })

    const context = await mutation.onMutate?.({ enabled: true, accountGeneration: getAccountGeneration() })

    expect(mocks.store.state.enabled).toBe(true)

    const result = await mutation.mutationFn({ enabled: true, accountGeneration: getAccountGeneration() })
    mutation.onSettled?.(result, null, { enabled: true }, context)

    expect(mocks.apiClient).toHaveBeenCalledWith(
      '/api/calendar/auto-sync',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ enabled: true }) }),
    )

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: calendarKeys.autoSyncState(),
    })
  })

  it('useSetCalendarAutoSync rolls back the optimistic update when the mutation fails', async () => {
    const mutation = useSetCalendarAutoSync() as unknown as MutationConfig<
      void,
      { enabled: boolean; accountGeneration?: number },
      { previous: CalendarAutoSyncState | undefined }
    >

    const initialState = buildState({ enabled: false })
    mocks.store.state = initialState

    mocks.apiClient.mockRejectedValue(new Error('Toggle failed'))

    const context = await mutation.onMutate?.({ enabled: true, accountGeneration: getAccountGeneration() })

    expect(mocks.store.state.enabled).toBe(true)

    await expect(mutation.mutationFn({ enabled: true, accountGeneration: getAccountGeneration() })).rejects.toThrow('Toggle failed')
    mutation.onError?.(new Error('Toggle failed'), { enabled: true }, context)

    expect(mocks.store.state).toEqual(initialState)
  })

  it('does not restore the previous account state after a late toggle failure', async () => {
    const mutation = useSetCalendarAutoSync() as unknown as MutationConfig<
      void,
      { enabled: boolean; accountGeneration?: number },
      { previous: CalendarAutoSyncState | undefined }
    >
    const context = await mutation.onMutate?.({ enabled: true, accountGeneration: getAccountGeneration() })
    const accountBState = buildState({ hasGoogleConnection: false })
    advanceAccountGeneration()
    mocks.store.state = accountBState

    mutation.onError?.(new Error('Account A failure'), { enabled: true }, context)
    mutation.onSettled?.(undefined, new Error('Account A failure'), { enabled: true }, context)

    expect(mocks.store.state).toEqual(accountBState)
    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
  })

  it('does not send a toggle after account replacement interrupts query cancellation', async () => {
    const mutation = useSetCalendarAutoSync()
    let finishCancellation!: () => void
    mocks.queryClient.cancelQueries.mockReturnValueOnce(new Promise<void>((resolve) => {
      finishCancellation = resolve
    }))
    const pendingMutation = mutation.mutateAsync({ enabled: true })
    advanceAccountGeneration()
    finishCancellation()
    await pendingMutation

    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('useRunCalendarSyncNow invalidates calendar and notification queries on settle', async () => {
    const mutation = (await import('@/hooks/use-calendar-auto-sync')).useRunCalendarSyncNow() as unknown as MutationConfig<
      CalendarAutoSyncResult,
      number,
      undefined
    >

    mocks.apiClient.mockResolvedValue({
      newSuggestions: 2,
      reconciledHabits: 1,
      status: 'Idle',
    })

    const result = await mutation.mutationFn(getAccountGeneration())
    mutation.onSettled?.(result, null, getAccountGeneration(), undefined)

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: calendarKeys.all,
    })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: notificationKeys.all,
    })
  })

  it('useDismissCalendarSuggestion optimistically removes the suggestion from the list', async () => {
    const mutation = useDismissCalendarSuggestion() as unknown as MutationConfig<
      void,
      { id: string; accountGeneration?: number },
      { previous: CalendarSyncSuggestion[] | undefined }
    >

    mocks.apiClient.mockResolvedValue(undefined)

    await mutation.onMutate?.({ id: 's-1', accountGeneration: getAccountGeneration() })

    expect(mocks.store.suggestions?.map((s) => s.id)).toEqual(['s-2'])

    await mutation.mutationFn({ id: 's-1', accountGeneration: getAccountGeneration() })

    expect(mocks.apiClient).toHaveBeenCalledWith(
      '/api/calendar/auto-sync/suggestions/s-1/dismiss',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('useDismissCalendarSuggestion restores the list when the api fails', async () => {
    const mutation = useDismissCalendarSuggestion() as unknown as MutationConfig<
      void,
      { id: string; accountGeneration?: number },
      { previous: CalendarSyncSuggestion[] | undefined }
    >

    const initial = [buildSuggestion('s-1'), buildSuggestion('s-2')]
    mocks.store.suggestions = [...initial]

    mocks.apiClient.mockRejectedValue(new Error('Dismiss failed'))

    const context = await mutation.onMutate?.({ id: 's-1', accountGeneration: getAccountGeneration() })
    expect(mocks.store.suggestions.map((s) => s.id)).toEqual(['s-2'])

    await expect(mutation.mutationFn({ id: 's-1', accountGeneration: getAccountGeneration() })).rejects.toThrow('Dismiss failed')
    mutation.onError?.(new Error('Dismiss failed'), { id: 's-1' }, context)

    expect(mocks.store.suggestions.map((s) => s.id)).toEqual(['s-1', 's-2'])
  })

  it('does not restore the previous account suggestions after a late failure', async () => {
    const mutation = useDismissCalendarSuggestion() as unknown as MutationConfig<
      void,
      { id: string; accountGeneration?: number },
      { previous: CalendarSyncSuggestion[] | undefined }
    >
    const context = await mutation.onMutate?.({ id: 's-1', accountGeneration: getAccountGeneration() })
    const accountBSuggestions = [buildSuggestion('account-b')]
    advanceAccountGeneration()
    mocks.store.suggestions = accountBSuggestions

    mutation.onError?.(new Error('Account A failure'), { id: 's-1' }, context)
    mutation.onSettled?.(undefined, new Error('Account A failure'), { id: 's-1' }, context)

    expect(mocks.store.suggestions).toEqual(accountBSuggestions)
    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
  })

  it('does not dismiss a suggestion after account replacement interrupts query cancellation', async () => {
    const mutation = useDismissCalendarSuggestion()
    let finishCancellation!: () => void
    mocks.queryClient.cancelQueries.mockReturnValueOnce(new Promise<void>((resolve) => {
      finishCancellation = resolve
    }))
    const pendingMutation = mutation.mutateAsync({ id: 's-1' })
    advanceAccountGeneration()
    finishCancellation()
    await pendingMutation

    expect(mocks.apiClient).not.toHaveBeenCalled()
  })
})
