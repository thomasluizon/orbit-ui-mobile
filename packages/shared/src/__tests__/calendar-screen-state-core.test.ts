import { describe,expect,it,vi } from 'vitest'
import { buildCalendarGridColumns,buildCalendarRangeBounds,createCalendarDateActions } from '../hooks/calendar-screen-state-core'
import { formatAPIDate } from '../utils/dates'

describe('calendar screen state', () => {
  it.each(['month', 'week', 'range', 'agenda'] as const)('keeps the %s query on its selected range', view => {
    const range = buildCalendarRangeBounds('2026-09-16', null, 1, -1, 2, view)
    const bounds = view === 'week' ? [range.weekStart, range.weekEnd]
      : view === 'agenda' ? [range.agendaStart, range.agendaEnd] : [range.rangeBounds.lo, range.rangeEnd]
    expect([range.queryBounds.lo, range.queryBounds.hi]).toEqual(bounds)
    expect(formatAPIDate(range.weekStart)).toBe('2026-09-14')
    expect(formatAPIDate(range.weekEnd)).toBe('2026-09-20')
    expect(formatAPIDate(range.agendaStart)).toBe('2026-09-30')
    expect(buildCalendarGridColumns(range.weekStart, range.weekEnd, '2026-09-16').filter(day => day.isToday)).toHaveLength(1)
  })

  it('navigates months and clamps a range at today', () => {
    let range = -1
    const setSelectedDay = vi.fn()
    const setMonthSlide = vi.fn()
    const actions = createCalendarDateActions({ currentMonth: new Date(2026, 8, 1), todayKey: '2026-09-16', view: 'week',
      setSelectedDay, setMonthSlide, setWeekSlide: vi.fn(), setWeekAnchor: vi.fn(), setIsDayDetailOpen: vi.fn(),
      setRangeOffset: update => { range = typeof update === 'function' ? update(range) : update },
    })
    actions.nextMonth()
    expect(setSelectedDay).toHaveBeenLastCalledWith('2026-10-01')
    expect(setMonthSlide).toHaveBeenLastCalledWith('right')
    actions.goToCurrentMonth()
    expect(setSelectedDay).toHaveBeenLastCalledWith('2026-09-16')
    actions.nextRange(); actions.nextRange()
    expect(range).toBe(0)
    actions.previousRange()
    expect(range).toBe(-1)
  })
})
