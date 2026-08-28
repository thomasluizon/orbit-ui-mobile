import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
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
  const currentMonth = new Date(2025, 5, 1)
  const emptyMap = new Map<string, CalendarDayEntry[]>()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 5, 15))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders weekday headers', () => {
    render(
      <CalendarGrid
        currentMonth={currentMonth}
        dayMap={emptyMap}
        onSelectDay={vi.fn()}
      />,
    )
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
    expect(document.querySelectorAll('[data-outcome]').length).toBeGreaterThanOrEqual(28)
    expect(screen.getAllByRole('button')).toHaveLength(7)
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
    const juneDay = screen.getAllByRole('button').find(
      (button) => button.getAttribute('aria-label')?.includes('June 15'),
    )
    expect(juneDay).toBeDefined()
    fireEvent.click(juneDay!)
    expect(onSelectDay).toHaveBeenCalledWith('2025-06-15')
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

  it('derives the full outcome when all entries are complete', () => {
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
    expect(container.querySelector('[data-outcome="full"]')).toBeInTheDocument()
  })

  it('renders full completion with the neutral foreground token', () => {
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
    const fullCell = container.querySelector('[data-outcome="full"]')
    expect(fullCell?.firstElementChild).toHaveStyle({ background: 'var(--fg-1)' })
  })

  it('disables non-current-month days', () => {
    render(
      <CalendarGrid
        currentMonth={currentMonth}
        dayMap={emptyMap}
        onSelectDay={vi.fn()}
      />,
    )
    const outsideCells = document.querySelectorAll('[data-outside-month]')
    expect(outsideCells.length).toBeGreaterThan(0)
    expect(outsideCells[0]).toHaveAttribute('aria-hidden', 'true')
  })

  it('marks in-range days when range endpoints are provided', () => {
    const { container } = render(
      <CalendarGrid
        currentMonth={currentMonth}
        dayMap={emptyMap}
        onSelectDay={vi.fn()}
        rangeStart="2025-06-16"
        rangeEnd="2025-06-18"
      />,
    )
    const inRange = container.querySelectorAll('[data-in-range="true"]')
    expect(inRange).toHaveLength(3)
  })
})
