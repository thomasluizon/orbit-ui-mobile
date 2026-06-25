import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { CalendarSyncEvent } from '@orbit/shared'

const useCalendarEventsMock = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: createMockProfile({ hasProAccess: true }) }),
  useHasProAccess: () => true,
}))

vi.mock('@/hooks/use-habits', () => ({
  useBulkCreateHabits: () => ({ mutate: vi.fn() }),
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

vi.mock('@/hooks/use-calendar-auto-sync', () => ({
  useCalendarAutoSyncState: () => ({ data: { hasGoogleConnection: false }, isLoading: false }),
  useCalendarSyncSuggestions: () => ({ data: [], isLoading: false, isError: false }),
  useDismissCalendarSuggestion: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
  })

  it('renders only the first page of events and reveals more on demand', () => {
    useCalendarEventsMock.mockReturnValue({
      data: { status: 'connected', events: buildEvents(45) },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<CalendarSyncPage />)

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

    render(<CalendarSyncPage />)

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

    render(<CalendarSyncPage />)

    expect(screen.getByText('Work')).toBeInTheDocument()
  })
})
