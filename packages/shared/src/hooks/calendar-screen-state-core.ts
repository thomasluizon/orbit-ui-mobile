import { addMonths,subMonths,addWeeks,subWeeks,startOfWeek,endOfWeek,addDays,eachDayOfInterval } from 'date-fns'
import { formatAPIDate,parseAPIDate } from '../utils/dates'
import { MAX_RANGE_DAYS,resolveCalendarRangeEnd } from '../utils/calendar-range'
import type { CalendarView } from '../utils/calendar-navigation'
import type { StateSetter } from './state-adapter'
import type { CalendarDayEntry } from '../types/calendar'
import type { CalendarProfile } from '../utils/calendar-navigation'

interface CalendarQueryState {
  dayMap: Map<string, CalendarDayEntry[]>
  isLoading: boolean
  error: string | null
  refresh: () => Promise<unknown>
}

interface CalendarRangeInputs<MonthQuery extends CalendarQueryState> {
  monthQuery: MonthQuery
  weekAnchor: Date | null
  todayKey: string
  weekStartsOn: 0 | 1
  rangeOffset: number
  agendaOffset: number
  view: CalendarView
  profile: CalendarProfile | undefined
  t: (key: string) => string
}

type CalendarRangeState<MonthQuery extends CalendarQueryState, RangeQuery extends CalendarQueryState> =
  Pick<ReturnType<typeof buildCalendarRangeBounds>, 'weekStart' | 'weekEnd' | 'rangeEnd' | 'agendaStart' | 'agendaEnd'> &
  Pick<MonthQuery, 'dayMap' | 'isLoading' | 'error' | 'refresh'> & {
    rangeDayMap: RangeQuery['dayMap']
    rangeError: RangeQuery['error']
    rangeRefresh: RangeQuery['refresh']
    rangeLoading: boolean
    rangeLoadingLabel: string | undefined
  }

interface CalendarRangeAdapters<RangeQuery extends CalendarQueryState> {
  useMemo: <Value>(calculate: () => Value, dependencies: readonly unknown[]) => Value
  useCalendarRange: (start: Date, end: Date, enabled: boolean) => RangeQuery
}

export function createUseCalendarRangeState<RangeQuery extends CalendarQueryState>(
  { useMemo, useCalendarRange }: CalendarRangeAdapters<RangeQuery>,
): <MonthQuery extends CalendarQueryState>(inputs: CalendarRangeInputs<MonthQuery>) => CalendarRangeState<MonthQuery, RangeQuery> {
  return function useCalendarRangeState<MonthQuery extends CalendarQueryState>(
    { monthQuery, weekAnchor, todayKey, weekStartsOn, rangeOffset, agendaOffset, view, profile, t }: CalendarRangeInputs<MonthQuery>,
  ): CalendarRangeState<MonthQuery, RangeQuery> {
    const { dayMap, isLoading, error, refresh } = monthQuery
    const { weekStart, weekEnd, rangeEnd, agendaStart, agendaEnd, queryBounds } = useMemo(
      () => buildCalendarRangeBounds(todayKey, weekAnchor, weekStartsOn, rangeOffset, agendaOffset, view),
      [todayKey, weekAnchor, weekStartsOn, rangeOffset, agendaOffset, view],
    )
    const { dayMap: rangeDayMap, isLoading: rangeQueryLoading, error: rangeError, refresh: rangeRefresh } = useCalendarRange(
      queryBounds.lo, queryBounds.hi, Boolean(profile) && (view === 'week' || view === 'range' || view === 'agenda'),
    )
    const rangeLoading = !profile || rangeQueryLoading
    const rangeLoadingLabel = useMemo(() => rangeLoading ? t('calendar.loading') : undefined, [rangeLoading, t])
    return { weekStart, weekEnd, dayMap, rangeDayMap, error, refresh, rangeError, rangeRefresh, isLoading, rangeEnd, agendaStart, agendaEnd, rangeLoading, rangeLoadingLabel }
  }
}

