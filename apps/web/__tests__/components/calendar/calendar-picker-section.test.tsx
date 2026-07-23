import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { UserCalendar } from '@orbit/shared/types/calendar'

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

import { CalendarPickerSection } from '@/app/(app)/calendar-sync/_components/calendar-picker-section'

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

  it('renders a switch per calendar reflecting its synced state', () => {
    useCalendarsMock.mockReturnValue({
      data: [
        buildCalendar({ id: 'cal-1', name: 'Personal', isSynced: true }),
        buildCalendar({ id: 'cal-2', name: 'Work', primary: false, isSynced: false }),
      ],
      isLoading: false,
      isError: false,
    })

    render(<CalendarPickerSection enabled />)

    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(2)
    expect(switches[0]).toHaveAttribute('aria-checked', 'true')
    expect(switches[1]).toHaveAttribute('aria-checked', 'false')
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

    fireEvent.click(screen.getByRole('switch'))
    expect(mutateAsync).toHaveBeenCalledWith({ id: 'cal-1', isSynced: false })
  })

  it('shows a row-shaped skeleton while the calendars load', () => {
    useCalendarsMock.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    const { container } = render(<CalendarPickerSection enabled />)
    expect(screen.getByText('calendar.calendars.loading')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-skeleton-row]').length).toBeGreaterThan(0)
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
