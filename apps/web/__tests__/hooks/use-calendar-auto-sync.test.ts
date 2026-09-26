import { useAuthStore } from '@/stores/auth-store'
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useCalendarAutoSyncState,
  useDismissCalendarSuggestion,
  useRunCalendarSyncNow,
  useSetCalendarAutoSync,
} from '@/hooks/use-calendar-auto-sync'
import { calendarKeys } from '@orbit/shared/query'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import type {
  CalendarAutoSyncState,
  CalendarSyncSuggestion,
} from '@orbit/shared/types/calendar'


const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

vi.mock('@/lib/actions/calendar', () => ({
  setCalendarAutoSync: vi.fn(async (enabled: boolean) => {
    const res = await fetch('/api/calendar/auto-sync', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error ?? `Request failed with status ${res.status}`)
    }
    return res.status === 204 ? null : res.json()
  }),
  runCalendarSyncNow: vi.fn(async () => {
    const res = await fetch('/api/calendar/auto-sync/run', { method: 'POST' })
    if (!res.ok) throw new Error(`Request failed with status ${res.status}`)
    return res.json()
  }),
  dismissCalendarSuggestion: vi.fn(async (id: string) => {
    const res = await fetch(`/api/calendar/auto-sync/suggestions/${id}/dismiss`, { method: 'PUT' })
    if (!res.ok) throw new Error(`Request failed with status ${res.status}`)
  }),
  dismissCalendarImport: vi.fn(),
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

function mockJsonResponse<T>(data: T, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  })
}

function mockEmptyResponse(status = 204) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(null),
    text: () => Promise.resolve(''),
  })
}

function mockErrorResponse(status = 500, errorBody: unknown = { error: 'boom' }) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve(errorBody),
    text: () => Promise.resolve(JSON.stringify(errorBody)),
  })
}

const sampleState: CalendarAutoSyncState = {
  enabled: false,
  status: 'Idle',
  lastSyncedAt: null,
  hasGoogleConnection: true,
}

const sampleSuggestions: CalendarSyncSuggestion[] = [
  {
    id: 'sugg-1',
    googleEventId: 'g-1',
    discoveredAtUtc: '2026-04-09T10:00:00Z',
    event: {
      id: 'ev-1',
      title: 'Gym',
      description: null,
      startDate: '2026-04-10',
      startTime: null,
      endTime: null,
      isRecurring: false,
      recurrenceRule: null,
      reminders: [],
    },
  },
  {
    id: 'sugg-2',
    googleEventId: 'g-2',
    discoveredAtUtc: '2026-04-09T10:00:00Z',
    event: {
      id: 'ev-2',
      title: 'Read',
      description: null,
      startDate: '2026-04-10',
      startTime: null,
      endTime: null,
      isRecurring: false,
      recurrenceRule: null,
      reminders: [],
    },
  },
]


beforeEach(() => {
  useAuthStore.getState().setAuth({ userId: 'account-a', name: 'Alex', email: 'alex@example.com' })
})

describe('useCalendarAutoSyncState', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('loads and parses the auto-sync state from the API', async () => {
    mockJsonResponse(sampleState)

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useCalendarAutoSyncState(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(sampleState)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/calendar/auto-sync/state')
    expect(options.headers).toBeInstanceOf(Headers)
    expect((options.headers as Headers).get('X-Orbit-Time-Zone')).toEqual(expect.any(String))
  })

  it('exposes loading state while the request is pending', () => {
    mockFetch.mockReturnValueOnce(new Promise(() => {}))

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useCalendarAutoSyncState(), { wrapper: Wrapper })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })
})

