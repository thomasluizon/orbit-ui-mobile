import { addMonths,subMonths,addWeeks,subWeeks,startOfWeek,endOfWeek,addDays,eachDayOfInterval } from 'date-fns'
import { formatAPIDate,parseAPIDate } from '../utils/dates'
import { MAX_RANGE_DAYS,resolveCalendarRangeEnd } from '../utils/calendar-range'
import type { CalendarView } from '../utils/calendar-navigation'
import type { StateSetter } from './state-adapter'

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
