import { describe,expect,it,vi } from 'vitest'
import { buildCalendarGridColumns,buildCalendarRangeBounds,createCalendarDateActions,createUseCalendarRangeState } from '../hooks/calendar-screen-state-core'
import { formatAPIDate } from '../utils/dates'
import type { CalendarDayEntry } from '../types/calendar'
import { createMockProfile } from './factories'

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

function calendarRangeHarness() {
  const monthQuery = { dayMap: new Map<string, CalendarDayEntry[]>(), isLoading: false, error: null, refresh: vi.fn(async () => {}) }
  const rangeQuery = { ...monthQuery, dayMap: new Map<string, CalendarDayEntry[]>(), refresh: vi.fn(async () => {}), error: 'Unavailable' }
  const useCalendarRange = vi.fn<(start: Date, end: Date, enabled: boolean) => typeof rangeQuery>(() => rangeQuery)
  const useRange = createUseCalendarRangeState({ useCalendarRange, useMemo: calculate => calculate() })
  const inputs = { monthQuery, weekAnchor: null, todayKey: '2026-09-16', weekStartsOn: 1 as const, rangeOffset: -1, agendaOffset: 2,
    profile: createMockProfile(), t: (key: string) => key }
  return { inputs, rangeQuery, useCalendarRange, useRange }
}

describe('shared calendar range query', () => {
  it.each(['month', 'week', 'range', 'agenda'] as const)('loads the selected %s bounds and preserves query results', view => {
    const { inputs, rangeQuery, useCalendarRange, useRange } = calendarRangeHarness()
    const state = useRange({ ...inputs, view })
    const bounds = buildCalendarRangeBounds(inputs.todayKey, inputs.weekAnchor, inputs.weekStartsOn, inputs.rangeOffset, inputs.agendaOffset, view)
    expect(useCalendarRange).toHaveBeenCalledExactlyOnceWith(bounds.queryBounds.lo, bounds.queryBounds.hi, view !== 'month')
    expect(state.dayMap).toBe(inputs.monthQuery.dayMap)
    expect(state.refresh).toBe(inputs.monthQuery.refresh)
    expect(state.rangeDayMap).toBe(rangeQuery.dayMap)
    expect(state.rangeRefresh).toBe(rangeQuery.refresh)
    expect(state.rangeError).toBe('Unavailable')
    expect(state.rangeLoading).toBe(false)
    expect(state.rangeLoadingLabel).toBeUndefined()
  })

  it('disables the range query and keeps its loading label until the profile is ready', () => {
    const { inputs, useCalendarRange, useRange } = calendarRangeHarness()
    const state = useRange({ ...inputs, profile: undefined, view: 'week' })
    expect(useCalendarRange.mock.calls[0]?.[2]).toBe(false)
    expect(state.rangeLoading).toBe(true)
    expect(state.rangeLoadingLabel).toBe('calendar.loading')
  })

  it('retains the loading state of a pending range query with a ready profile', () => {
    const { inputs, rangeQuery, useRange } = calendarRangeHarness()
    rangeQuery.isLoading = true
    const state = useRange({ ...inputs, view: 'agenda' })
    expect(state.rangeLoading).toBe(true)
    expect(state.rangeLoadingLabel).toBe('calendar.loading')
  })
})
