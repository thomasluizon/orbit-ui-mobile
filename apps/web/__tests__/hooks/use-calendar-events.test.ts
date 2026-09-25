import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { filterCalendarSyncEventsByDate } from '@orbit/shared/utils'
import { useCalendarEvents } from '@/hooks/use-calendar-events'
import { useCalendarAutoSyncState } from '@/hooks/use-calendar-auto-sync'
import { CalendarSyncBoundary } from '@/components/calendar/calendar-sync-boundary'
import { API } from '@orbit/shared/api'
import { calendarKeys } from '@orbit/shared/query'
import type { CalendarAutoSyncState } from '@orbit/shared/types/calendar'
import { advanceAccountGeneration } from '@/lib/session-epoch'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useCalendarEvents', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns the connected event list on a successful fetch', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
    const { result } = renderHook(() => useCalendarEvents({ timeZone: 'UTC' }), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ status: 'connected', events: [] })
  })

  it('maps a not-connected backend message to the not-connected status', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Calendar not connected' }),
    })
    const { result } = renderHook(() => useCalendarEvents({ timeZone: 'UTC' }), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ status: 'not-connected' })
  })

  it.each(['CALENDAR_NOT_CONNECTED', 'CALENDAR_RECONNECT_REQUIRED'])(
    'does not let a pending connected state restore a revoked grant after %s',
    async (errorCode) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const connectedState: CalendarAutoSyncState = {
      enabled: true,
      status: 'Idle',
      lastSyncedAt: '2026-09-12T09:12:00Z',
      hasGoogleConnection: true,
    }
    let resolveEvents!: (response: unknown) => void
    let resolveAutoSyncState!: () => void
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      if (input === API.calendar.events) {
        return new Promise((resolve) => {
          resolveEvents = resolve
        })
      }
      if (input === API.calendar.autoSyncState) {
        return new Promise((resolve) => {
          resolveAutoSyncState = () => resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(connectedState),
          })
        })
      }
      throw new Error('Unexpected fetch route')
    })

    function CalendarSyncHarness() {
      useCalendarEvents({ timeZone: 'UTC' })
      const { data: autoSyncState } = useCalendarAutoSyncState()
      return React.createElement(CalendarSyncBoundary, {
        autoSyncState,
        displayTime: (time: string) => time,
        onAutoSyncChange: async () => {},
      })
    }

    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)
    render(React.createElement(CalendarSyncHarness), { wrapper: Wrapper })

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))

    resolveEvents({
      ok: false,
      status: 400,
      json: () => Promise.resolve({
        error: 'Google Calendar connection expired. Please reconnect.',
        errorCode,
      }),
    })

    await waitFor(() => {
      expect(queryClient.getQueryData([
        ...calendarKeys.all,
        'manual-fetch',
        'UTC',
      ])).toEqual({ status: 'not-connected' })
    })

    resolveAutoSyncState()
    await waitFor(() => expect(queryClient.isFetching({
      queryKey: calendarKeys.autoSyncState(),
    })).toBe(0))

    expect(queryClient.getQueryData(calendarKeys.autoSyncState()))
      .not.toMatchObject({ hasGoogleConnection: true })
    expect(screen.queryByRole('switch', { name: 'calendar.dayDetail.autoSync' }))
      .not.toBeInTheDocument()
    },
  )

  it('throws other backend errors so the query surfaces them', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Boom' }),
    })
    const { result } = renderHook(() => useCalendarEvents({ timeZone: 'UTC' }), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Boom')
  })

  it('falls back to a status message when the error body cannot be parsed', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.reject(new Error('no json')),
    })
    const { result } = renderHook(() => useCalendarEvents({ timeZone: 'UTC' }), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Failed with status 503')
  })

  it('does not fetch while disabled', () => {
    const { result } = renderHook(() => useCalendarEvents({ enabled: false, timeZone: 'UTC' }), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not serve an old timezone projection after the account timezone changes', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{
          id: 'meeting',
          title: 'Meeting',
          description: null,
          startDate: '2026-09-13',
          startTime: '00:30',
          endTime: '01:00',
          isRecurring: false,
          recurrenceRule: null,
          reminders: [],
        }]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{
          id: 'meeting',
          title: 'Meeting',
          description: null,
          startDate: '2026-09-12',
          startTime: '17:30',
          endTime: '18:00',
          isRecurring: false,
          recurrenceRule: null,
          reminders: [],
        }]),
      })

    const { result, rerender } = renderHook(
      ({ timeZone }) => useCalendarEvents({ timeZone }),
      { initialProps: { timeZone: 'UTC' as string | null }, wrapper: createWrapper() },
    )
    await waitFor(() => expect(result.current.data?.status).toBe('connected'))
    expect(filterCalendarSyncEventsByDate(result.current.data?.status === 'connected' ? result.current.data.events : [], '2026-09-13')).toHaveLength(1)

    rerender({ timeZone: 'America/Los_Angeles' })

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    await waitFor(() => {
      expect(filterCalendarSyncEventsByDate(result.current.data?.status === 'connected' ? result.current.data.events : [], '2026-09-12')).toHaveLength(1)
    })
  })
})

describe('CalendarSyncBoundary account replacement', () => {
  it('lets the next account toggle while the previous toggle is pending', async () => {
    let finishA!: () => void
    const accountARequest = new Promise<void>((resolve) => { finishA = resolve })
    const accountBRequest = new Promise<void>(() => {})
    const onAutoSyncChange = vi.fn()
      .mockReturnValueOnce(accountARequest)
      .mockReturnValueOnce(accountBRequest)
    const autoSyncState: CalendarAutoSyncState = {
      enabled: false,
      status: 'Idle',
      lastSyncedAt: null,
      hasGoogleConnection: true,
    }
    render(React.createElement(CalendarSyncBoundary, {
      autoSyncState,
      displayTime: (value: string) => value,
      onAutoSyncChange,
    }))

    fireEvent.click(screen.getByRole('switch', { name: 'calendar.dayDetail.autoSync' }))
    act(() => advanceAccountGeneration())
    fireEvent.click(screen.getByRole('switch', { name: 'calendar.dayDetail.autoSync' }))
    expect(onAutoSyncChange).toHaveBeenCalledTimes(2)
    await act(async () => { finishA(); await accountARequest })
    fireEvent.click(screen.getByRole('switch', { name: 'calendar.dayDetail.autoSync' }))

    expect(onAutoSyncChange).toHaveBeenCalledTimes(2)
  })
})
