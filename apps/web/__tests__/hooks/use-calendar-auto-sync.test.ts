import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useCalendarAutoSyncState,
  useDismissCalendarSuggestion,
  useSetCalendarAutoSync,
} from '@/hooks/use-calendar-auto-sync'
import { calendarKeys } from '@orbit/shared/query'
import type {
  CalendarAutoSyncState,
  CalendarSyncSuggestion,
} from '@orbit/shared/types/calendar'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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
    expect(mockFetch).toHaveBeenCalledWith('/api/calendar/auto-sync/state', undefined)
  })

  it('exposes loading state while the request is pending', () => {
    mockFetch.mockReturnValueOnce(new Promise(() => {})) // never resolves

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

    // Resolves after we have time to observe the optimistic update
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

    // Let the request complete so React Query settles cleanly
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
        // expected
      }
    })

    await waitFor(() => {
      const cached = client.getQueryData<CalendarAutoSyncState>(calendarKeys.autoSyncState())
      expect(cached?.enabled).toBe(false)
    })
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
        // expected
      }
    })

    await waitFor(() => {
      const cached = client.getQueryData<CalendarSyncSuggestion[]>(
        calendarKeys.syncSuggestions(),
      )
      expect(cached?.map((s) => s.id)).toEqual(['sugg-1', 'sugg-2'])
    })
  })
})
