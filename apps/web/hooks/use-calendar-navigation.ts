'use client'

import { useState, useCallback, useEffect, type Dispatch, type SetStateAction } from 'react'
import { addDays, isMatch, isValid } from 'date-fns'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatAPIDate, parseAPIDate, MAX_RANGE_DAYS } from '@orbit/shared/utils'
import { useAccountBoundRouteRequest, useAccountScopedState, useAccountGeneration } from '@/hooks/use-session-reset'

import { getAccountGeneration } from '@/lib/session-epoch'

export type CalendarView = 'month' | 'week' | 'range' | 'agenda'

interface CalendarDates {
  selectedDay: string
  weekAnchor: Date | null
  agendaOffset: number
  rangeOffset: number
}

function readDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && isMatch(value, 'yyyy-MM-dd') ? value : null
}

function readOffset(value: string | null, daysPerPage: number, maximum = Infinity): number {
  if (!value || !/^-?\d+$/.test(value)) return 0
  const offset = Number(value)
  const date = addDays(new Date(), offset * daysPerPage)
  return Number.isSafeInteger(offset) && offset <= maximum && isValid(date) && date.getFullYear() > 0 && date.getFullYear() < 10000 ? offset : 0
}

function readView(value: string | null): CalendarView {
  return value === 'week' || value === 'range' || value === 'agenda' ? value : 'month'
}

function readDates(search: string, acceptDates: boolean): CalendarDates {
  const params = new URLSearchParams(acceptDates ? search : '')
  const week = readDate(params.get('week'))
  return {
    selectedDay: readDate(params.get('date')) ?? formatAPIDate(new Date()),
    weekAnchor: week ? parseAPIDate(week) : null,
    agendaOffset: readOffset(params.get('agenda'), 7),
    rangeOffset: readOffset(params.get('range'), MAX_RANGE_DAYS, 0),
  }
}

function calendarHref(search: string, view: CalendarView, dates: CalendarDates): string {
  const params = new URLSearchParams(search)
  params.set('view', view)
  params.set('date', dates.selectedDay)
  if (dates.weekAnchor) params.set('week', formatAPIDate(dates.weekAnchor))
  else params.delete('week')
  for (const [key, offset] of [['agenda', dates.agendaOffset], ['range', dates.rangeOffset]] as const) {
    if (offset) params.set(key, String(offset))
    else params.delete(key)
  }
  return `/calendar?${params}`
}

function calendarImportReturnHref(search: string): string {
  const params = new URLSearchParams(search)
  params.delete('mode')
  params.delete('import')
  return params.size ? `/calendar?${params}` : '/calendar'
}

export function useCalendarNavigation() {
  const router = useRouter()
  const accountGeneration = useAccountGeneration()
  const search = useSearchParams().toString()
  const params = new URLSearchParams(search)
  const dateParams = new URLSearchParams()
  for (const key of ['date', 'week', 'agenda', 'range']) {
    const value = params.get(key)
    if (value !== null) dateParams.set(key, value)
  }
  const dateRequest = dateParams.toString()
  const acceptDates = useAccountBoundRouteRequest(dateRequest)
  const [dates, setDates] = useAccountScopedState(() => readDates(search, acceptDates))
  const [view, setLocalView] = useState(() => readView(params.get('view')))
  const [observedRoute, setObservedRoute] = useState({ search, acceptDates })
  if (observedRoute.search !== search || observedRoute.acceptDates !== acceptDates) {
    setObservedRoute({ search, acceptDates })
    setDates(readDates(search, acceptDates))
    setLocalView(readView(params.get('view')))
  }

  const importReturnHref = calendarImportReturnHref(dateRequest ? calendarHref(search, view, dates).split('?')[1]! : search)
  useEffect(() => {
    if (dateRequest && !acceptDates) router.replace(importReturnHref, { scroll: false })
  }, [acceptDates, dateRequest, importReturnHref, router])

  const setView = useCallback<Dispatch<SetStateAction<CalendarView>>>((next) => {
    if (getAccountGeneration() !== accountGeneration) return
    const nextView = typeof next === 'function' ? next(view) : next
    setLocalView(nextView)
    router.replace(calendarHref(search, nextView, dates), { scroll: false })
  }, [accountGeneration, dates, router, search, view])

  function dateSetter<Key extends keyof CalendarDates>(key: Key): Dispatch<SetStateAction<CalendarDates[Key]>> {
    return (next) => {
      if (getAccountGeneration() !== accountGeneration) return
      const value = typeof next === 'function' ? next(dates[key]) : next
      const nextDates = { ...dates, [key]: value }
      setDates(nextDates)
      router.replace(calendarHref(search, view, nextDates), { scroll: false })
    }
  }

  return {
    ...dates, view, setView, importReturnHref,
    setSelectedDay: dateSetter('selectedDay'),
    setWeekAnchor: dateSetter('weekAnchor'),
    setAgendaOffset: dateSetter('agendaOffset'),
    setRangeOffset: dateSetter('rangeOffset'),
  }
}
