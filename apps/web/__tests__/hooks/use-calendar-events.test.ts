import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useCalendarEvents } from '@/hooks/use-calendar-events'
import { useCalendarAutoSyncState } from '@/hooks/use-calendar-auto-sync'
import { CalendarSyncBoundary } from '@/components/calendar/calendar-sync-boundary'
import { calendarKeys } from '@orbit/shared/query'
import type { CalendarAutoSyncState } from '@orbit/shared/types/calendar'

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
    const { result } = renderHook(() => useCalendarEvents(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ status: 'connected', events: [] })
  })

  it('maps a not-connected backend message to the not-connected status', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Calendar not connected' }),
    })
    const { result } = renderHook(() => useCalendarEvents(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ status: 'not-connected' })
  })

  it('removes the connected switch when a later events response reports a revoked grant', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const connectedState: CalendarAutoSyncState = {
      enabled: true,
      status: 'Idle',
      lastSyncedAt: '2026-09-12T09:12:00Z',
      hasGoogleConnection: true,
    }
    queryClient.setQueryData(calendarKeys.autoSyncState(), connectedState)

    let resolveEvents!: (response: unknown) => void
    mockFetch.mockReturnValue(new Promise((resolve) => {
      resolveEvents = resolve
    }))

    function CalendarSyncHarness() {
      useCalendarEvents()
      const { data: autoSyncState } = useCalendarAutoSyncState({ enabled: false })
      return React.createElement(CalendarSyncBoundary, {
        hasProAccess: true,
        autoSyncState,
        displayTime: (time: string) => time,
        onAutoSyncChange: async () => {},
        onOpenPro: () => {},
      })
    }

    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)
    render(React.createElement(CalendarSyncHarness), { wrapper: Wrapper })

    expect(screen.getByRole('switch', { name: 'calendar.dayDetail.autoSync' }))
      .toHaveAttribute('aria-checked', 'true')

    resolveEvents({
      ok: false,
      status: 400,
      json: () => Promise.resolve({
        error: 'Google Calendar connection expired. Please reconnect.',
        errorCode: 'CALENDAR_NOT_CONNECTED',
      }),
    })

    await waitFor(() => {
      expect(screen.queryByRole('switch', { name: 'calendar.dayDetail.autoSync' }))
        .not.toBeInTheDocument()
    })
  })

  it('throws other backend errors so the query surfaces them', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Boom' }),
    })
    const { result } = renderHook(() => useCalendarEvents(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Boom')
  })

  it('falls back to a status message when the error body cannot be parsed', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.reject(new Error('no json')),
    })
    const { result } = renderHook(() => useCalendarEvents(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Failed with status 503')
  })

  it('does not fetch while disabled', () => {
    const { result } = renderHook(() => useCalendarEvents({ enabled: false }), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
