import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { UserCalendar } from '@orbit/shared/types/calendar'
import { ApiClientError } from '@orbit/shared/utils/error-utils'
import { toast } from 'sonner'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

const mutateAsync = vi.fn(() => Promise.resolve())
const useCalendarsMock = vi.fn()

vi.mock('@/hooks/use-calendars', () => ({
  useCalendars: () => useCalendarsMock(),
  useSetSelectedCalendars: () => ({ mutateAsync }),
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { CalendarPickerSection } from '@/components/calendar-sync/calendar-picker-section'

function buildCalendar(overrides: Partial<UserCalendar> = {}): UserCalendar {
  return {
    id: 'cal-1',
    name: 'Personal',
    accessRole: 'owner',
    primary: true,
    backgroundColor: '#C4530F',
    isSynced: true,
    ...overrides,
  }
}

describe('CalendarPickerSection', () => {
  beforeEach(() => {
    mutateAsync.mockClear()
    useCalendarsMock.mockReset()
  })

  it('renders nothing when disabled', () => {
    useCalendarsMock.mockReturnValue({ data: undefined, isLoading: false, isError: false })
    const { container } = render(<CalendarPickerSection enabled={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a check row per calendar reflecting its synced state', () => {
    useCalendarsMock.mockReturnValue({
      data: [
        buildCalendar({ id: 'cal-1', name: 'Personal', isSynced: true }),
        buildCalendar({ id: 'cal-2', name: 'Work', primary: false, isSynced: false }),
      ],
      isLoading: false,
      isError: false,
    })

    render(<CalendarPickerSection enabled />)

    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)
    expect(checkboxes[0]).toHaveAttribute('aria-checked', 'true')
    expect(checkboxes[1]).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('Personal')).toBeInTheDocument()
    expect(screen.getByText('Work')).toBeInTheDocument()
  })

  it('persists the flipped synced value on toggle', () => {
    useCalendarsMock.mockReturnValue({
      data: [buildCalendar({ id: 'cal-1', isSynced: true })],
      isLoading: false,
      isError: false,
    })

    render(<CalendarPickerSection enabled />)

    fireEvent.click(screen.getByRole('checkbox'))
    expect(mutateAsync).toHaveBeenCalledWith({ id: 'cal-1', isSynced: false })
  })

  it('shows textless recovery when saving a calendar is blocked', async () => {
    useCalendarsMock.mockReturnValue({
      data: [buildCalendar()],
      isLoading: false,
      isError: false,
    })
    mutateAsync.mockRejectedValueOnce(new ApiClientError(403, 'Forbidden'))
    render(<CalendarPickerSection enabled />)

    fireEvent.click(screen.getByRole('checkbox'))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('errors.api.edgeBlockedRetry'))
  })

  it('shows the loading state', () => {
    useCalendarsMock.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    render(<CalendarPickerSection enabled />)
    expect(screen.getByRole('progressbar', { name: 'calendar.calendars.loading' })).toBeInTheDocument()
  })

  it('shows the error state', () => {
    useCalendarsMock.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<CalendarPickerSection enabled />)
    expect(screen.getByText('calendar.calendars.error')).toBeInTheDocument()
  })

  it('shows the empty state', () => {
    useCalendarsMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<CalendarPickerSection enabled />)
    expect(screen.getByText('calendar.calendars.empty')).toBeInTheDocument()
  })
})