describe('useSetCalendarAutoSync', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('optimistically flips the cached enabled flag on mutate', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    client.setQueryData<CalendarAutoSyncState>(calendarKeys.autoSyncState(), sampleState)

    const { Wrapper } = createWrapper(client)

    let resolveRequest: (value: unknown) => void = () => {}
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve
      }),
    )

    const { result } = renderHook(() => useSetCalendarAutoSync(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ enabled: true })
    })

    await waitFor(() => {
      const cached = client.getQueryData<CalendarAutoSyncState>(calendarKeys.autoSyncState())
      expect(cached?.enabled).toBe(true)
    })

    act(() => {
      resolveRequest({
        ok: true,
        status: 204,
        json: () => Promise.resolve(null),
        text: () => Promise.resolve(''),
      })
    })
  })

  it('rolls back the optimistic update when the request fails', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    client.setQueryData<CalendarAutoSyncState>(calendarKeys.autoSyncState(), sampleState)

    const { Wrapper } = createWrapper(client)

    mockErrorResponse(500)

    const { result } = renderHook(() => useSetCalendarAutoSync(), { wrapper: Wrapper })

    await act(async () => {
      try {
        await result.current.mutateAsync({ enabled: true })
      } catch {
      }
    })

    await waitFor(() => {
      const cached = client.getQueryData<CalendarAutoSyncState>(calendarKeys.autoSyncState())
      expect(cached?.enabled).toBe(false)
    })
  })

  it('does not restore the previous account state after a late toggle failure', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    client.setQueryData(calendarKeys.autoSyncState(), sampleState)
    const { Wrapper } = createWrapper(client)
    let finishRequest!: (response: unknown) => void
    mockFetch.mockReturnValueOnce(new Promise((resolve) => { finishRequest = resolve }))
    const { result } = renderHook(() => useSetCalendarAutoSync(), { wrapper: Wrapper })

    act(() => result.current.mutate({ enabled: true }))
    await waitFor(() => expect(client.getQueryData<CalendarAutoSyncState>(
      calendarKeys.autoSyncState(),
    )?.enabled).toBe(true))
    const accountBState = { ...sampleState, status: 'Idle' as const, hasGoogleConnection: false }
    act(() => {
      client.clear()
      advanceAccountGeneration()
      client.setQueryData(calendarKeys.autoSyncState(), accountBState)
      finishRequest({ ok: false, status: 500, json: () => Promise.resolve({ error: 'failed' }) })
    })
    await waitFor(() => expect(result.current.isError).toBe(false))

    expect(client.getQueryData(calendarKeys.autoSyncState())).toEqual(accountBState)
  })

  it('does not send a toggle after account replacement interrupts query cancellation', async () => {
    mockEmptyResponse()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    let finishCancellation!: () => void
    vi.spyOn(client, 'cancelQueries').mockReturnValueOnce(new Promise<void>((resolve) => {
      finishCancellation = resolve
    }))
    const { Wrapper } = createWrapper(client)
    const { result } = renderHook(() => useSetCalendarAutoSync(), { wrapper: Wrapper })

    let toggle!: Promise<void>
    act(() => { toggle = result.current.mutateAsync({ enabled: true }) })
    await waitFor(() => expect(client.cancelQueries).toHaveBeenCalledOnce())
    act(() => advanceAccountGeneration())
    await act(async () => { finishCancellation(); await toggle })

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it.each([true, false])('lets the next account toggle before the previous %s response settles', async (succeeds) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const { Wrapper } = createWrapper(client)
    let finishFirst!: (response: unknown) => void
    let finishSecond!: (response: unknown) => void
    mockFetch
      .mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve }))
      .mockReturnValueOnce(new Promise((resolve) => { finishSecond = resolve }))
    const { result } = renderHook(() => useSetCalendarAutoSync(), { wrapper: Wrapper })

    let first!: Promise<void>
    act(() => { first = result.current.mutateAsync({ enabled: true }) })
    await waitFor(() => expect(result.current.isPending).toBe(true))
    act(() => advanceAccountGeneration())
    await waitFor(() => expect(result.current.isPending).toBe(false))

    let second!: Promise<void>
    act(() => { second = result.current.mutateAsync({ enabled: false }) })
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    expect(result.current.isPending).toBe(true)

    await act(async () => {
      finishFirst({ ok: succeeds, status: succeeds ? 204 : 500, json: () => Promise.resolve({ error: 'old failure' }) })
      await first.catch(() => undefined)
    })
    expect(result.current.isPending).toBe(true)
    await act(async () => {
      finishSecond({ ok: true, status: 204, json: () => Promise.resolve(null) })
      await second
    })
    await waitFor(() => expect(result.current.isPending).toBe(false))
  })
})

