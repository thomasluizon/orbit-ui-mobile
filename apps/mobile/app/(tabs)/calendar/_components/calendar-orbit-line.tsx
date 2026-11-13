import { useEffect, useRef, useState, type RefObject } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { PADDING, SPACING } from '@orbit/shared/theme'
import { conversationMascotState, promptDisabledReason } from '@orbit/shared/chat'
import { buildComposerAvailability } from '@orbit/shared/hooks'
import { prepareChatRequest } from '@orbit/shared/stores'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { CalendarView } from '@orbit/shared/utils/calendar-navigation'
import { buildCalendarOrbitRequest, formatAPIDate, formatCalendarOrbitLine, nextCalendarPageTurn, resolveCalendarOrbitLine, type CalendarMonthDisplayState, type CalendarOrbitLine as CalendarOrbitLineModel } from '@orbit/shared/utils'
import { TodayAstraLine } from '@/components/today/today-astra-line'
import { useFlowLookState } from '@/components/ui/flow-look'
import { useAstraAllowanceCopy } from '@/hooks/use-astra-allowance-copy'
import { useFlag } from '@/hooks/use-flag'
import { useOffline } from '@/hooks/use-offline'
import { useProfile } from '@/hooks/use-profile'
import type { AppTokensV2 } from '@/lib/theme'
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
  selectedDayRef: RefObject<View | null>
  tokens: AppTokensV2
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

/** One ring turn for each page the person turns. A view switch is not a page turn. */
function usePageTurns(view: CalendarView, page: string): number {
  const [turn, setTurn] = useState({ view, page, turns: 0 })
  const next = nextCalendarPageTurn(turn, view, page)
  if (next !== turn) setTurn(next)
  return next.turns
}

/** Orbit looks toward the day the person selects. A page turn ends the look. */
function useSelectedDayLook(selectedDay: string, page: string, selectedDayRef: RefObject<View | null>) {
  const { mascotRef, lookAt, lookAtControl, lookAway } = useFlowLookState()
  const shown = useRef({ selectedDay, page })
  useEffect(() => {
    const before = shown.current
    shown.current = { selectedDay, page }
    if (before.page !== page) lookAway()
    else if (before.selectedDay !== selectedDay) lookAtControl(selectedDayRef)
  }, [selectedDay, page, selectedDayRef, lookAtControl, lookAway])
  return { mascotRef, lookAt }
}

function useOrbitAvailability(todayKey: string) {
  const { t } = useTranslation()
  const { profile } = useProfile()
  const { isOnline } = useOffline()
  const allowanceText = useAstraAllowanceCopy()
  const { atMessageLimit, aiMessagesLimit } = buildComposerAvailability({ profile, dailyBudgetDate: null, today: todayKey, replyActive: false, isTyping: false, streamingMessageId: null, messages: [], input: '', isOnline, attachments: [] })
  const reason = promptDisabledReason({ isOnline, atMessageLimit, aiMessagesLimit, isSending: false, allowanceReason: allowanceText('shell.composer.limit.reason', { allowance: aiMessagesLimit }) }, t)
  return { reason, mascotState: conversationMascotState({ isOnline, atMessageLimit }) }
}

/** The Orbit line of Calendário: Orbit at 48 and one fact about the selected day or the shown month. A press opens the conversation with that period offered above the composer. With the guided flows off, Calendário has no line. */
export function CalendarOrbitLine(props: Readonly<CalendarOrbitLineProps>) {
  return useFlag('orbit_guided_flows') ? <CalendarOrbitLineRow {...props} /> : null
}

function CalendarOrbitLineRow(props: Readonly<CalendarOrbitLineProps>) {
  const { t, i18n } = useTranslation()
  const { line, page } = useCalendarOrbitModel(props)
  const turns = usePageTurns(props.view, page)
  const { mascotRef, lookAt } = useSelectedDayLook(props.selectedDay, page, props.selectedDayRef)
  const { reason, mascotState } = useOrbitAvailability(props.todayKey)
  if (!line) return null
  const sentence = line.kind === 'loading' ? null : line
  const openConversation = () => {
    if (!sentence) return
    prepareChatRequest(useChatStore.getState(), buildCalendarOrbitRequest(sentence, i18n.language, t))
    useUIStore.getState().setAstraConversationOpen(true)
  }
  return <View testID="calendar-orbit-line" style={styles.block}>
    <TodayAstraLine text={sentence ? formatCalendarOrbitLine(sentence, i18n.language, t) : t('calendar.loading')}
      destination={reason ?? t('todayAstra.openConversation')} loading={!sentence} busy={!sentence} disabled={!sentence || Boolean(reason)}
      onPress={openConversation} mascotState={mascotState} lookAt={lookAt} turnKey={turns} mascotRef={mascotRef} />
    {reason ? <Text testID="calendar-orbit-line-reason" style={[styles.reason, { color: props.tokens.fg3 }]}>{reason}</Text> : null}
  </View>
}

const styles = StyleSheet.create({
  block: { gap: SPACING.s4, paddingVertical: PADDING.sectionGap - SPACING.s16 },
  reason: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 16 },
})