interface CalendarDateActionsInputs {
  setMonthSlide: StateSetter<'left' | 'right' | null>
  currentMonth: Date
  setSelectedDay: (date: string) => void
  todayKey: string
  setWeekSlide: StateSetter<'left' | 'right' | null>
  setWeekAnchor: StateSetter<Date | null>
  view?: CalendarView
  setIsDayDetailOpen: StateSetter<boolean>
  setRangeOffset: StateSetter<number>
  openEveryDay?: boolean
}

export function buildCalendarRangeBounds(todayKey: string, weekAnchor: Date | null, weekStartsOn: 0 | 1, rangeOffset: number, agendaOffset: number, view: CalendarView) {
  const today = parseAPIDate(todayKey)
  const anchor = weekAnchor ?? today
  const weekStart = startOfWeek(anchor, { weekStartsOn })
  const weekEnd = endOfWeek(anchor, { weekStartsOn })
  const rangeEnd = resolveCalendarRangeEnd(today, rangeOffset)
  const rangeBounds = { lo: addDays(rangeEnd, -(MAX_RANGE_DAYS - 1)), hi: rangeEnd }
  const agendaStart = addDays(today, agendaOffset * 7)
  const agendaEnd = addDays(agendaStart, 6)
  const queryBounds = view === 'week' ? { lo: weekStart, hi: weekEnd }
    : view === 'agenda' ? { lo: agendaStart, hi: agendaEnd } : rangeBounds
  return { weekStart, weekEnd, rangeEnd, rangeBounds, agendaStart, agendaEnd, queryBounds }
}

export function buildCalendarGridColumns(weekStart: Date, weekEnd: Date, todayKey: string) {
  return eachDayOfInterval({ start: weekStart, end: weekEnd }).map(date => {
    const dateStr = formatAPIDate(date)
    return { date, dateStr, isToday: dateStr === todayKey, isFuture: dateStr > todayKey }
  })
}

export function createCalendarDateActions({ setMonthSlide, currentMonth, setSelectedDay, todayKey, setWeekSlide, setWeekAnchor, view, setIsDayDetailOpen, setRangeOffset, openEveryDay = false }: CalendarDateActionsInputs) {
  const prevMonth = (() => {
    setMonthSlide('left')
    const month = subMonths(currentMonth, 1)
    setSelectedDay(formatAPIDate(month))
  })

  const nextMonth = (() => {
    setMonthSlide('right')
    const month = addMonths(currentMonth, 1)
    setSelectedDay(formatAPIDate(month))
  })

  const selectMonth = ((month: number, year: number) => {
    setMonthSlide(null)
    setSelectedDay(formatAPIDate(new Date(year, month, 1)))
  })

  const goToCurrentMonth = (() => {
    setMonthSlide(null)
    setSelectedDay(todayKey)
  })

  const prevWeek = (() => {
    setWeekSlide('left')
    setWeekAnchor((a) => subWeeks(a ?? parseAPIDate(todayKey), 1))
  })
  const nextWeek = (() => {
    setWeekSlide('right')
    setWeekAnchor((a) => addWeeks(a ?? parseAPIDate(todayKey), 1))
  })
  const goToCurrentWeek = (() => {
    setWeekSlide(null)
    setWeekAnchor(parseAPIDate(todayKey))
  })

  const openDay = (
    (dateStr: string) => {
      setSelectedDay(dateStr)
      if (openEveryDay || view === 'week') setIsDayDetailOpen(true)
    }
  )

  const previousRange = (() => {
    setRangeOffset((offset) => offset - 1)
  })
  const nextRange = (() => {
    setRangeOffset((offset) => Math.min(0, offset + 1))
  })
  return { nextMonth, prevMonth, prevWeek, nextWeek, goToCurrentWeek, previousRange, nextRange, goToCurrentMonth, selectMonth, openDay }
}
