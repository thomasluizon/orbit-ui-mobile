import { beforeEach, describe, expect, it, vi } from 'vitest'
import { calendarKeys } from '@orbit/shared/query'
import type { UserCalendar } from '@orbit/shared/types/calendar'

import { useCalendars, useSetSelectedCalendars } from '@/hooks/use-calendars'

const mocks = vi.hoisted(() => {
  const store: { calendars: UserCalendar[] | undefined } = { calendars: undefined }

  const queryClient = {
    cancelQueries: vi.fn(async () => {}),
    invalidateQueries: vi.fn(async () => {}),
    getQueryData: vi.fn(() => store.calendars),
    setQueryData: vi.fn(
      (
        _queryKey: readonly unknown[],
        updater: UserCalendar[] | undefined | ((old: unknown) => unknown),
      ) => {
        store.calendars =
          typeof updater === 'function'
            ? (updater as (old: unknown) => UserCalendar[] | undefined)(store.calendars)
            : updater
      },
    ),
  }

  return {
    store,
    queryClient,
    useQuery: vi.fn(),
    useQueryClient: vi.fn(() => queryClient),
    useMutation: vi.fn((config: unknown) => config),
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
  onError?: (error: Error, variables: TVariables, context: TContext | undefined) => void
}

function buildCalendar(overrides: Partial<UserCalendar> = {}): UserCalendar {
  return {
    id: 'cal-1',
    name: 'Personal',
    accessRole: 'owner',
    primary: true,
    backgroundColor: '#7f46f7',
    isSynced: true,
    ...overrides,
  }
}

describe('mobile calendar picker hooks', () => {
  beforeEach(() => {
    mocks.store.calendars = undefined
    mocks.apiClient.mockReset()
    mocks.useQuery.mockReset()
    mocks.useMutation.mockClear()
    mocks.queryClient.getQueryData.mockClear()
    mocks.queryClient.setQueryData.mockClear()
    mocks.queryClient.invalidateQueries.mockClear()
  })

  it('useCalendars loads and parses calendars from the api', async () => {
    let capturedFn: (() => Promise<UserCalendar[]>) | null = null
    mocks.useQuery.mockImplementation(
      (config: { queryKey: readonly unknown[]; queryFn: () => Promise<UserCalendar[]> }) => {
        capturedFn = config.queryFn
        return { data: undefined }
      },
    )

    const calendars = [buildCalendar(), buildCalendar({ id: 'cal-2', name: 'Work', primary: false })]
    mocks.apiClient.mockResolvedValue(calendars)

    useCalendars()

    expect(mocks.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: calendarKeys.calendars() }),
    )

    const result = await capturedFn!()
    expect(result).toEqual(calendars)
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/calendar/calendars')
  })

  it('useCalendars returns an empty list when Google is not connected', async () => {
    let capturedFn: (() => Promise<UserCalendar[]>) | null = null
    mocks.useQuery.mockImplementation(
      (config: { queryKey: readonly unknown[]; queryFn: () => Promise<UserCalendar[]> }) => {
        capturedFn = config.queryFn
        return { data: undefined }
      },
    )

    mocks.apiClient.mockRejectedValue(
      new Error('Google Calendar connection expired. Please reconnect.'),
    )

    useCalendars()

    await expect(capturedFn!()).resolves.toEqual([])
  })

  it('useSetSelectedCalendars sends the ids of every synced calendar after the toggle', async () => {
    const mutation = useSetSelectedCalendars() as unknown as MutationConfig<
      void,
      { id: string; isSynced: boolean },
      { previous: UserCalendar[] | undefined }
    >

    mocks.store.calendars = [
      buildCalendar({ id: 'cal-1', isSynced: true }),
      buildCalendar({ id: 'cal-2', isSynced: false }),
    ]
    mocks.apiClient.mockResolvedValue(undefined)

    await mutation.mutationFn({ id: 'cal-2', isSynced: true })

    expect(mocks.apiClient).toHaveBeenCalledWith(
      '/api/calendar/selected-calendars',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ calendarIds: ['cal-1', 'cal-2'] }),
      }),
    )
  })

  it('useSetSelectedCalendars optimistically flips isSynced for the toggled calendar', async () => {
    const mutation = useSetSelectedCalendars() as unknown as MutationConfig<
      void,
      { id: string; isSynced: boolean },
      { previous: UserCalendar[] | undefined }
    >

    mocks.store.calendars = [buildCalendar({ id: 'cal-1', isSynced: true })]

    await mutation.onMutate?.({ id: 'cal-1', isSynced: false })

    expect(mocks.store.calendars[0]?.isSynced).toBe(false)
  })

  it('useSetSelectedCalendars rolls back the optimistic update when the api fails', async () => {
    const mutation = useSetSelectedCalendars() as unknown as MutationConfig<
      void,
      { id: string; isSynced: boolean },
      { previous: UserCalendar[] | undefined }
    >

    const initial = [buildCalendar({ id: 'cal-1', isSynced: true })]
    mocks.store.calendars = [...initial]
    mocks.apiClient.mockRejectedValue(new Error('Save failed'))

    const context = await mutation.onMutate?.({ id: 'cal-1', isSynced: false })
    expect(mocks.store.calendars[0]?.isSynced).toBe(false)

    await expect(mutation.mutationFn({ id: 'cal-1', isSynced: false })).rejects.toThrow(
      'Save failed',
    )
    mutation.onError?.(new Error('Save failed'), { id: 'cal-1', isSynced: false }, context)

    expect(mocks.store.calendars[0]?.isSynced).toBe(true)
  })

  it('useSetSelectedCalendars invalidates every calendar query after settling', () => {
    const mutation = useSetSelectedCalendars() as unknown as { onSettled?: () => void }

    mutation.onSettled?.()

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: calendarKeys.all,
    })
  })
})
