import React, { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { CalendarSyncEvent } from '@orbit/shared'
import { ApiClientError } from '@orbit/shared/utils/error-utils'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'
const toastError = vi.hoisted(() => vi.fn())

const useCalendarEventsMock = vi.fn()
const bulkMutateMock = vi.fn()
const dismissMutateMock = vi.fn()
const pageState = vi.hoisted(() => ({ reviewMode: false, suggestions: [] as unknown[], initialEventId: null as string | null }))
const syncNowMock = vi.hoisted(() => vi.fn())
const setAutoSyncMock = vi.hoisted(() => vi.fn())
const clockState = vi.hoisted(() => ({ language: 'en', uses24HourClock: true }))

vi.mock('next-intl', () => ({
  useLocale: () => clockState.language,
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
  useProfile: () => ({ profile: createMockProfile({ hasProAccess: true, uses24HourClock: clockState.uses24HourClock }) }),
  useHasProAccess: () => true,
}))

vi.mock('@/hooks/use-habits', () => ({
  useBulkCreateHabits: () => ({ mutate: bulkMutateMock }),
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

vi.mock('@/hooks/use-calendar-auto-sync', () => ({
  useCalendarAutoSyncState: () => ({ data: { enabled: false, status: 'Idle', hasGoogleConnection: true, lastSyncedAt: '2026-09-12T09:12:00Z' }, isLoading: false }),
  useCalendarSyncSuggestions: () => ({ data: pageState.suggestions, isLoading: false, isError: false }),
  useDismissCalendarSuggestion: () => ({ mutateAsync: dismissMutateMock, isPending: false }),
  useRunCalendarSyncNow: () => ({ mutateAsync: syncNowMock, isPending: false }),
  useSetCalendarAutoSync: () => ({ mutateAsync: setAutoSyncMock, isPending: false }),
}))

vi.mock('@/hooks/use-calendar-events', () => ({
  useCalendarEvents: () => useCalendarEventsMock(),
}))

vi.mock('@/hooks/use-calendars', () => ({
  useCalendars: () => ({ data: [], isLoading: false, isError: false }),
  useSetSelectedCalendars: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))

vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: toastError, showSuccess: vi.fn() }) }))

import { CalendarImportContent, type CalendarImportActionHandle, type CalendarImportActionState } from '@/components/calendar-sync/calendar-import-content'

function CalendarSyncScreen() {
  const [action, setAction] = useState<CalendarImportActionState | null>(null)
  const actionRef = useRef<CalendarImportActionHandle>(null)
  const t = useTranslations()
  return <>
    <div data-testid="sheet-body"><CalendarImportContent reviewMode={pageState.reviewMode} initialEventId={pageState.initialEventId} onClose={() => {}} onGoToHabits={() => {}} actionRef={actionRef} onActionStateChange={setAction} /></div>
    {action ? <div data-testid="sheet-actions"><button disabled={action.disabled} onClick={() => actionRef.current?.importSelected()}>{t('calendar.importButton', { count: action.count })}</button></div> : null}
  </>
}

