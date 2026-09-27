import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { CalendarSyncEvent } from '@orbit/shared'
import { ApiClientError } from '@orbit/shared/utils/error-utils'
import { toast } from 'sonner'

const useCalendarEventsMock = vi.fn()
const bulkMutateMock = vi.fn()
const dismissMutateMock = vi.fn()
const pageState = vi.hoisted(() => ({ reviewMode: false, suggestions: [] as unknown[] }))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(pageState.reviewMode ? 'mode=review' : ''),
}))

vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: createMockProfile({ hasProAccess: true }) }),
  useHasProAccess: () => true,
}))

vi.mock('@/hooks/use-habits', () => ({
  useBulkCreateHabits: () => ({ mutate: bulkMutateMock }),
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

vi.mock('@/hooks/use-calendar-auto-sync', () => ({
  useCalendarAutoSyncState: () => ({ data: { hasGoogleConnection: false }, isLoading: false }),
  useCalendarSyncSuggestions: () => ({ data: pageState.suggestions, isLoading: false, isError: false }),
  useDismissCalendarSuggestion: () => ({ mutateAsync: dismissMutateMock, isPending: false }),
  useRunCalendarSyncNow: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetCalendarAutoSync: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/use-calendar-events', () => ({
  useCalendarEvents: () => useCalendarEventsMock(),
}))

vi.mock('@/hooks/use-calendars', () => ({
  useCalendars: () => ({ data: [], isLoading: false, isError: false }),
  useSetSelectedCalendars: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))

vi.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({ auth: { signInWithOAuth: vi.fn() } }) }))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import CalendarSyncPage from '@/app/(app)/calendar-sync/page'

function renderPage() {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <CalendarSyncPage />
    </QueryClientProvider>,
  )
}

function buildEvents(count: number): CalendarSyncEvent[] {
  return Array.from({ length: count }, (_value, index) => ({
    id: `ev-${index}`,
    title: `Event ${index}`,
    description: null,
    startDate: '2026-07-01',
    startTime: null,
    endTime: null,
    isRecurring: false,
    recurrenceRule: null,
    reminders: [],
    calendarName: 'Work',
  }))
}

function countEventRows(): number {
  return screen.getAllByText(/^Event \d+$/).length
}

describe('CalendarSyncPage pagination', () => {
  beforeEach(() => {
    useCalendarEventsMock.mockReset()
    bulkMutateMock.mockReset()
    dismissMutateMock.mockReset()
    vi.mocked(toast.error).mockReset()
    pageState.reviewMode = false
    pageState.suggestions = []
  })

  it('renders only the first page of events and reveals more on demand', () => {
    useCalendarEventsMock.mockReturnValue({
      data: { status: 'connected', events: buildEvents(45) },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderPage()

    expect(countEventRows()).toBe(20)
    expect(
      screen.getByText('calendar.showingCount({"shown":20,"total":45})'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByText('calendar.showMore'))

    expect(countEventRows()).toBe(40)
    expect(
      screen.getByText('calendar.showingCount({"shown":40,"total":45})'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByText('calendar.showMore'))

    expect(countEventRows()).toBe(45)
    expect(screen.queryByText('calendar.showMore')).not.toBeInTheDocument()
  })

  it('does not show the pager when events fit on one page', () => {
    useCalendarEventsMock.mockReturnValue({
      data: { status: 'connected', events: buildEvents(8) },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderPage()

    expect(countEventRows()).toBe(8)
    expect(screen.queryByText('calendar.showMore')).not.toBeInTheDocument()
  })

  it('shows the source calendar name on each event row', () => {
    useCalendarEventsMock.mockReturnValue({
      data: { status: 'connected', events: buildEvents(1) },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderPage()

    expect(screen.getByText('Work')).toBeInTheDocument()
  })

  it('shows text-bearing recovery when importing an event is blocked', async () => {
    useCalendarEventsMock.mockReturnValue({
      data: { status: 'connected', events: buildEvents(1) },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    bulkMutateMock.mockImplementation((_request, options) => {
      options.onError(new ApiClientError(403, 'Forbidden'))
    })

    renderPage()
    fireEvent.click(screen.getByText('calendar.importButton({"count":1})'))

    await waitFor(() => expect(screen.getByText('errors.api.edgeBlocked')).toBeInTheDocument())
    expect(bulkMutateMock.mock.calls[0]?.[0].habits[0].title).toBe('Event 0')
  })

  it('shows retry recovery when loading calendars is blocked', () => {
    useCalendarEventsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiClientError(403, 'Forbidden'),
      refetch: vi.fn(),
    })

    renderPage()

    expect(screen.getByText('errors.api.edgeBlockedRetry')).toBeInTheDocument()
  })

  it('shows text-bearing recovery when the import mutation throws', async () => {
    useCalendarEventsMock.mockReturnValue({
      data: { status: 'connected', events: buildEvents(1) },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    bulkMutateMock.mockImplementation(() => {
      throw new ApiClientError(403, 'Forbidden')
    })

    renderPage()
    fireEvent.click(screen.getByText('calendar.importButton({"count":1})'))

    await waitFor(() => expect(screen.getByText('errors.api.edgeBlocked')).toBeInTheDocument())
  })

  it('shows text-bearing recovery when a review suggestion import is blocked', async () => {
    pageState.reviewMode = true
    pageState.suggestions = [{ id: 'suggestion-1', event: buildEvents(1)[0] }]
    bulkMutateMock.mockImplementation((_request, options) => {
      options.onError(new ApiClientError(403, 'Forbidden'))
    })
    useCalendarEventsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderPage()
    fireEvent.click(screen.getByText('calendar.importButton({"count":1})'))

    await waitFor(() => expect(screen.getByText('errors.api.edgeBlocked')).toBeInTheDocument())
    expect(bulkMutateMock.mock.calls[0]?.[0].habits[0].title).toBe('Event 0')
  })

  it('shows retry recovery when dismissing a suggestion is blocked', async () => {
    pageState.reviewMode = true
    pageState.suggestions = [{ id: 'suggestion-1', event: buildEvents(1)[0] }]
    dismissMutateMock.mockRejectedValue(new ApiClientError(403, 'Forbidden'))
    useCalendarEventsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'calendar.autoSync.dismissSuggestion' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('errors.api.edgeBlockedRetry'))
    expect(dismissMutateMock).toHaveBeenCalledWith({ id: 'suggestion-1' })
  })
})
