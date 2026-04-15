import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('@orbit/shared/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/utils')>()
  return {
    ...actual,
    formatAPIDate: (d: Date) => d.toISOString().split('T')[0],
  }
})

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { weekStartDay: 1 } }),
}))

import { CalendarGrid } from '@/components/calendar/calendar-grid'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'

describe('CalendarGrid', () => {
  const currentMonth = new Date(2025, 5, 1) // June 2025
  const emptyMap = new Map<string, CalendarDayEntry[]>()

  it('renders weekday headers', () => {
    render(
      <CalendarGrid
        currentMonth={currentMonth}
        dayMap={emptyMap}
        onSelectDay={vi.fn()}
      />,
    )
    // Monday first (weekStartDay=1)
    expect(screen.getByText('dates.daysShort.monday')).toBeInTheDocument()
    expect(screen.getByText('dates.daysShort.sunday')).toBeInTheDocument()
  })

  it('renders day cells', () => {
    render(
      <CalendarGrid
        currentMonth={currentMonth}
        dayMap={emptyMap}
        onSelectDay={vi.fn()}
      />,
    )
    // At least 28 day buttons (June has 30 days + padding)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(28)
  })

  it('calls onSelectDay when a day is clicked', () => {
    const onSelectDay = vi.fn()
    render(
      <CalendarGrid
        currentMonth={currentMonth}
        dayMap={emptyMap}
        onSelectDay={onSelectDay}
      />,
    )
    // Click a cell with aria-label containing "June"
    const juneDay = screen.getAllByRole('button').find(
      (btn) => btn.getAttribute('aria-label')?.includes('June'),
    )
    if (juneDay) fireEvent.click(juneDay)
    expect(onSelectDay).toHaveBeenCalled()
  })

  it('marks today with aria-current="date"', () => {
    const today = new Date()
    const todayMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    render(
      <CalendarGrid
        currentMonth={todayMonth}
        dayMap={emptyMap}
        onSelectDay={vi.fn()}
      />,
    )
    const todayCell = document.querySelector('[aria-current="date"]')
    expect(todayCell).toBeInTheDocument()
  })

  it('renders dots for days with entries', () => {
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [
        '2025-06-15',
        [
          {
            habitId: '1',
            title: 'Test',
            status: 'completed',
            isBadHabit: false,
            dueTime: null,
            isOneTime: false,
          },
        ],
      ],
    ])
    const { container } = render(
      <CalendarGrid
        currentMonth={currentMonth}
        dayMap={dayMap}
        onSelectDay={vi.fn()}
      />,
    )
    const dots = container.querySelectorAll('.rounded-full.size-1')
    expect(dots.length).toBeGreaterThan(0)
  })

  it('applies green background for completed days', () => {
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [
        '2025-06-15',
        [
          {
            habitId: '1',
            title: 'Test',
            status: 'completed',
            isBadHabit: false,
            dueTime: null,
            isOneTime: false,
          },
        ],
      ],
    ])
    const { container } = render(
      <CalendarGrid
        currentMonth={currentMonth}
        dayMap={dayMap}
        onSelectDay={vi.fn()}
      />,
    )
    const greenCells = container.querySelectorAll('.bg-green-500')
    expect(greenCells.length).toBeGreaterThan(0)
  })

  it('disables non-current-month days', () => {
    render(
      <CalendarGrid
        currentMonth={currentMonth}
        dayMap={emptyMap}
        onSelectDay={vi.fn()}
      />,
    )
    const disabledCells = document.querySelectorAll('[aria-disabled="true"]')
    expect(disabledCells.length).toBeGreaterThan(0)
  })
})