function renderPage() {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <CalendarSyncScreen />
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
  afterEach(() => { vi.unstubAllGlobals() })

  beforeEach(() => {
    useCalendarEventsMock.mockReset()
    bulkMutateMock.mockReset()
    dismissMutateMock.mockReset()
    vi.mocked(toastError).mockReset()
    pageState.reviewMode = false
    pageState.suggestions = []
    pageState.initialEventId = null
    syncNowMock.mockReset()
    setAutoSyncMock.mockReset()
    clockState.language = 'en'
    clockState.uses24HourClock = true
  })

  it('preselects only the event opened from the day card', () => {
    pageState.initialEventId = 'ev-1'
    useCalendarEventsMock.mockReturnValue({ data: { status: 'connected', events: buildEvents(3) }, isLoading: false, isError: false })
    renderPage()
    expect(screen.getByText('calendar.importButton({"count":1})')).toBeInTheDocument()
    fireEvent.click(screen.getByText('calendar.importButton({"count":1})'))
    expect(bulkMutateMock.mock.calls[0]![0].habits).toHaveLength(1)
    expect(bulkMutateMock.mock.calls[0]![0].habits[0].title).toBe('Event 1')
  })

  it('discloses an imported event title without selecting other events', () => {
    const title = 'Already imported event ' + 'long title '.repeat(30)
    pageState.initialEventId = 'ev-0'
    useCalendarEventsMock.mockReturnValue({ data: { status: 'connected', events: [{ ...buildEvents(2)[0]!, title, isImported: true }, buildEvents(2)[1]!] }, isLoading: false, isError: false })
    renderPage()
    expect(screen.getByText(title.trim())).toBeInTheDocument()
    expect(screen.getByText('calendar.importButton({"count":0})')).toBeDisabled()
    expect(bulkMutateMock).not.toHaveBeenCalled()
  })

  it('owns dated sync controls and keeps sync failures in the sheet', async () => {
    useCalendarEventsMock.mockReturnValue({ data: { status: 'connected', events: buildEvents(1) }, isLoading: false, isError: false })
    syncNowMock.mockRejectedValueOnce(new ApiClientError(403, 'Forbidden'))
    renderPage()
    expect(screen.getByText('calendar.dayDetail.googleConnected')).toBeInTheDocument()
    expect(screen.getByText(/2026, 06:12/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'calendar.dayDetail.autoSync' }))
    await waitFor(() => expect(setAutoSyncMock).toHaveBeenCalledWith({ enabled: true }))
    await waitFor(() => expect(screen.getByText('calendar.autoSync.syncNow')).not.toBeDisabled())
    fireEvent.click(screen.getByText('calendar.autoSync.syncNow'))
    await waitFor(() => expect(screen.getAllByRole('alert')[0]!).toHaveTextContent('errors.api.edgeBlocked'))
    expect(toastError).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('calendar.autoSync.syncNow'))
    await waitFor(() => expect(syncNowMock).toHaveBeenCalledTimes(2))
    expect(screen.getAllByRole('alert').every((node) => node.textContent === '')).toBe(true)
  })

  it('replaces visible event details when accounts share an event id', async () => {
    vi.stubGlobal('fetch', vi.fn())
    holdAccount('calendar-account-a')
    let currentEvents = [{ ...buildEvents(1)[0]!, id: 'shared-event', title: 'Account A event' }]
    useCalendarEventsMock.mockImplementation(() => ({
      data: { status: 'connected', events: currentEvents },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }))

    renderPage()
    expect(screen.getByText('Account A event')).toBeInTheDocument()

    currentEvents = [{ ...currentEvents[0]!, title: 'Account B event' }]
    await replaceAccountWith('calendar-account-b')

    expect(screen.queryByText('Account A event')).not.toBeInTheDocument()
    expect(screen.getByText('Account B event')).toBeInTheDocument()
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
    const events = buildEvents(8)
    events[0] = { ...events[0]!, isImported: true, importedHabitId: '4a16a8be-cd9b-4baf-bcaf-ec0ce6d59dfa' }
    useCalendarEventsMock.mockReturnValue({
      data: { status: 'connected', events },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderPage()

    expect(countEventRows()).toBe(7)
    expect(screen.queryByText('Event 0')).not.toBeInTheDocument()
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

  it.each([
    ['pt-BR', false, '7:30 PM - 8:15 PM'],
    ['en', true, '19:30 - 20:15'],
  ])('shows imported event times with %s and the saved clock', (language, uses24HourClock, expected) => {
    clockState.language = language
    clockState.uses24HourClock = uses24HourClock
    useCalendarEventsMock.mockReturnValue({
      data: { status: 'connected', events: [{ ...buildEvents(1)[0]!, startTime: '19:30', endTime: '20:15' }] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    renderPage()
    expect(screen.getByText(expected)).toBeInTheDocument()
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

    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => node.textContent === 'errors.api.edgeBlockedRetry')).toBe(true))
    expect(toastError).not.toHaveBeenCalled()
    expect(dismissMutateMock).toHaveBeenCalledWith({ id: 'suggestion-1' })
  })
})
