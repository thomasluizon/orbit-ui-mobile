import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react'
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

  it('places a timed habit in its hour slot in the correct column', () => {
    const col = column(2025, 5, 16)
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [col.dateStr, [makeEntry({ habitId: 'a', title: 'Standup', dueTime: '08:00' })]],
    ])
    renderGrid([col], dayMap)

    const block = screen.getByTestId('time-grid-event')
    expect(block).toHaveAttribute('data-hour', '8')
    expect(block).toHaveStyle({ top: '24rem', minWidth: '48px', minHeight: '48px' })
    expect(block).toHaveAccessibleName(/Standup/)
    expect(block).toHaveTextContent('Standup')
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
      gridTemplateColumns: 'max(96px, calc(5ch + 16px)) repeat(1, minmax(12rem, 1fr))',
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
    expect(screen.getByTestId('time-grid-all-day-event')).toHaveTextContent('Read')
    expect(screen.getByTestId('time-grid-all-day-event').closest('[data-testid="time-grid-all-day-band"]')).not.toBeNull()
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

      expect(screen.getByRole('img', { name: 'Now' })).toHaveStyle({ top: '1.5rem' })
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

  it('shows the first untimed name and opens the day for the remainder', () => {
    const onSelectDay = vi.fn()
    const col = column(2025, 5, 16)
    const entries = Array.from({ length: 3 }, (_, index) => makeEntry({ habitId: String(index), title: `All ${index}` }))
    renderGrid([col], new Map([[col.dateStr, entries]]), onSelectDay)
    expect(screen.getByTestId('time-grid-all-day-event')).toHaveTextContent('All 0')
    const more = screen.getByTestId('time-grid-all-day-more')
    expect(more).toHaveTextContent('calendar.timeGrid.moreCount:{"count":2}')
    expect(more).toHaveStyle({ minWidth: '48px' })
    fireEvent.click(more)
    expect(onSelectDay).toHaveBeenCalledWith(col.dateStr)
    fireEvent.click(screen.getByTestId('time-grid-all-day-event'))
    expect(screen.getByRole('dialog')).toHaveTextContent('All 0')
  })

  it('uses natural short weekdays and only the date accent for today', () => {
    const col = { ...column(2025, 5, 16), isToday: true }
    renderGrid([col], new Map())
    const weekday = within(screen.getByTestId('time-grid-col-header')).getByText('Mon')
    expect(weekday).toHaveStyle({ color: 'var(--fg-2)' })
    expect(weekday.style.letterSpacing).toBe('')
    expect(weekday.className).not.toContain('uppercase')
    expect(screen.getByTestId('time-grid-col-date')).toHaveStyle({ background: 'var(--primary)' })
  })

  it.each(['none', 'wheel', 'scroll'])('waits for loaded concurrent geometry and respects prior scrolling (input=%s)', (input) => {
    const columns = Array.from({ length: 7 }, (_, index) => ({ ...column(2026, 9, 5 + index), isToday: index === 3 }))
    const onSelectDay = vi.fn()
    const grid = (dayMap: Map<string, CalendarDayEntry[]>, isLoading: boolean) => <CalendarTimeGrid columns={columns} dayMap={dayMap} isLoading={isLoading} onSelectDay={onSelectDay} displayTime={displayTime} dateFnsLocale={enUS} allDayLabel="No set time" nowLabel="Now" timeZone="UTC" />
    const view = render(grid(new Map(), true))
    const scroller = screen.getByTestId('time-grid-hour-scroller')
    const today = screen.getAllByTestId('time-grid-day-column')[3]!
    const columnWidth = () => Number(/minmax\(([\d.]+)rem/.exec(screen.getByTestId('time-grid-all-day-band').style.gridTemplateColumns)![1]) * 16
    Object.defineProperties(scroller, { clientWidth: { configurable: true, value: 380 }, clientHeight: { configurable: true, value: 400 } })
    Object.defineProperty(screen.getByTestId('time-grid-any-time-label').parentElement!, 'clientWidth', { configurable: true, value: 96 })
    Object.defineProperties(today, { offsetLeft: { configurable: true, get: () => 96 + 3 * columnWidth() }, clientWidth: { configurable: true, get: columnWidth } })
    view.rerender(grid(new Map(), true))
    expect(scroller.scrollLeft).toBe(0)
    if (input !== 'none') {
      scroller.scrollLeft = 88
      if (input === 'wheel') fireEvent.wheel(scroller, { deltaX: 88 })
      else fireEvent.scroll(scroller)
    }
    const crowded = new Map([[columns[3]!.dateStr, [makeEntry({ habitId: 'first', dueTime: '08:00' }), makeEntry({ habitId: 'second', dueTime: '08:00' })]]])
    view.rerender(grid(crowded, false))
    expect(scroller.scrollLeft).toBe(input === 'none' ? 530 : 88)
    scroller.scrollLeft = 88
    fireEvent.scroll(scroller)
    view.rerender(grid(new Map([[columns[3]!.dateStr, [...crowded.get(columns[3]!.dateStr)!, makeEntry({ habitId: 'third', dueTime: '08:00' })]]]), false))
    expect(scroller.scrollLeft).toBe(88)
  })

  it.each(['none', 'scroll', 'scroll-start', 'wheel', 'touch', 'key'])('holds the opening position through pane pinning until input=%s', (input) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T21:30:00Z'))
    const callbacks: (() => void)[] = []
    const OriginalResizeObserver = globalThis.ResizeObserver
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { callbacks.push(callback) }
      observe() {}
      disconnect() {}
    })
    let paneHeight = 300
    const heights = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.dataset.testid === 'time-grid-hour-scroller' ? 400 : this.dataset.testid === 'time-grid-day-pane' ? paneHeight : 0
    })
    try {
      renderGrid([{ ...column(2026, 9, 8), isToday: true }], new Map())
      const body = screen.getByTestId('time-grid-hour-scroller')
      const pane = screen.getByTestId('time-grid-day-pane')
      expect(pane).toHaveAttribute('data-pinning', 'scrolling')
      const nowTop = Number.parseFloat(screen.getByRole('img', { name: 'Now' }).style.top) * 16
      expect(paneHeight + nowTop - body.scrollTop).toBe(100)
      fireEvent.scroll(body)
      if (input !== 'none') {
        if (input === 'wheel') fireEvent.wheel(body, { deltaY: 120 })
        if (input === 'touch') fireEvent.touchMove(body)
        if (input === 'key') fireEvent.keyDown(body, { key: 'PageDown' })
        body.scrollTop = input === 'scroll-start' ? 0 : 600
        fireEvent.scroll(body)
      }
      paneHeight = 100
      act(() => callbacks.forEach((resize) => resize()))
      expect(pane).toHaveAttribute('data-pinning', 'pinned')
      if (input === 'none') {
        const belowPane = nowTop - body.scrollTop
        expect(belowPane).toBeGreaterThanOrEqual(0)
        expect(belowPane).toBeLessThanOrEqual((400 - paneHeight) / 3)
      } else expect(body.scrollTop).toBe(input === 'scroll-start' ? 0 : 600)
    } finally { heights.mockRestore(); vi.stubGlobal('ResizeObserver', OriginalResizeObserver); vi.useRealTimers() }
  })

  it('holds now in the upper third through viewport and hour scale changes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T21:30:00Z'))
    const callbacks: (() => void)[] = []
    const OriginalResizeObserver = globalThis.ResizeObserver
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { callbacks.push(callback) }
      observe() {}
      disconnect() {}
    })
    let viewportHeight = 400
    let scale = 1
    const heights = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.dataset.testid === 'time-grid-hour-scroller' ? viewportHeight : this.dataset.testid === 'time-grid-day-pane' ? 100 : 0
    })
    const offsets = vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return this.dataset.testid === 'time-grid-hour-label' ? Number(this.textContent!.split(':')[0]) * 48 * scale : 0
    })
    try {
      renderGrid([{ ...column(2026, 9, 8), isToday: true }], new Map())
      const body = screen.getByTestId('time-grid-hour-scroller')
      expect(1032 - body.scrollTop).toBe(75)
      fireEvent.scroll(body)
      viewportHeight = 300
      act(() => callbacks.forEach((resize) => resize()))
      expect(1032 - body.scrollTop).toBe(50)
      fireEvent.scroll(body)
      scale = 2
      act(() => callbacks.forEach((resize) => resize()))
      expect(2064 - body.scrollTop).toBe(50)
      fireEvent.keyDown(screen.getByTestId('time-grid-col-header'), { key: 'Home' })
      body.scrollTop = 0
      fireEvent.scroll(body)
      scale = 1
      viewportHeight = 400
      act(() => callbacks.forEach((resize) => resize()))
      expect(body.scrollTop).toBe(0)
    } finally { offsets.mockRestore(); heights.mockRestore(); vi.stubGlobal('ResizeObserver', OriginalResizeObserver); vi.useRealTimers() }
  })

  it('unpins oversized day lanes and repins at half the viewport after a resize', () => {
    const callbacks: (() => void)[] = []
    const OriginalResizeObserver = globalThis.ResizeObserver
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { callbacks.push(callback) }
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    let paneHeight = 200
    const heights = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.dataset.testid === 'time-grid-hour-scroller' ? 400 : this.parentElement?.dataset.testid === 'time-grid-hour-scroller' ? paneHeight : 0
    })
    try {
      renderGrid([column(2025, 5, 16)], new Map())
      const body = screen.getByTestId('time-grid-hour-scroller')
      const pane = screen.getByTestId('time-grid-all-day-band').parentElement!
      expect(pane).toHaveAttribute('data-pinning', 'pinned')
      expect(body.style.scrollPaddingTop).toBe('200px')
      paneHeight = 201
      act(() => callbacks.forEach((resize) => resize()))
      expect(pane).toHaveAttribute('data-pinning', 'scrolling')
      expect(body.style.scrollPaddingTop).toBe('0px')
      expect(body).toContainElement(screen.getAllByTestId('time-grid-hour-label')[0]!)
      expect(body).toContainElement(screen.getByTestId('time-grid-col-header'))
      paneHeight = 100
      act(() => callbacks.forEach((resize) => resize()))
      expect(pane).toHaveAttribute('data-pinning', 'pinned')
      expect(body.style.scrollPaddingTop).toBe('100px')
    } finally { heights.mockRestore(); vi.stubGlobal('ResizeObserver', OriginalResizeObserver) }
  })

  it.each([178, 126])('reads the loaded DOM before a delayed pane resize notification (height=%s)', (loadedHeight) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T21:30:00Z'))
    const callbacks: (() => void)[] = []
    const OriginalResizeObserver = globalThis.ResizeObserver
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { callbacks.push(callback) }
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    let paneHeight = 126
    const heights = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.dataset.testid === 'time-grid-hour-scroller' ? 300 : this.dataset.testid === 'time-grid-day-pane' ? paneHeight : 0
    })
    const columns = [{ ...column(2026, 9, 8), isToday: true }]
    const grid = (dayMap: Map<string, CalendarDayEntry[]>, isLoading: boolean) => <CalendarTimeGrid columns={columns} dayMap={dayMap} isLoading={isLoading} onSelectDay={vi.fn()} displayTime={displayTime} dateFnsLocale={enUS} allDayLabel="No set time" nowLabel="Now" timeZone="UTC" />
    try {
      const view = render(grid(new Map(), true))
      const body = screen.getByTestId('time-grid-hour-scroller')
      expect(body.scrollTop).toBe(0)
      const entries = Array.from({ length: 3 }, (_, index) => makeEntry({ habitId: String(index) }))
      paneHeight = loadedHeight
      view.rerender(grid(new Map([[columns[0]!.dateStr, entries]]), false))
      const pinned = loadedHeight <= 150
      const visibleHourHeight = 300 - (pinned ? loadedHeight : 0)
      const visibleNow = 1032 + (pinned ? 0 : loadedHeight) - body.scrollTop
      expect(visibleNow).toBeGreaterThanOrEqual(0)
      expect(visibleNow).toBeLessThanOrEqual(visibleHourHeight / 3)
      expect(screen.getByTestId('time-grid-day-pane')).toHaveAttribute('data-pinning', pinned ? 'pinned' : 'scrolling')
      const openingOffset = body.scrollTop
      act(() => callbacks.forEach((resize) => resize()))
      expect(body.scrollTop).toBe(openingOffset)
      fireEvent.wheel(body, { deltaY: 120 })
      body.scrollTop = 600
      view.rerender(grid(new Map([[columns[0]!.dateStr, entries.slice(0, 1)]]), false))
      paneHeight = 126
      act(() => callbacks.forEach((resize) => resize()))
      expect(body.scrollTop).toBe(600)
    } finally { heights.mockRestore(); vi.stubGlobal('ResizeObserver', OriginalResizeObserver); vi.useRealTimers() }
  })

  it('keeps horizontally focused day controls clear of the sticky time gutter', () => {
    renderGrid([column(2025, 5, 16)], new Map())
    const gutterWidth = screen.getByTestId('time-grid-all-day-band').style.gridTemplateColumns.split(' repeat(')[0]!
    expect(screen.getByTestId('time-grid-hour-scroller').style.scrollPaddingLeft).toBe(gutterWidth)
  })

  it('opens today near now and another week at its earliest morning block', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T21:30:00Z'))
    const viewport = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.dataset.testid === 'time-grid-hour-scroller' ? 400 : this.parentElement?.dataset.testid === 'time-grid-hour-scroller' ? 116 : 0
    })
    try {
      const today = { ...column(2026, 9, 8), isToday: true }
      const view = renderGrid([today], new Map())
      const body = screen.getByTestId('time-grid-hour-scroller')
      fireEvent(body, new Event('resize'))
      expect(body.scrollTop).toBeGreaterThan(900)
      view.unmount()
      const past = column(2026, 9, 1)
      renderGrid([past], new Map([[past.dateStr, [makeEntry({ dueTime: '05:00' })]]]))
      expect(screen.getByTestId('time-grid-hour-scroller').scrollTop).toBe(240)
    } finally { viewport.mockRestore(); vi.useRealTimers() }
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

  it('labels the remaining untimed habits with the localized count', () => {
    const col = column(2025, 5, 16)
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry({ habitId: `ad-${i}`, title: `All ${i}`, dueTime: null }),
    )
    renderGrid([col], new Map([[col.dateStr, entries]]))

    expect(screen.getByTestId('time-grid-all-day-more')).toHaveAttribute(
      'aria-label',
      'calendar.timeGrid.moreCountLabel:{"count":7}',
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
