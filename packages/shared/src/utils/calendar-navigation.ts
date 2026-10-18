import { startOfWeek } from 'date-fns'
import type { CalendarAutoSyncState } from '../types/calendar'
import type { Profile } from '../types/profile'
import { formatAPIDate, parseAPIDate } from './dates'
import { formatCalendarSpanEnds, type CalendarMonthDisplayState } from './calendar-month-state'

export type CalendarView = 'month' | 'week' | 'range' | 'agenda'

export interface CalendarPeriodNavigation {
  view: Exclude<CalendarView, 'month'>
  label: string
  previousLabel: string
  nextLabel: string
  onPrevious: () => void
  onNext: () => void
  onCurrent: () => void
  nextDisabled?: boolean
}

export interface CalendarHeaderNavigationProps {
  currentMonth: Date
  todayKey: string
  isTodaySelected?: boolean
  previousMonthLabel: string
  nextMonthLabel: string
  onPreviousMonth: () => void
  onNextMonth: () => void
  onCurrentMonth: () => void
  onSelectMonth: (month: number, year: number) => void
  period?: CalendarPeriodNavigation
}

export type CalendarProfile = Pick<Profile,
  'weekStartDay' | 'timeZone' | 'hasProAccess' | 'hasGoogleConnection' |
  'googleCalendarAutoSyncEnabled' | 'googleCalendarAutoSyncStatus' | 'googleCalendarLastSyncedAt'>

export function resolveCalendarProfileSettings(profile: CalendarProfile | undefined): {
  weekStartsOn: 0 | 1
  hasProAccess: boolean
  timeZone: string | null
  autoSyncState: CalendarAutoSyncState | undefined
} {
  return {
    weekStartsOn: profile?.weekStartDay ?? 1,
    hasProAccess: profile?.hasProAccess ?? false,
    timeZone: profile?.timeZone ?? null,
    autoSyncState: profile ? {
      enabled: profile.googleCalendarAutoSyncEnabled,
      status: profile.googleCalendarAutoSyncStatus,
      lastSyncedAt: profile.googleCalendarLastSyncedAt,
      hasGoogleConnection: profile.hasGoogleConnection,
    } : undefined,
  }
}

export function calendarStatState(state: CalendarMonthDisplayState): 'default' | 'loading' | 'empty' {
  if (state === 'loading') return 'loading'
  if (state === 'ready') return 'default'
  return 'empty'
}

export function calendarDayLoadingLabel(state: CalendarMonthDisplayState, label: string): string | undefined {
  return state === 'loading' ? label : undefined
}

interface CalendarHeaderStateInput {
  view: CalendarView
  selectedDay: string
  todayKey: string
  weekStart: Date
  weekStartsOn: 0 | 1
  rangeOffset: number
  agendaOffset: number
  weekLabel: string
  rangeLabel: string
  agendaStart: Date
  agendaEnd: Date
  locale: string
  translate: (key: string, values?: { start: string; end: string }) => string
  prevWeek: () => void
  nextWeek: () => void
  goToCurrentWeek: () => void
  previousRange: () => void
  nextRange: () => void
  setRangeOffset: (offset: number) => void
  setAgendaOffset: (offset: number | ((previous: number) => number)) => void
}

export function buildCalendarHeaderState(input: Readonly<CalendarHeaderStateInput>): Pick<CalendarHeaderNavigationProps, 'isTodaySelected' | 'period'> {
  const { view, selectedDay, todayKey, weekStart, weekStartsOn, rangeOffset, agendaOffset, translate } = input
  if (view === 'month') return { isTodaySelected: selectedDay === todayKey }
  if (view === 'week') return {
    isTodaySelected: formatAPIDate(weekStart) === formatAPIDate(startOfWeek(parseAPIDate(todayKey), { weekStartsOn })),
    period: { view, label: input.weekLabel, previousLabel: translate('common.previousWeek'), nextLabel: translate('common.nextWeek'),
      onPrevious: input.prevWeek, onNext: input.nextWeek, onCurrent: input.goToCurrentWeek },
  }
  if (view === 'range') return {
    isTodaySelected: rangeOffset === 0,
    period: { view, label: input.rangeLabel, previousLabel: translate('calendar.range.previous'), nextLabel: translate('calendar.range.next'),
      onPrevious: input.previousRange, onNext: input.nextRange, onCurrent: () => input.setRangeOffset(0), nextDisabled: rangeOffset === 0 },
  }
  return {
    isTodaySelected: agendaOffset === 0,
    period: { view, label: translate('calendar.range.label', formatCalendarSpanEnds(input.agendaStart, input.agendaEnd, input.locale)),
      previousLabel: translate('common.previousWeek'), nextLabel: translate('common.nextWeek'),
      onPrevious: () => input.setAgendaOffset((offset) => offset - 1), onNext: () => input.setAgendaOffset((offset) => offset + 1), onCurrent: () => input.setAgendaOffset(0) },
  }
}
