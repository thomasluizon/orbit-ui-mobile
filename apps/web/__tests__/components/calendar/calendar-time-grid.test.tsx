import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { enUS } from 'date-fns/locale'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

import { CalendarTimeGrid, type TimeGridColumn } from '@/components/calendar/calendar-time-grid'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'

function makeEntry(overrides: Partial<CalendarDayEntry> = {}): CalendarDayEntry {
  return {
    habitId: '1',
    title: 'Meditate',
    status: 'upcoming',
    isBadHabit: false,
    dueTime: null,
    isOneTime: false,
    ...overrides,
  }
}

const displayTime = (time: string) => time

function column(year: number, month: number, day: number, isFuture = false): TimeGridColumn {
  const date = new Date(year, month, day)
  return {
    date,
    dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    isToday: false,
    isFuture,
  }
}

function renderGrid(
  columns: TimeGridColumn[],
  dayMap: Map<string, CalendarDayEntry[]>,
  onSelectDay = vi.fn(),
  isLoading = false,
  formatTime = displayTime,
) {
  return render(
    <CalendarTimeGrid
      columns={columns}
      dayMap={dayMap}
      onSelectDay={onSelectDay}
      displayTime={formatTime}
      dateFnsLocale={enUS}
      allDayLabel="No set time"
      nowLabel="Now"
      isLoading={isLoading}
    />,
  )
}

