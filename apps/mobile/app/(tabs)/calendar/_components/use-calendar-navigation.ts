import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { formatAPIDate, resolveHabitDetailRouteDate } from '@orbit/shared/utils'
import type { CalendarView } from '@orbit/shared/utils/calendar-navigation'
import { useAccountBoundRouteRequest, useAccountScopedState } from '@/hooks/use-session-reset'

export function useCalendarNavigation() {
  const { setParams } = useRouter()
  const params = useLocalSearchParams<{ date?: string }>()
  const routeDate = resolveHabitDetailRouteDate(params.date)
  const acceptRouteDate = useAccountBoundRouteRequest(routeDate ?? '')
  const [selectedDay, setSelectedDay] = useAccountScopedState(() => acceptRouteDate && routeDate ? routeDate : formatAPIDate(new Date()))
  const [view, setView] = useState<CalendarView>('month')
  const [observedRouteDate, setObservedRouteDate] = useState(routeDate)
  if (observedRouteDate !== routeDate) {
    setObservedRouteDate(routeDate)
    if (acceptRouteDate && routeDate) {
      setSelectedDay(routeDate)
      setView('month')
    }
  }
  useEffect(() => {
    if (params.date !== undefined) setParams({ date: undefined })
  }, [params.date, setParams])
  const [weekAnchor, setWeekAnchor] = useAccountScopedState<Date | null>(null)
  const [agendaOffset, setAgendaOffset] = useAccountScopedState(0)
  const [rangeOffset, setRangeOffset] = useAccountScopedState(0)
  return { selectedDay, setSelectedDay, view, setView, weekAnchor, setWeekAnchor, agendaOffset, setAgendaOffset, rangeOffset, setRangeOffset }
}
