import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { enUS } from 'date-fns/locale'

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

function column(year: number, month: number, day: number): TimeGridColumn {
  const date = new Date(year, month, day)
  return {
    date,
    dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    isToday: false,
  }
}

function renderGrid(columns: TimeGridColumn[], dayMap: Map<string, CalendarDayEntry[]>, onSelectDay = vi.fn()) {
  return render(
    <CalendarTimeGrid
      columns={columns}
      dayMap={dayMap}
      onSelectDay={onSelectDay}
      displayTime={displayTime}
      dateFnsLocale={enUS}
      allDayLabel="All-day"
      nowLabel="Now"
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
    expect(block).toHaveTextContent('Standup')
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
})
