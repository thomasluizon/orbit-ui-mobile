'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { PADDING, SPACING } from '@orbit/shared/theme'
import { getOrbitRest } from '@orbit/shared/chat'
import { prepareChatRequest } from '@orbit/shared/stores'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { CalendarView } from '@orbit/shared/utils/calendar-navigation'
import { buildCalendarOrbitRequest, formatAPIDate, formatCalendarOrbitLine, nextCalendarPageTurn, resolveCalendarOrbitLine, type CalendarMonthDisplayState, type CalendarOrbitLine as CalendarOrbitLineModel } from '@orbit/shared/utils'
import { TodayAstraLine } from '@/components/today/today-astra-line'
import { useFlag } from '@/hooks/use-flag'
import { useOrbitLook } from '@/hooks/use-orbit-look'
import { useProfile } from '@/hooks/use-profile'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

export interface CalendarOrbitLineProps {
  view: CalendarView
  currentMonth: Date
  monthDisplayState: CalendarMonthDisplayState
  selectedDay: string
  todayKey: string
  displayMonthDayMap: Map<string, CalendarDayEntry[]>
  displayRangeDayMap: Map<string, CalendarDayEntry[]>
  rangeLoading: boolean
  weekStart: Date
  weekEnd: Date
  agendaStart: Date
  agendaEnd: Date
  rangeModel: { start: Date; end: Date }
  isOnline: boolean
}

function shownSpan({ view, weekStart, weekEnd, agendaStart, agendaEnd, rangeModel }: CalendarOrbitLineProps): { from: string; to: string } | null {
  if (view === 'month') return null
  const [from, to] = view === 'week' ? [weekStart, weekEnd] : view === 'agenda' ? [agendaStart, agendaEnd] : [rangeModel.start, rangeModel.end]
  return { from: formatAPIDate(from), to: formatAPIDate(to) }
}

function useCalendarOrbitModel(props: CalendarOrbitLineProps): { line: CalendarOrbitLineModel | null; page: string } {
  const { view, currentMonth, monthDisplayState, selectedDay, todayKey, displayMonthDayMap, displayRangeDayMap, rangeLoading } = props
  const span = shownSpan(props)
  const entries = (view === 'month' ? displayMonthDayMap : displayRangeDayMap).get(selectedDay) ?? []
  const monthStart = formatAPIDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1))
  const line = resolveCalendarOrbitLine({ view, monthState: monthDisplayState, monthStart, rangeLoading, span, selectedDay, todayKey, entries })
  return { line, page: span?.from ?? monthStart }
}

function usePageTurns(view: CalendarView, page: string): number {
  const [turn, setTurn] = useState({ view, page, turns: 0 })
  const next = nextCalendarPageTurn(turn, view, page)
  if (next !== turn) setTurn(next)
  return next.turns
}

function useSelectedDayLook(selectedDay: string, page: string) {
  const { mascotRef, lookAt, lookTowards, lookAway } = useOrbitLook()
  const shown = useRef({ selectedDay, page })
  useEffect(() => {
    const before = shown.current
    shown.current = { selectedDay, page }
    if (before.page !== page) lookAway()
    else if (before.selectedDay !== selectedDay) lookTowards(document.querySelector(`[data-calendar-date="${selectedDay}"]`))
  }, [selectedDay, page, lookTowards, lookAway])
  return { mascotRef, lookAt }
}

function useOrbitRest(isOnline: boolean) {
  const t = useTranslations()
  const { profile } = useProfile()
  const rest = getOrbitRest({ isOnline, profile })
  return { reason: rest ? t(rest) : undefined, mascotState: rest ? 'descansando' as const : 'parado' as const }
}

/** The Orbit line of Calendário: Orbit at 48 and one fact about the selected day or the shown month. A press opens the conversation with that period offered above the composer. With the guided flows off, Calendário has no line. */
export function CalendarOrbitLine(props: Readonly<CalendarOrbitLineProps>) {
  return useFlag('orbit_guided_flows') ? <CalendarOrbitLineRow {...props} /> : null
}

function CalendarOrbitLineRow(props: Readonly<CalendarOrbitLineProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const { line, page } = useCalendarOrbitModel(props)
  const turns = usePageTurns(props.view, page)
  const { mascotRef, lookAt } = useSelectedDayLook(props.selectedDay, page)
  const { reason, mascotState } = useOrbitRest(props.isOnline)
  if (!line) return null
  const sentence = line.kind === 'loading' ? null : line
  const openConversation = () => {
    if (!sentence) return
    prepareChatRequest(useChatStore.getState(), buildCalendarOrbitRequest(sentence, locale, t))
    useUIStore.getState().setAstraConversationOpen(true)
  }
  return <div data-testid="calendar-orbit-line" className="flex flex-col gap-1" style={{ paddingBlock: PADDING.sectionGap - SPACING.s16 }}>
    <TodayAstraLine text={sentence ? formatCalendarOrbitLine(sentence, locale, t) : t('calendar.loading')}
      destination={reason ?? t('todayAstra.openConversation')} loading={!sentence} busy={!sentence} disabled={!sentence || Boolean(reason)}
      onPress={openConversation} mascotState={mascotState} lookAt={lookAt} turnKey={turns} mascotRef={mascotRef} />
    {reason ? <p data-testid="calendar-orbit-line-reason" className="m-0 px-screen-gutter text-[var(--fg-3)]" style={{ fontSize: 12, lineHeight: 1.4 }}>{reason}</p> : null}
  </div>
}
