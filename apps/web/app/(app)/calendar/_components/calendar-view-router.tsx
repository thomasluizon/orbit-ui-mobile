import { useTranslations } from 'next-intl'
import { PADDING } from '@orbit/shared/theme'
import { calendarDayLoadingLabel, calendarStatState } from '@orbit/shared/utils/calendar-navigation'
import { type ReactNode } from 'react'
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
import type { CalendarScreenState } from './use-calendar-screen-state'

interface CalendarMonthFeedbackProps {
  state: CalendarMonthDisplayState
  emptyText: string
  futureText: string
  createLabel: string
  createVariant: 'primary' | 'secondary'
  onCreate: () => void
  createRefusal?: ReactNode
}

function CalendarMonthFeedback({
  state,
  emptyText,
  futureText,
  createLabel,
  createVariant,
  onCreate,
  createRefusal,
}: Readonly<CalendarMonthFeedbackProps>) {
  if (state !== 'empty' && state !== 'future') return null
  return (
    <div className="flex flex-col items-start gap-3 px-4 py-4" data-testid="calendar-month-empty">
      <p className="text-[var(--fg-2)]">{state === 'future' ? futureText : emptyText}</p>
      {state === 'empty' ? (
        <PillButton variant={createVariant} size="sm" onClick={onCreate}>
          {createLabel}
        </PillButton>
      ) : null}
      <div aria-live="polite" aria-atomic="true" className="w-full max-w-[560px]">{createRefusal}</div>
    </div>
  )
}

function CalendarDayCardSlot({ children }: Readonly<{ children: ReactNode }>) {
  return <div data-testid="calendar-day-card-slot" style={{ paddingInline: PADDING.screenGutter, paddingBlockStart: PADDING.sectionGap }}>{children}</div>
}

function calendarActionVariant(wide: boolean): 'primary' | 'secondary' {
  return wide ? 'secondary' : 'primary'
}
function CalendarMonthView({ state }: Readonly<{ state: CalendarScreenState }>) {
  const t = useTranslations()
  const { currentMonth, selectedDay, todayKey, weekStartsOn, isOnline, isWideDesktop, showCreateRefusal, openImport, showRecurring, showEventSource, calendarEventsState, refetchCalendarEvents, openOrbitPro, isLoading, displayMonthDayMap, openDay, monthDayEntries, selectedCalendarEvents, selectedDayLoggable, pendingEntryStates, changeSelectedEntry, monthDisplayState, monthStatTiles, monthSlide, handleTouchStart, handleTouchEnd, openHabitCreation } = state
  return (<div className="flex min-w-0 flex-col">
    <CalendarSlide
      direction={monthSlide}
      stepKey={format(currentMonth, 'yyyy-MM')}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'pan-y' }}
    >
      <CalendarGrid
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
      emptyText={t('calendar.emptyMonth')}
      futureText={t('calendar.futureMonth')}
      createLabel={t('habits.createHabit')}
      createVariant={calendarActionVariant(isWideDesktop)}
      onCreate={openHabitCreation}
      createRefusal={monthDisplayState === 'empty' && showCreateRefusal && !isOnline ? <OfflineRefusal icon="create" title={t('offline.create.title')} reason={t('offline.create.reason')} /> : null}
    />

    <CalendarDayCardSlot>
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