describe('useDismissCalendarSuggestion', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('optimistically removes the suggestion from the cached list', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    client.setQueryData<CalendarSyncSuggestion[]>(
      calendarKeys.syncSuggestions(),
      sampleSuggestions,
    )

    const { Wrapper } = createWrapper(client)

    mockEmptyResponse(204)

    const { result } = renderHook(() => useDismissCalendarSuggestion(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'sugg-1' })
    })

    await waitFor(() => {
      const cached = client.getQueryData<CalendarSyncSuggestion[]>(
        calendarKeys.syncSuggestions(),
      )
      expect(cached?.map((s) => s.id)).toEqual(['sugg-2'])
    })
  })

  it('rolls back the optimistic removal when the request fails', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    client.setQueryData<CalendarSyncSuggestion[]>(
      calendarKeys.syncSuggestions(),
      sampleSuggestions,
    )

    const { Wrapper } = createWrapper(client)

    mockErrorResponse(500)

    const { result } = renderHook(() => useDismissCalendarSuggestion(), { wrapper: Wrapper })

    await act(async () => {
      try {
        await result.current.mutateAsync({ id: 'sugg-1' })
      } catch {
      }
    })

    await waitFor(() => {
      const cached = client.getQueryData<CalendarSyncSuggestion[]>(
        calendarKeys.syncSuggestions(),
      )
      expect(cached?.map((s) => s.id)).toEqual(['sugg-1', 'sugg-2'])
    })
  })

  it('does not restore the previous account suggestions after a late failure', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    client.setQueryData(calendarKeys.syncSuggestions(), sampleSuggestions)
    const { Wrapper } = createWrapper(client)
    let finishRequest!: (response: unknown) => void
    mockFetch.mockReturnValueOnce(new Promise((resolve) => { finishRequest = resolve }))
    const { result } = renderHook(() => useDismissCalendarSuggestion(), { wrapper: Wrapper })

    act(() => result.current.mutate({ id: 'sugg-1' }))
    await waitFor(() => expect(client.getQueryData<CalendarSyncSuggestion[]>(
      calendarKeys.syncSuggestions(),
    )).toHaveLength(1))
    const accountBSuggestions = [sampleSuggestions[1]]
    act(() => {
      client.clear()
      advanceAccountGeneration()
      client.setQueryData(calendarKeys.syncSuggestions(), accountBSuggestions)
      finishRequest({ ok: false, status: 500, json: () => Promise.resolve({ error: 'failed' }) })
    })
    await waitFor(() => expect(result.current.isError).toBe(false))

    expect(client.getQueryData(calendarKeys.syncSuggestions())).toEqual(accountBSuggestions)
  })

  it('does not dismiss a suggestion after account replacement interrupts query cancellation', async () => {
    mockEmptyResponse()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    let finishCancellation!: () => void
    vi.spyOn(client, 'cancelQueries').mockReturnValueOnce(new Promise<void>((resolve) => {
      finishCancellation = resolve
    }))
    const { Wrapper } = createWrapper(client)
    const { result } = renderHook(() => useDismissCalendarSuggestion(), { wrapper: Wrapper })

    let dismiss!: Promise<void>
    act(() => { dismiss = result.current.mutateAsync({ id: 'sugg-1' }) })
    await waitFor(() => expect(client.cancelQueries).toHaveBeenCalledOnce())
    act(() => advanceAccountGeneration())
    await act(async () => { finishCancellation(); await dismiss })

    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('remaining calendar mutations', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('retires a pending manual sync and ignores its late cache invalidation', async () => {
    const { Wrapper, client } = createWrapper()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    let finishFirst!: (response: unknown) => void
    mockFetch.mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve }))
    const { result } = renderHook(() => useRunCalendarSyncNow(), { wrapper: Wrapper })
    let first!: Promise<unknown>
    act(() => { first = result.current.mutateAsync() })
    await waitFor(() => expect(result.current.isPending).toBe(true))
    act(() => advanceAccountGeneration())
    expect(result.current.isPending).toBe(false)
    await act(async () => {
      finishFirst({ ok: true, status: 200, json: () => Promise.resolve({ newSuggestions: 1, reconciledHabits: 0, status: 'Idle' }) })
      await first
    })
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('retires a pending suggestion dismissal before the next account dismisses', async () => {
    const { Wrapper } = createWrapper()
    let finishFirst!: (response: unknown) => void
    let finishSecond!: (response: unknown) => void
    mockFetch
      .mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve }))
      .mockReturnValueOnce(new Promise((resolve) => { finishSecond = resolve }))
    const { result } = renderHook(() => useDismissCalendarSuggestion(), { wrapper: Wrapper })
    let first!: Promise<void>
    act(() => { first = result.current.mutateAsync({ id: 'sugg-1' }) })
    await waitFor(() => expect(result.current.isPending).toBe(true))
    act(() => advanceAccountGeneration())
    expect(result.current.isPending).toBe(false)
    let second!: Promise<void>
    act(() => { second = result.current.mutateAsync({ id: 'sugg-2' }) })
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    await act(async () => {
      finishFirst({ ok: true, status: 204 })
      await first
    })
    expect(result.current.isPending).toBe(true)
    await act(async () => {
      finishSecond({ ok: true, status: 204 })
      await second
    })
    await waitFor(() => expect(result.current.isPending).toBe(false))
  })
})
