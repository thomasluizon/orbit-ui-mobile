import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
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
  timeZone: string | null = 'UTC',
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
      timeZone={timeZone}
    />,
  )
}

describe('CalendarTimeGrid', () => {
  it('preserves both grid scroll axes after closing a timed disclosure', async () => {
    const onSelectDay = vi.fn()
    const col = column(2025, 5, 16)
    renderGrid([col], new Map([[col.dateStr, [makeEntry({ dueTime: '08:00' })]]]), onSelectDay)
    const scroller = screen.getByTestId('calendar-time-grid').firstElementChild!
    scroller.scrollTop = 420
    scroller.scrollLeft = 84
    const target = screen.getByTestId('time-grid-event')
    target.focus()
    fireEvent.click(target)
    expect(screen.getByRole('dialog')).toHaveTextContent('Meditate')
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(scroller.scrollTop).toBe(420)
    expect(scroller.scrollLeft).toBe(84)
    expect(onSelectDay).not.toHaveBeenCalled()
    await waitFor(() => expect(target).toHaveFocus())
  })

  it('uses a shape as well as color for an indulged bad habit', () => {
    const col = column(2025, 5, 16)
    renderGrid([col], new Map([[col.dateStr, [makeEntry({ dueTime: '08:00', status: 'completed', isBadHabit: true })]]]))
    expect(screen.getByTestId('time-grid-event').querySelector('[data-status="bad"]')).not.toBeNull()
    expect(screen.getByTestId('time-grid-event').querySelector('svg')).not.toBeNull()
  })

  it('paginates and searches untimed entries with an announced count and a recovery action', () => {
    const col = column(2025, 5, 16)
    const entries = Array.from({ length: 25 }, (_, index) => makeEntry({ habitId: String(index), title: `Untimed ${index}` }))
    renderGrid([col], new Map([[col.dateStr, entries]]))
    fireEvent.click(screen.getByTestId('time-grid-all-day-summary'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Untimed 19')).toBeInTheDocument()
    expect(within(dialog).queryByText('Untimed 20')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'common.next' }))
    expect(within(dialog).getByText('Untimed 24')).toBeInTheDocument()
    expect(within(dialog).getByText(/calendar.showingCount/)).toHaveTextContent('\"shown\":5,\"total\":25')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'missing' } })
    expect(within(dialog).getByText(/calendar.showingCount/)).toHaveAttribute('role', 'status')
    expect(within(dialog).getByText(/calendar.showingCount/)).toHaveTextContent('"total":0')
    expect(dialog).toHaveTextContent('calendar.entrySearchEmpty:{"query":"missing"}')
    fireEvent.click(within(dialog).getByRole('button', { name: 'calendar.dayDetail.clearEventSearch' }))
    expect(within(dialog).getByText('Untimed 0')).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox')).toHaveValue('')
  })

  it('places a timed habit in its hour slot in the correct column', () => {
    const col = column(2025, 5, 16)
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [col.dateStr, [makeEntry({ habitId: 'a', title: 'Standup', dueTime: '08:00' })]],
    ])
    renderGrid([col], dayMap)

    const block = screen.getByTestId('time-grid-event')
    expect(block).toHaveAttribute('data-hour', '8')
    expect(block).toHaveStyle({ top: '384px', minWidth: '48px', minHeight: '48px' })
    expect(block).toHaveAccessibleName(/Standup/)
    expect(block).not.toHaveTextContent('Standup')
    expect(block.querySelector('[data-status]')).not.toBeNull()
    fireEvent.click(block)
    expect(screen.getByRole('dialog')).toHaveTextContent('Standup')
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

  it('keeps every concurrent timed-event lane at least 48px wide', () => {
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
      gridTemplateColumns: 'max(96px, calc(5ch + 16px)) repeat(1, minmax(max(104px, 3.25rem), 1fr))',
    })
    for (const block of screen.getAllByTestId('time-grid-event')) {
      expect(block).toHaveStyle({ minWidth: '48px' })
    }
  })

  it('places an untimed habit in the all-day row, not the time body', () => {
    const col = column(2025, 5, 16)
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [col.dateStr, [makeEntry({ habitId: 'b', title: 'Read', dueTime: null })]],
    ])
    renderGrid([col], dayMap)

    expect(screen.queryByTestId('time-grid-event')).toBeNull()
    expect(screen.getByTestId('time-grid-all-day-summary')).toHaveTextContent('1')
    expect(screen.getByTestId('time-grid-all-day-summary').closest('[data-testid="time-grid-all-day-band"]')).not.toBeNull()
    expect(screen.getByTestId('time-grid-any-time-label')).toHaveTextContent('No set time')
  })

  it('dims every future day column without lowering text contrast', () => {
    const col = column(2025, 5, 18, true)
    renderGrid([col], new Map())

    expect(screen.getByTestId('time-grid-col-date')).toHaveStyle({ color: 'var(--fg-2)' })
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

  it('positions the now line by the account timezone', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-11T10:30:00.000Z'))
    const today = { ...column(2026, 8, 12), isToday: true }
    try {
      renderGrid([today], new Map(), vi.fn(), false, displayTime, 'Pacific/Kiritimati')

      expect(screen.getByRole('img', { name: 'Now' })).toHaveStyle({ top: '24px' })
    } finally {
      vi.useRealTimers()
    }
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

  it('discloses the full timed name without changing the selected day', () => {
    const onSelectDay = vi.fn()
    const col = column(2025, 5, 16)
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [col.dateStr, [makeEntry({ habitId: 'a', title: 'Standup', dueTime: '08:00' })]],
    ])
    renderGrid([col], dayMap, onSelectDay)

    fireEvent.click(screen.getByRole('button', { name: /Standup/ }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Standup')
    expect(onSelectDay).not.toHaveBeenCalled()
  })

  it('collapses every untimed item into one count row and discloses the full list', () => {
    const onSelectDay = vi.fn()
    const col = column(2025, 5, 16)
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry({ habitId: `ad-${i}`, title: `All ${i}`, dueTime: null }),
    )
    const dayMap = new Map<string, CalendarDayEntry[]>([[col.dateStr, entries]])
    renderGrid([col], dayMap, onSelectDay)

    expect(screen.queryByTestId('time-grid-all-day-event')).toBeNull()
    const summary = screen.getByTestId('time-grid-all-day-summary')
    expect(summary).toHaveTextContent('8')
    expect(summary).toHaveStyle({ minHeight: '48px', minWidth: '48px' })
    fireEvent.click(summary)
    const dialog = screen.getByRole('dialog')
    for (const entry of entries) expect(dialog).toHaveTextContent(entry.title)
    expect(onSelectDay).not.toHaveBeenCalled()

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

  it('labels the untimed row with the full localized count', () => {
    const col = column(2025, 5, 16)
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry({ habitId: `ad-${i}`, title: `All ${i}`, dueTime: null }),
    )
    renderGrid([col], new Map([[col.dateStr, entries]]))

    expect(screen.getByTestId('time-grid-all-day-summary')).toHaveAttribute(
      'aria-label',
      'calendar.timeGrid.untimedCount:{"count":8}',
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
