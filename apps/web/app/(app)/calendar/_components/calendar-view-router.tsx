import { useTranslations } from 'next-intl'
import { PADDING, motionDurations, motionEasings } from '@orbit/shared/theme'
import { calendarDayLoadingLabel, calendarStatState } from '@orbit/shared/utils/calendar-navigation'
import { useEffect, useRef, type ReactNode } from 'react'
import { useViewportMatch } from '@/hooks/use-viewport-match'
import { format } from 'date-fns'
import { type CalendarMonthDisplayState } from '@orbit/shared/utils'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { CalendarSlide } from '@/components/calendar/calendar-slide'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
import { CalendarStats } from '@/components/calendar/calendar-stats'
import { CalendarWeekView } from '@/components/calendar/calendar-week-view'
import { CalendarRangeView } from '@/components/calendar/calendar-range-view'
import { CalendarAgendaView } from '@/components/calendar/calendar-agenda-view'
import { PillButton } from '@/components/ui/pill-button'
import { OfflineRefusal } from '@/components/ui/offline-refusal'
import { useFlag } from '@/hooks/use-flag'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { buildHabitCreateHref } from '@orbit/shared/utils'
import type { CalendarScreenState } from './use-calendar-screen-state'

interface CalendarMonthFeedbackProps {
  state: CalendarMonthDisplayState
  /** Absent when the Orbit line states the month. */
  text: string | null
  createLabel: string
  createVariant: 'primary' | 'secondary'
  onCreate: () => void
  createRefusal?: ReactNode
}

function CalendarMonthFeedback({
  state,
  text,
  createLabel,
  createVariant,
  onCreate,
  createRefusal,
}: Readonly<CalendarMonthFeedbackProps>) {
  if (state !== 'empty' && (state !== 'future' || !text)) return null
  return (
    <div className="flex flex-col items-start gap-3 px-4 py-4" data-testid="calendar-month-empty">
      {text ? <p className="text-[var(--fg-2)]">{text}</p> : null}
      {state === 'empty' ? (
        <PillButton variant={createVariant} size="sm" onClick={onCreate}>
          {createLabel}
        </PillButton>
      ) : null}
      <div aria-live="polite" aria-atomic="true" className="w-full max-w-[560px]">{createRefusal}</div>
    </div>
  )
}

const DAY_CARD_FADE = { duration: motionDurations.base, easing: `cubic-bezier(${motionEasings.standard.join(', ')})` }

/** A new selected day cross-fades the day card on the base duration. The first day and reduced motion show at once. */
function CalendarDayCardSlot({ dayKey, children }: Readonly<{ dayKey: string; children: ReactNode }>) {
  const slotRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const shownDay = useRef(dayKey)
  useEffect(() => {
    if (shownDay.current === dayKey) return undefined
    shownDay.current = dayKey
    const slot = slotRef.current
    if (reducedMotion || !slot || typeof slot.animate !== 'function') return undefined
    const fade = slot.animate([{ opacity: 0 }, { opacity: 1 }], DAY_CARD_FADE)
    return () => fade.cancel()
  }, [dayKey, reducedMotion])
  return <div ref={slotRef} data-testid="calendar-day-card-slot" style={{ paddingInline: PADDING.screenGutter, paddingBlockStart: PADDING.sectionGap }}>{children}</div>
}

function calendarActionVariant(wide: boolean): 'primary' | 'secondary' {
  return wide ? 'secondary' : 'primary'
}
/** With the guided flows on, the create action of an empty month opens the create flow on the selected day. */
function useCreateOnSelectedDay(state: CalendarScreenState, guided: boolean): () => void {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { isOnline, setShowCreateRefusal, selectedDay, openHabitCreation } = state
  if (!guided) return openHabitCreation
  return () => {
    if (!isOnline) { setShowCreateRefusal(true); return }
    const query = searchParams.size ? `?${searchParams}` : ''
    router.push(buildHabitCreateHref({ from: `${pathname}${query}`, date: selectedDay }))
  }
}

