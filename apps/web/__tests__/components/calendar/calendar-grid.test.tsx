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
    expect(screen.getAllByRole('button')).toHaveLength(30)
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
    const juneDay = document.querySelector('[data-calendar-date="2025-06-15"]')
    expect(juneDay).toBeDefined()
    fireEvent.click(juneDay!)
    expect(onSelectDay).toHaveBeenCalledWith('2025-06-15')
  })

  it('keeps older days and future range endpoints selectable', () => {
    const onSelectDay = vi.fn()
    render(
      <CalendarGrid
        currentMonth={currentMonth}
        dayMap={emptyMap}
        onSelectDay={onSelectDay}
        rangeStart="2025-06-15"
      />,
    )

    fireEvent.click(document.querySelector('[data-calendar-date="2025-06-01"]')!)
    fireEvent.click(document.querySelector('[data-calendar-date="2025-06-20"]')!)
    expect(onSelectDay).toHaveBeenNthCalledWith(1, '2025-06-01')
    expect(onSelectDay).toHaveBeenNthCalledWith(2, '2025-06-20')
  })

  it('renders same-size placeholders without completion outcomes while loading', () => {
    const { container } = render(
      <CalendarGrid currentMonth={currentMonth} dayMap={emptyMap} onSelectDay={vi.fn()} isLoading />,
    )

    const skeletons = container.querySelectorAll('[data-testid="calendar-day-skeleton"]')
    expect(skeletons.length).toBeGreaterThanOrEqual(35)
    expect(skeletons[0]).toHaveStyle({ width: '44px', height: '44px' })
    expect(container.querySelector('[data-outcome]')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('contains seven 44px targets at a 320px viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 })
    render(<CalendarGrid currentMonth={currentMonth} dayMap={emptyMap} onSelectDay={vi.fn()} />)

    expect(screen.getByTestId('calendar-grid')).toHaveStyle({ paddingLeft: '4px', paddingRight: '4px' })
    expect(screen.getByTestId('calendar-grid-card')).toHaveStyle({ padding: '0px' })
    expect(screen.getByTestId('month-grid-days')).toHaveStyle({ gap: '0px' })
    const firstRowTargets = [...document.querySelectorAll('[data-calendar-date]')].slice(0, 7)
    expect(firstRowTargets).toHaveLength(7)
    expect(firstRowTargets.every((target) => target.parentElement?.style.width === '44px')).toBe(true)
    expect(7 * 44).toBeLessThanOrEqual(window.innerWidth - 8)
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