describe('CalendarTimeGrid', () => {
  it('places a timed habit in its hour slot in the correct column', () => {
    const col = column(2025, 5, 16)
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [col.dateStr, [makeEntry({ habitId: 'a', title: 'Standup', dueTime: '08:00' })]],
    ])
    renderGrid([col], dayMap)

    const block = screen.getByTestId('time-grid-event')
    expect(block).toHaveAttribute('data-hour', '8')
    expect(block).toHaveStyle({ top: '384px', minWidth: '44px', height: '44px' })
    expect(block).toHaveTextContent('Standup')
  })

  it('uses the neutral well for a timed habit', () => {
    const col = column(2025, 5, 16)
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [col.dateStr, [makeEntry({ habitId: 'a', dueTime: '08:00' })]],
    ])
    renderGrid([col], dayMap)

    const block = screen.getByTestId('time-grid-event')
    expect(block).toHaveStyle({ boxShadow: 'inset 0 0 0 1px var(--hairline)' })
  })

  it('keeps every concurrent timed-event lane at least 44px wide', () => {
    const col = column(2025, 5, 16)
    const dayMap = new Map<string, CalendarDayEntry[]>([[
      col.dateStr,
      [
        makeEntry({ habitId: 'a', dueTime: '08:00' }),
        makeEntry({ habitId: 'b', dueTime: '08:00' }),
      ],
    ]])
    renderGrid([col], dayMap)

    expect(screen.getByTestId('time-grid-all-day-band')).toHaveStyle({
      gridTemplateColumns: '56px repeat(1, minmax(96px, 1fr))',
    })
    for (const block of screen.getAllByTestId('time-grid-event')) {
      expect(block).toHaveStyle({ minWidth: '44px' })
    }
  })

  it('places an untimed habit in the all-day row, not the time body', () => {
    const col = column(2025, 5, 16)
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [col.dateStr, [makeEntry({ habitId: 'b', title: 'Read', dueTime: null })]],
    ])
    renderGrid([col], dayMap)

    expect(screen.queryByTestId('time-grid-event')).toBeNull()
    const allDayEvent = screen.getByTestId('time-grid-all-day-event')
    expect(allDayEvent).toHaveTextContent('Read')
    expect(allDayEvent.closest('[data-testid="time-grid-all-day-band"]')).not.toBeNull()
    expect(screen.getByTestId('time-grid-any-time-label')).toHaveTextContent('No set time')
  })

  it('dims every future day column without lowering text contrast', () => {
    const col = column(2025, 5, 18, true)
    renderGrid([col], new Map())

    expect(screen.getByTestId('time-grid-col-date')).toHaveStyle({ color: 'var(--fg-3)' })
    expect(screen.getByTestId('time-grid-all-day').style.borderLeft).toBe(
      '1px solid var(--hairline-ghost)',
    )
    expect(screen.getByTestId('time-grid-day-column').style.borderLeft).toBe(
      '1px solid var(--hairline-ghost)',
    )
  })

  it('renders hour marks through both 24-hour and 12-hour formatters', () => {
    const col = column(2025, 5, 16)
    const view24 = renderGrid([col], new Map(), vi.fn(), false, (time) => time)
    expect(screen.getByText('20:00')).toBeInTheDocument()
    view24.unmount()

    renderGrid([col], new Map(), vi.fn(), false, (time) => {
      const hour = Number(time.slice(0, 2))
      return `${hour % 12 || 12}:00 ${hour >= 12 ? 'PM' : 'AM'}`
    })
    expect(screen.getByText('8:00 PM')).toBeInTheDocument()
  })

  it('renders one column per day in the selected range', () => {
    const columns = [16, 17, 18, 19].map((d) => column(2025, 5, d))
    renderGrid(columns, new Map())

    expect(screen.getByTestId('calendar-time-grid')).toHaveAttribute('data-columns', '4')
    expect(screen.getAllByTestId('time-grid-col-header')).toHaveLength(4)
  })

  it('opens the clicked day from a column header', () => {
    const onSelectDay = vi.fn()
    const col = column(2025, 5, 16)
    renderGrid([col], new Map(), onSelectDay)

    fireEvent.click(screen.getByTestId('time-grid-col-header'))
    expect(onSelectDay).toHaveBeenCalledWith('2025-06-16')
  })

  it('opens the tapped day from a timed event block', () => {
    const onSelectDay = vi.fn()
    const col = column(2025, 5, 16)
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [col.dateStr, [makeEntry({ habitId: 'a', title: 'Standup', dueTime: '08:00' })]],
    ])
    renderGrid([col], dayMap, onSelectDay)

    fireEvent.click(screen.getByRole('button', { name: /Standup/ }))
    expect(onSelectDay).toHaveBeenCalledWith('2025-06-16')
  })

  it('caps the all-day stack and collapses the overflow into a +N that opens the day', () => {
    const onSelectDay = vi.fn()
    const col = column(2025, 5, 16)
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry({ habitId: `ad-${i}`, title: `All ${i}`, dueTime: null }),
    )
    const dayMap = new Map<string, CalendarDayEntry[]>([[col.dateStr, entries]])
    renderGrid([col], dayMap, onSelectDay)

    expect(screen.getAllByTestId('time-grid-all-day-event')).toHaveLength(4)
    const more = screen.getByTestId('time-grid-all-day-more')
    expect(more).toHaveTextContent('+4')

    fireEvent.click(more)
    expect(onSelectDay).toHaveBeenCalledWith('2025-06-16')
  })

  it('uses an opaque semantic surface for the pinned any-time pane', () => {
    const col = column(2025, 5, 16)
    renderGrid([col], new Map())

    const band = screen.getByTestId('time-grid-all-day-band')
    expect(band).toHaveStyle({
      backgroundColor: 'var(--bg-elev)',
    })
    expect(band.style.backgroundImage).toBe('')
  })

  it('labels the +N overflow chip with a localized count for screen readers', () => {
    const col = column(2025, 5, 16)
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry({ habitId: `ad-${i}`, title: `All ${i}`, dueTime: null }),
    )
    renderGrid([col], new Map([[col.dateStr, entries]]))

    expect(screen.getByTestId('time-grid-all-day-more')).toHaveAttribute(
      'aria-label',
      'calendar.timeGrid.moreLabel:{"count":4}',
    )
  })

  it('shows the empty message when no visible day has entries', () => {
    renderGrid([column(2025, 5, 16)], new Map())

    expect(screen.getByTestId('time-grid-empty')).toHaveTextContent('calendar.timeGrid.empty')
  })

  it('hides the empty message while the range is loading', () => {
    renderGrid([column(2025, 5, 16)], new Map(), vi.fn(), true)

    expect(screen.queryByTestId('time-grid-empty')).toBeNull()
  })

  it('hides the empty message when any visible day has an entry', () => {
    const col = column(2025, 5, 16)
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [col.dateStr, [makeEntry({ habitId: 'a', dueTime: '08:00' })]],
    ])
    renderGrid([col], dayMap)

    expect(screen.queryByTestId('time-grid-empty')).toBeNull()
  })
})
