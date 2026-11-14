import type { HabitDayStatus } from '../types/calendar'
import type { CalendarView } from './calendar-navigation'
import type { CalendarMonthDisplayState } from './calendar-month-state'
import { capitalizeFirstLetter, formatLocaleDate } from './locale-format'
import { isCalendarDayLoggable } from './today-date'

/** The one fact Orbit states on Calendário. It comes from the data on the device and starts no request. */
export type CalendarOrbitLine =
  | { readonly kind: 'loading' }
  | { readonly kind: 'monthFuture' | 'monthEmpty'; readonly month: string; readonly withYear: boolean }
  | { readonly kind: 'dayNone'; readonly day: string }
  | { readonly kind: 'dayFuture'; readonly day: string; readonly count: number }
  | { readonly kind: 'dayFull'; readonly day: string }
  | { readonly kind: 'dayLoggable'; readonly day: string }
  | { readonly kind: 'dayPartial'; readonly day: string; readonly done: number; readonly total: number }

export type CalendarOrbitSentence = Exclude<CalendarOrbitLine, { kind: 'loading' }>

export interface CalendarOrbitLineInput {
  readonly view: CalendarView
  readonly monthState: CalendarMonthDisplayState
  /** The first day of the shown month, `yyyy-MM-dd`. */
  readonly monthStart: string
  /** The week, range or agenda data still loads. The month view reads `monthState`. */
  readonly rangeLoading: boolean
  /** The dates the week, range or agenda view shows. Absent in the month view. */
  readonly span: { readonly from: string; readonly to: string } | null
  readonly selectedDay: string
  readonly todayKey: string
  readonly entries: readonly { readonly status: HabitDayStatus }[]
}

type Translate = (key: string, values?: Record<string, string | number>) => string

function resolveDayLine(day: string, todayKey: string, entries: CalendarOrbitLineInput['entries']): CalendarOrbitSentence {
  const total = entries.length
  if (total === 0) return { kind: 'dayNone', day }
  if (day > todayKey) return { kind: 'dayFuture', day, count: total }
  const done = entries.filter((entry) => entry.status === 'completed').length
  if (done === total) return { kind: 'dayFull', day }
  if (day < todayKey && isCalendarDayLoggable(day, todayKey)) return { kind: 'dayLoggable', day }
  return { kind: 'dayPartial', day, done, total }
}

/** The order when cases overlap: future month, empty month, nothing scheduled, future day, all done, a past day that still takes a log, part done. No case names the missed count. */
export function resolveCalendarOrbitLine(input: CalendarOrbitLineInput): CalendarOrbitLine | null {
  if (input.view === 'month') {
    if (input.monthState === 'loading') return { kind: 'loading' }
    const withYear = input.monthStart.slice(0, 4) !== input.todayKey.slice(0, 4)
    if (input.monthState === 'future') return { kind: 'monthFuture', month: input.monthStart, withYear }
    if (input.monthState === 'empty') return { kind: 'monthEmpty', month: input.monthStart, withYear }
  }
  if (!input.selectedDay) return null
  if (input.span && (input.selectedDay < input.span.from || input.selectedDay > input.span.to)) return null
  if (input.view !== 'month' && input.rangeLoading) return { kind: 'loading' }
  return resolveDayLine(input.selectedDay, input.todayKey, input.entries)
}

function formatMonth(line: Extract<CalendarOrbitSentence, { kind: 'monthFuture' | 'monthEmpty' }>, locale: string): string {
  return formatLocaleDate(line.month, locale, line.withYear ? { month: 'long', year: 'numeric' } : { month: 'long' })
}

/** One full templated string per case, with `Intl` for the day, the weekday and the month. */
export function formatCalendarOrbitLine(line: CalendarOrbitSentence, locale: string, translate: Translate): string {
  switch (line.kind) {
    case 'monthFuture': return translate('calendar.orbit.monthFuture')
    case 'monthEmpty': return translate('calendar.orbit.monthEmpty', { month: formatMonth(line, locale) })
    case 'dayNone': return translate('calendar.orbit.dayNone')
    case 'dayFuture': return translate('calendar.orbit.dayFuture', {
      weekday: capitalizeFirstLetter(formatLocaleDate(line.day, locale, { weekday: 'long' })), count: line.count,
    })
    case 'dayFull': return translate('calendar.orbit.dayFull', { day: Number(line.day.slice(8, 10)) })
    case 'dayLoggable': return translate('calendar.orbit.dayLoggable')
    case 'dayPartial': return translate('calendar.orbit.dayPartial', { day: Number(line.day.slice(8, 10)), done: line.done, total: line.total })
  }
}

/** The request a press on the line offers above the composer: the selected day, or the shown month when the line speaks about the month. */
export function buildCalendarOrbitRequest(line: CalendarOrbitSentence, locale: string, translate: Translate): { id: string; label: string; prompt: string } {
  if ('day' in line) {
    const date = formatLocaleDate(line.day, locale, { day: 'numeric', month: 'long' })
    return { id: `calendar-day:${line.day}`, label: date, prompt: translate('calendar.orbit.askDay', { date }) }
  }
  const month = formatMonth(line, locale)
  return { id: `calendar-month:${line.month}`, label: capitalizeFirstLetter(month), prompt: translate('calendar.orbit.askMonth', { month }) }
}

export interface CalendarPageTurn {
  readonly view: CalendarView
  readonly page: string
  readonly turns: number
}

/** Counts the pages the person turns. A view switch is not a page turn, so it keeps the count. */
export function nextCalendarPageTurn(previous: CalendarPageTurn, view: CalendarView, page: string): CalendarPageTurn {
  if (previous.view !== view) return { view, page, turns: previous.turns }
  if (previous.page === page) return previous
  return { view, page, turns: previous.turns + 1 }
}
