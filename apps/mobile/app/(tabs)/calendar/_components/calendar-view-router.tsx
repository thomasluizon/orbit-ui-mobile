import { useTranslation } from 'react-i18next'
import { calendarDayLoadingLabel, calendarStatState } from '@orbit/shared/utils/calendar-navigation'

import { useMemo, type ReactNode } from "react"

import { View, Text , StyleSheet } from "react-native"

import { format } from "date-fns"

import { type CalendarMonthDisplayState } from "@orbit/shared/utils"

import { createTokensV2 } from "@/lib/theme"

import { PillButton } from "@/components/ui/pill-button"

import { CalendarGrid } from "./calendar-grid"

import { CalendarDayDetail } from "./calendar-day-detail"

import { CalendarStats } from "./calendar-stats"

import { CalendarAgendaView } from './calendar-agenda-view'

import { CalendarWeekView } from "./calendar-week-view"

import { CalendarRangeView } from "./calendar-range-view"

import type { CalendarScreenState } from './use-calendar-screen-state'

import { createStyles } from './calendar-screen-styles'


import { PADDING } from '@orbit/shared/theme'

function CalendarInlineDaySlot({ loading, selected, children }: Readonly<{ loading: boolean; selected: boolean; children: ReactNode }>) {
  if (!loading && !selected) return null
  return <View testID="calendar-day-card-slot" style={calendarLayoutStyles.inlineDay}>{children}</View>
}

interface CalendarMonthFeedbackProps {
  state: CalendarMonthDisplayState
  emptyText: string
  futureText: string
  createLabel: string
  onCreate: () => void
  tokens: ReturnType<typeof createTokensV2>
}

function CalendarMonthFeedback({
  state,
  emptyText,
  futureText,
  createLabel,
  onCreate,
  tokens,
}: Readonly<CalendarMonthFeedbackProps>) {
  const styles = useMemo(() => createStyles(), [])
  if (state !== 'empty' && state !== 'future') return null
  return (
    <View style={styles.emptyMonth} testID="calendar-month-empty">
      <Text style={[styles.emptyMonthText, { color: tokens.fg2 }]}>
        {state === 'future' ? futureText : emptyText}
      </Text>
      {state === 'empty' ? (
        <PillButton variant="primary" size="sm" onClick={onCreate}>
          {createLabel}
        </PillButton>
      ) : null}
    </View>
  )
}
function CalendarMonthView({ state }: Readonly<{ state: CalendarScreenState }>) {
  const { t, i18n } = useTranslation()
  const { currentMonth, selectedDay, router, todayKey, openImport, tokens, calendarGridRef, calendarDayRef, displayTime, showEventSource, calendarEventsState, refetchCalendarEvents, isLoading, swipeGesture, selectMonthDay, gridDays, weekdayHeaders, monthDisplayState, formattedSelectedDate, monthDayEntries, selectedCalendarEvents, completedCount, selectedDayLoggable, pendingEntryStates, changeSelectedEntry, monthEntering, openHabitCreation } = state
  return ((
    <>
      <CalendarGrid
        gridDays={gridDays}
        weekdayHeaders={weekdayHeaders}
        selectedDay={selectedDay}
        isLoading={isLoading}
        monthKey={format(currentMonth, "yyyy-MM")}
        monthEntering={monthEntering}
        swipeGesture={swipeGesture}
        gridRef={calendarGridRef}
        todayRef={calendarDayRef}
        onSelectDay={selectMonthDay}
        language={i18n.language}
        t={t}
        tokens={tokens}
        todayKey={todayKey}
      />

      <CalendarMonthFeedback
        state={monthDisplayState}
        emptyText={t('calendar.emptyMonth')}
        futureText={t('calendar.futureMonth')}
        createLabel={t('habits.createHabit')}
        onCreate={openHabitCreation}
        tokens={tokens}
      />

      <CalendarInlineDaySlot loading={monthDisplayState === 'loading'} selected={Boolean(selectedDay)}>
        <CalendarDayDetail
          loadingLabel={calendarDayLoadingLabel(monthDisplayState, t('calendar.loading'))}
          selectedDate={selectedDay}
          title={formattedSelectedDate}
          filteredEntries={monthDayEntries}
          calendarEvents={selectedCalendarEvents}
          showEventSource={showEventSource}
          calendarEventsState={calendarEventsState}
          onRetryCalendarEvents={() => void refetchCalendarEvents()}
          onReconnectCalendarEvents={() => openImport(null)}
          onOpenCalendarImport={openImport}
          onViewPro={() => router.push('/upgrade')}
          completedCount={completedCount}
          loggable={selectedDayLoggable}
          pendingEntryStates={pendingEntryStates}
          onEntryChange={changeSelectedEntry}
          onGoToDay={() => router.push(`/?date=${selectedDay}`)}
          displayTime={displayTime}
          t={t}
          tokens={tokens}
        />
      </CalendarInlineDaySlot>
    </>
  ))
}

export function CalendarViewRouter({ state }: Readonly<{ state: CalendarScreenState }>) {
  const { t, i18n } = useTranslation()
  const { view, timeZone, todayKey, tokens, displayTime, weekSlide, agendaStart, rangeLoading, displayRangeDayMap, gridColumns, onSelectDay, rangeModel, rangeLabel, weekdayHeaders, rangeStatTiles } = state
  return ({
    week: (
      <CalendarWeekView
        columns={gridColumns}
        dayMap={displayRangeDayMap}
        slideDirection={weekSlide}
        isLoading={rangeLoading}
        onSelectDay={onSelectDay}
        displayTime={displayTime}
        language={i18n.language}
        allDayLabel={t("calendar.timeGrid.noSetTime")}
        nowLabel={t("calendar.timeGrid.now")}
        timeZone={timeZone}
        t={t}
        tokens={tokens}
      />
    ),
    range: (
      <CalendarRangeView
        model={rangeModel}
        weekdayLabels={weekdayHeaders.map((weekday) => weekday.label)}
        rangeLabel={rangeLabel}
        isLoading={rangeLoading}
        loadingLabel={t("common.loading")}
        stats={rangeStatTiles}
        language={i18n.language}
        t={t}
      />
    ),
    agenda: (
      <CalendarAgendaView
        startDate={agendaStart}
        dayMap={displayRangeDayMap}
        displayTime={displayTime}
        todayKey={todayKey}
        isLoading={rangeLoading}
        loadingLabel={t("common.loading")}
      />
    ),
    month: <CalendarMonthView state={state} />,
  }[view])
}

export function CalendarMonthFooter({ state }: Readonly<{ state: CalendarScreenState }>) {
  const { t } = useTranslation()
  const { styles, monthDisplayState, monthStatTiles } = state
  return (
    <View style={styles.listFooter}>
      <CalendarStats
        stats={monthStatTiles}
        state={calendarStatState(monthDisplayState)}
        loadingLabel={t('calendar.loading')}
        emptyLabel={t('calendar.emptyStat')}
      />

    </View>
  )
}

const calendarLayoutStyles = StyleSheet.create({
  inlineDay: { paddingHorizontal: PADDING.screenGutter, paddingTop: PADDING.sectionGap },
})
