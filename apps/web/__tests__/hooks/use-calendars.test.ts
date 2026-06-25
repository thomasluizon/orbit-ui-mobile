import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useCalendars, useSetSelectedCalendars } from '@/hooks/use-calendars'
import { calendarKeys } from '@orbit/shared/query'
import type { UserCalendar } from '@orbit/shared/types/calendar'

const getUserCalendars = vi.fn()
const setSelectedCalendars = vi.fn()

vi.mock('@/app/actions/calendar', () => ({
  getUserCalendars: () => getUserCalendars(),
  setSelectedCalendars: (calendarIds: string[]) => setSelectedCalendars(calendarIds),
}))

function createWrapper(queryClient?: QueryClient) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children)
  }

  return { Wrapper, client }
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

describe('useCalendars', () => {
  beforeEach(() => {
    getUserCalendars.mockReset()
    setSelectedCalendars.mockReset()
  })

  it('loads and parses the calendars from the action', async () => {
    const calendars = [buildCalendar(), buildCalendar({ id: 'cal-2', name: 'Work', primary: false })]
    getUserCalendars.mockResolvedValueOnce(calendars)

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useCalendars(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(calendars)
    expect(getUserCalendars).toHaveBeenCalledTimes(1)
  })

  it('does not fetch while disabled', () => {
    const { Wrapper } = createWrapper()
    renderHook(() => useCalendars({ enabled: false }), { wrapper: Wrapper })

    expect(getUserCalendars).not.toHaveBeenCalled()
  })
})

describe('useSetSelectedCalendars', () => {
  beforeEach(() => {
    getUserCalendars.mockReset()
    setSelectedCalendars.mockReset()
  })

  it('sends the ids of every synced calendar after applying the toggle', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    client.setQueryData<UserCalendar[]>(calendarKeys.calendars(), [
      buildCalendar({ id: 'cal-1', isSynced: true }),
      buildCalendar({ id: 'cal-2', isSynced: false }),
    ])

    setSelectedCalendars.mockResolvedValueOnce(undefined)

    const { Wrapper } = createWrapper(client)
    const { result } = renderHook(() => useSetSelectedCalendars(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'cal-2', isSynced: true })
    })

    expect(setSelectedCalendars).toHaveBeenCalledWith(['cal-1', 'cal-2'])
  })

  it('optimistically flips isSynced for the toggled calendar', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    client.setQueryData<UserCalendar[]>(calendarKeys.calendars(), [
      buildCalendar({ id: 'cal-1', isSynced: true }),
    ])

    let resolveRequest: () => void = () => {}
    setSelectedCalendars.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRequest = resolve
      }),
    )

    const { Wrapper } = createWrapper(client)
    const { result } = renderHook(() => useSetSelectedCalendars(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ id: 'cal-1', isSynced: false })
    })

    await waitFor(() => {
      const cached = client.getQueryData<UserCalendar[]>(calendarKeys.calendars())
      expect(cached?.[0]?.isSynced).toBe(false)
    })

    act(() => {
      resolveRequest()
    })
  })

  it('rolls back the optimistic update when the request fails', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    client.setQueryData<UserCalendar[]>(calendarKeys.calendars(), [
      buildCalendar({ id: 'cal-1', isSynced: true }),
    ])

    setSelectedCalendars.mockRejectedValueOnce(new Error('boom'))

    const { Wrapper } = createWrapper(client)
    const { result } = renderHook(() => useSetSelectedCalendars(), { wrapper: Wrapper })

    await act(async () => {
      try {
        await result.current.mutateAsync({ id: 'cal-1', isSynced: false })
      } catch {
        void 0
      }
    })

    await waitFor(() => {
      const cached = client.getQueryData<UserCalendar[]>(calendarKeys.calendars())
      expect(cached?.[0]?.isSynced).toBe(true)
    })
  })

  it('invalidates every calendar query after a successful toggle', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    client.setQueryData<UserCalendar[]>(calendarKeys.calendars(), [
      buildCalendar({ id: 'cal-1', isSynced: true }),
    ])
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    setSelectedCalendars.mockResolvedValueOnce(undefined)

    const { Wrapper } = createWrapper(client)
    const { result } = renderHook(() => useSetSelectedCalendars(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'cal-1', isSynced: false })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: calendarKeys.all })
  })
})
