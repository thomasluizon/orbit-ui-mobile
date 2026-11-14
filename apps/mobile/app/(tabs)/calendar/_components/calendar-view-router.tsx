import { useTranslation } from 'react-i18next'
import { calendarDayLoadingLabel, calendarStatState } from '@orbit/shared/utils/calendar-navigation'

import { useEffect, useMemo, useRef, type ReactNode } from "react"

import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

import { usePrefersReducedMotion } from '@/lib/motion'

import { View, Text , StyleSheet } from "react-native"

import { format } from "date-fns"

import { type CalendarMonthDisplayState } from "@orbit/shared/utils"

import { createTokensV2 } from "@/lib/theme"

import { PillButton } from "@/components/ui/pill-button"

import { useFlag } from '@/hooks/use-flag'

import { buildHabitCreateHref } from '@orbit/shared/utils'

import { CalendarGrid } from "./calendar-grid"

import { CalendarDayDetail } from "./calendar-day-detail"

import { CalendarStats } from "./calendar-stats"

import { CalendarAgendaView } from './calendar-agenda-view'

import { CalendarWeekView } from "./calendar-week-view"

import { CalendarRangeView } from "./calendar-range-view"

import type { CalendarScreenState } from './use-calendar-screen-state'

import { createStyles } from './calendar-screen-styles'


import { PADDING, motionDurations, motionEasings, resolveMotionPreset } from '@orbit/shared/theme'

/** A new selected day cross-fades the day card on the base duration. The first day and reduced motion show at once. */
function useDayCardFade(dayKey: string) {
  const reducedMotion = usePrefersReducedMotion()
  const opacity = useSharedValue(1)
  const shownDay = useRef(dayKey)
  useEffect(() => {
    if (shownDay.current === dayKey) return undefined
    shownDay.current = dayKey
    if (reducedMotion) return undefined
    opacity.value = 0
    opacity.value = withTiming(1, { duration: motionDurations.base, easing: Easing.bezier(...motionEasings.standard) })
    return () => {
      cancelAnimation(opacity)
      opacity.value = 1
    }
  }, [dayKey, opacity, reducedMotion])
  return useAnimatedStyle(() => ({ opacity: opacity.value }))
}

function CalendarInlineDaySlot({ loading, dayKey, children }: Readonly<{ loading: boolean; dayKey: string; children: ReactNode }>) {
  const fadeStyle = useDayCardFade(dayKey)
  if (!loading && !dayKey) return null
  return <Animated.View testID="calendar-day-card-slot" style={[calendarLayoutStyles.inlineDay, fadeStyle]}>{children}</Animated.View>
}

interface CalendarMonthFeedbackProps {
  state: CalendarMonthDisplayState
  /** Absent when the Orbit line states the month. */
  text: string | null
  createLabel: string
  onCreate: () => void
  tokens: ReturnType<typeof createTokensV2>
}

function CalendarMonthFeedback({
  state,
  text,
  createLabel,
  onCreate,
  tokens,
}: Readonly<CalendarMonthFeedbackProps>) {
  const styles = useMemo(() => createStyles(), [])
  if (state !== 'empty' && (state !== 'future' || !text)) return null
  return (
    <View style={styles.emptyMonth} testID="calendar-month-empty">
      {text ? <Text style={[styles.emptyMonthText, { color: tokens.fg2 }]}>
        {text}
      </Text> : null}
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
  const guided = useFlag('orbit_guided_flows')
  const { currentMonth, selectedDay, router, todayKey, openImport, tokens, calendarGridRef, selectedDayRef, displayTime, showEventSource, calendarEventsState, refetchCalendarEvents, isLoading, swipeGesture, selectMonthDay, gridDays, weekdayHeaders, monthDisplayState, formattedSelectedDate, monthDayEntries, selectedCalendarEvents, completedCount, selectedDayLoggable, pendingEntryStates, changeSelectedEntry, monthSlide, openHabitCreation } = state
  return ((
    <>
      <CalendarGrid
        gridDays={gridDays}
        weekdayHeaders={weekdayHeaders}
        selectedDay={selectedDay}
        isLoading={isLoading}
        monthKey={format(currentMonth, "yyyy-MM")}
        slideDirection={monthSlide}
        swipeGesture={swipeGesture}
        gridRef={calendarGridRef}
        selectedRef={selectedDayRef}
        onSelectDay={selectMonthDay}
        language={i18n.language}
        t={t}
        tokens={tokens}
        todayKey={todayKey}
      />

      <CalendarMonthFeedback
        state={monthDisplayState}
        text={guided ? null : t(monthDisplayState === 'future' ? 'calendar.futureMonth' : 'calendar.emptyMonth')}
        createLabel={t('habits.createHabit')}
        onCreate={guided ? () => router.push(buildHabitCreateHref({ from: '/calendar', date: selectedDay })) : openHabitCreation}
        tokens={tokens}
      />

      <CalendarInlineDaySlot loading={monthDisplayState === 'loading'} dayKey={selectedDay}>
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

const VIEW_ORDER: readonly CalendarScreenState['view'][] = ['month', 'week', 'range', 'agenda']

/** A view switch enters on the tab-switch preset, shifted toward the side of the chosen segment. Reduced motion swaps the view at once. */
function useViewSwitchMotion(view: CalendarScreenState['view']) {
  const reducedMotion = usePrefersReducedMotion()
  const progress = useSharedValue(1)
  const shift = useSharedValue(0)
  const shownView = useRef(view)
  useEffect(() => {
    const before = shownView.current
    if (before === view) return undefined
    shownView.current = view
    if (reducedMotion) return undefined
    const preset = resolveMotionPreset('tab-switch')
    shift.value = (VIEW_ORDER.indexOf(view) > VIEW_ORDER.indexOf(before) ? 1 : -1) * preset.shift
    progress.value = 0
    progress.value = withTiming(1, { duration: preset.enterDuration, easing: Easing.bezier(...preset.enterEasing) })
    return () => {
      cancelAnimation(progress)
      progress.value = 1
    }
  }, [progress, reducedMotion, shift, view])
  return useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateX: (1 - progress.value) * shift.value }] }))
}

export function CalendarViewRouter({ state }: Readonly<{ state: CalendarScreenState }>) {
  const switchStyle = useViewSwitchMotion(state.view)
  return <Animated.View testID="calendar-view-switch" style={[{ flexGrow: state.view === 'week' ? 1 : 0 }, switchStyle]}><CalendarViewBody state={state} /></Animated.View>
}

function CalendarViewBody({ state }: Readonly<{ state: CalendarScreenState }>) {
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