function CalendarMonthView({ state }: Readonly<{ state: CalendarScreenState }>) {
  const t = useTranslations()
  const guided = useFlag('orbit_guided_flows')
  const createOnSelectedDay = useCreateOnSelectedDay(state, guided)
  const { currentMonth, selectedDay, todayKey, weekStartsOn, isOnline, isWideDesktop, showCreateRefusal, openImport, showRecurring, showEventSource, calendarEventsState, refetchCalendarEvents, openOrbitPro, isLoading, displayMonthDayMap, openDay, monthDayEntries, selectedCalendarEvents, selectedDayLoggable, pendingEntryStates, changeSelectedEntry, monthDisplayState, monthStatTiles, monthSlide, handleTouchStart, handleTouchEnd } = state
  const monthKey = format(currentMonth, 'yyyy-MM')
  return (<div className="flex min-w-0 flex-col">
    <CalendarSlide
      direction={monthSlide}
      stepKey={monthKey}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'pan-y' }}
    >
      <CalendarGrid
        key={monthKey}
        currentMonth={currentMonth}
        dayMap={displayMonthDayMap}
        onSelectDay={openDay}
        selectedDateStr={selectedDay}
        isLoading={isLoading}
        weekStartsOn={weekStartsOn}
        todayKey={todayKey}
      />
    </CalendarSlide>

    <CalendarMonthFeedback
      state={monthDisplayState}
      text={guided ? null : t(monthDisplayState === 'future' ? 'calendar.futureMonth' : 'calendar.emptyMonth')}
      createLabel={t('habits.createHabit')}
      createVariant={calendarActionVariant(isWideDesktop)}
      onCreate={createOnSelectedDay}
      createRefusal={monthDisplayState === 'empty' && showCreateRefusal && !isOnline ? <OfflineRefusal icon="create" title={t('offline.create.title')} reason={t('offline.create.reason')} /> : null}
    />

    <CalendarDayCardSlot dayKey={selectedDay}>
      <CalendarDayDetail
        loadingLabel={calendarDayLoadingLabel(monthDisplayState, t('calendar.loading'))}
        dateStr={selectedDay}
        today={todayKey}
        entries={monthDayEntries}
        calendarEvents={selectedCalendarEvents}
        showEventSource={showEventSource}
        calendarEventsState={calendarEventsState}
        onRetryCalendarEvents={() => void refetchCalendarEvents()}
        onReconnectCalendarEvents={() => openImport(null)}
        onOpenCalendarImport={openImport}
        onViewPro={openOrbitPro}
        loggable={selectedDayLoggable}
        showRecurring={showRecurring}
        pendingEntryStates={pendingEntryStates}
        onEntryChange={changeSelectedEntry}
      />
    </CalendarDayCardSlot>
    <div style={{ paddingBlockStart: PADDING.sectionGap }}><CalendarStats
      stats={monthStatTiles}
      state={calendarStatState(monthDisplayState)}
      loadingLabel={t('calendar.loading')}
      emptyLabel={t('calendar.emptyStat')}
    /></div>
  </div>)
}

export function CalendarViewRouter({ state }: Readonly<{ state: CalendarScreenState }>) {
  const t = useTranslations()
  const { view, timeZone, todayKey, weekSlide, displayTime, dateFnsLocale, agendaStart, rangeLoading, displayRangeDayMap, gridColumns, openDay, rangeLabel, rangeModel, weekdayLabels, rangeStatTiles } = state
  if (view === 'month') return (<CalendarMonthView state={state} />)
  if (view === 'week') return (<CalendarWeekView
    columns={gridColumns}
    dayMap={displayRangeDayMap}
    slideDirection={weekSlide}
    isLoading={rangeLoading}
    onSelectDay={openDay}
    displayTime={displayTime}
    dateFnsLocale={dateFnsLocale}
    allDayLabel={t('calendar.timeGrid.noSetTime')}
    nowLabel={t('calendar.timeGrid.now')}
    timeZone={timeZone}
  />)
  if (view === 'range') return (<CalendarRangeView
    model={rangeModel}
    weekdayLabels={weekdayLabels}
    rangeLabel={rangeLabel}
    isLoading={rangeLoading}
    loadingLabel={t('common.loading')}
    stats={rangeStatTiles}
  />)
  return (<CalendarAgendaView
    startDate={agendaStart}
    dayMap={displayRangeDayMap}
    displayTime={displayTime}
    todayKey={todayKey}
    isLoading={rangeLoading}
    loadingLabel={t('common.loading')}
  />)
}
