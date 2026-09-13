'use client'

import { useState, useMemo, useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import {
  addMonths,
  addDays,
  subMonths,
  setYear,
  addWeeks,
  subWeeks,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  format,
} from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { useLocale, useTranslations } from 'next-intl'
import {
  formatAPIDate,
  parseAPIDate,
  capitalizeFirstLetter,
  filterCalendarSyncEventsByDate,
  buildCalendarRangeModel,
  CALENDAR_HORIZONTAL_SWIPE_DIRECTION_RATIO,
  CALENDAR_MONTH_SWIPE_THRESHOLD,
  filterRecurringDayMap,
  MAX_RANGE_DAYS,
  resolveCalendarRangeEnd,
  CALENDAR_MONTH_GRID_GEOMETRY,
  resolveCalendarMonthDisplayState,
  type CalendarMonthDisplayState,
} from '@orbit/shared/utils'
import { useCalendarData, useCalendarRange } from '@/hooks/use-calendar-data'
import { useCalendarEvents } from '@/hooks/use-calendar-events'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useDateFormat } from '@/hooks/use-date-format'
import { useProfile } from '@/hooks/use-profile'
import { buildCalendarMonthModel } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { Profile } from '@orbit/shared/types/profile'
import type { CalendarSyncEvent } from '@orbit/shared'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
import { CalendarStats } from '@/components/calendar/calendar-stats'
import { CalendarWeekView } from '@/components/calendar/calendar-week-view'
import { CalendarRangeView } from '@/components/calendar/calendar-range-view'
import { CalendarAgendaView } from '@/components/calendar/calendar-agenda-view'
import { CalendarLoadError } from '@/components/calendar/calendar-load-error'
import { ShowRecurringToggle } from '@/components/calendar/show-recurring-toggle'
import type { TimeGridColumn } from '@/components/calendar/calendar-time-grid'
import { Sheet } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { useUIStore } from '@/stores/ui-store'
import { useToday } from '../today-provider'
import {
  CalendarHeader,
  CalendarLegend,
} from './_components/calendar-shell'

type MonthSlide = 'left' | 'right' | null
type CalendarView = 'month' | 'week' | 'range' | 'agenda'

function calendarStatState(
  state: CalendarMonthDisplayState,
): 'default' | 'loading' | 'empty' {
  if (state === 'loading') return 'loading'
  if (state === 'ready') return 'default'
  return 'empty'
}

interface CalendarMonthFeedbackProps {
  state: CalendarMonthDisplayState
  emptyText: string
  futureText: string
  createLabel: string
  createVariant: 'primary' | 'secondary'
  onCreate: () => void
}

function CalendarMonthFeedback({
  state,
  emptyText,
  futureText,
  createLabel,
  createVariant,
  onCreate,
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
    </div>
  )
}

function CalendarMonthLegend({
  state,
  loggableLabel,
  fullLabel,
  partialLabel,
  noneLabel,
}: Readonly<{
  state: CalendarMonthDisplayState
  loggableLabel: string
  fullLabel: string
  partialLabel: string
  noneLabel: string
}>) {
  if (state !== 'ready') return null
  return (
    <CalendarLegend
      loggableLabel={loggableLabel}
      fullLabel={fullLabel}
      partialLabel={partialLabel}
      noneLabel={noneLabel}
    />
  )
}

interface CalendarInlineDayPanelProps {
  show: boolean
  state: CalendarMonthDisplayState
  loadingLabel: string
  title: string
  selectedDay: string | null
  entries: CalendarDayEntry[]
  calendarEvents: CalendarSyncEvent[]
  showRecurring: boolean
  showRecurringToggle: boolean
  onShowRecurringChange: (value: boolean) => void
}

function CalendarInlineDayPanel({
  show,
  state,
  loadingLabel,
  title,
  selectedDay,
  entries,
  calendarEvents,
  showRecurring,
  showRecurringToggle,
  onShowRecurringChange,
}: Readonly<CalendarInlineDayPanelProps>) {
  if (!show) return null
  const loading = state === 'loading'
  return (
    <section
      data-testid="calendar-day-panel"
      aria-label={loading ? loadingLabel : title}
      className="sticky top-16 flex h-[calc(100dvh-84px)] flex-col"
      style={{ padding: '16px 0 8px 4px' }}
    >
      {loading ? (
        <Skeleton variant="settings" rows={5} label={loadingLabel} />
      ) : (
        <>
          <h2
            className="min-w-0 shrink-0 truncate"
            style={{
              margin: 0,
              padding: '0 0 12px',
              fontFamily: 'var(--font-sans)',
              fontSize: 20,
              fontWeight: 500,
              color: 'var(--fg-1)',
            }}
          >
            {title}
          </h2>
          <CalendarDayDetail
            dateStr={selectedDay}
            entries={entries}
            calendarEvents={calendarEvents}
            showRecurring={showRecurring}
            onShowRecurringChange={onShowRecurringChange}
            showRecurringToggle={showRecurringToggle}
            fitViewport
          />
        </>
      )}
    </section>
  )
}

function resolveMonthSlideClass(monthSlide: MonthSlide): string {
  if (monthSlide === 'right') return 'animate-slide-date-right'
  if (monthSlide === 'left') return 'animate-slide-date-left'
  return ''
}

export default function CalendarPage() {
  const t = useTranslations()
  const { profile, error: profileError, refetch: refetchProfile } = useProfile()
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
  const monthQuery = useCalendarData(currentMonth)
  if (!profile) {
    return (
      <div style={{ padding: '16px 4px' }}>
        {profileError ? (
          <CalendarLoadError onRetry={() => void refetchProfile()} />
        ) : (
          <div className="flex flex-col gap-6">
            <Skeleton
              variant="grid"
              rows={CALENDAR_MONTH_GRID_GEOMETRY.maximumRows}
              cols={CALENDAR_MONTH_GRID_GEOMETRY.columns}
              cell={CALENDAR_MONTH_GRID_GEOMETRY.cell}
              gap={CALENDAR_MONTH_GRID_GEOMETRY.gap}
              label={t('calendar.loading')}
            />
            <Skeleton variant="settings" rows={5} label={t('calendar.loading')} />
            <CalendarStats
              stats={[
                { key: 'bestStreak', value: 0, label: t('calendar.bestStreak') },
                { key: 'totalLogs', value: 0, label: t('calendar.totalLogs') },
                { key: 'missed', value: 0, label: t('calendar.missedCount') },
              ]}
              state="loading"
              loadingLabel={t('calendar.loading')}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <CalendarPageContent
      profile={profile}
      currentMonth={currentMonth}
      setCurrentMonth={setCurrentMonth}
      monthQuery={monthQuery}
    />
  )
}

interface CalendarPageContentProps {
  profile: Pick<Profile, 'weekStartDay' | 'timeZone' | 'hasProAccess'>
  currentMonth: Date
  setCurrentMonth: Dispatch<SetStateAction<Date>>
  monthQuery: ReturnType<typeof useCalendarData>
}

function MonthRecurringFilter({
  visible,
  checked,
  onChange,
}: Readonly<{
  visible: boolean
  checked: boolean
  onChange: (checked: boolean) => void
}>) {
  if (!visible) return null

  return (
    <div style={{ padding: '4px 16px' }}>
      <ShowRecurringToggle checked={checked} onChange={onChange} />
    </div>
  )
}

// react-doctor-disable-next-line no-giant-component -- calendar shell hosting four distinct views (month/week/range/agenda); extraction deferred to avoid regression without visual QA https://github.com/thomasluizon/orbit-ui-mobile/issues/243
function CalendarPageContent({
  profile,
  currentMonth,
  setCurrentMonth,
  monthQuery,
}: Readonly<CalendarPageContentProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const { displayTime } = useTimeFormat()
  const { displayWeekdayDate } = useDateFormat()
  const weekStartsOn = profile.weekStartDay
  const isWideDesktop = useIsWideDesktop()
  const todayKey = useToday(profile.timeZone)
  const setShowCreateModal = useUIStore((state) => state.setShowCreateModal)

  const [view, setView] = useState<CalendarView>('month')
  const [monthSlide, setMonthSlide] = useState<MonthSlide>(null)
  const [weekAnchor, setWeekAnchor] = useState(() => new Date())
  const [weekSlide, setWeekSlide] = useState<MonthSlide>(null)
  const [rangeOffset, setRangeOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState<string | null>(() =>
    formatAPIDate(new Date()),
  )
  const [isDayDetailOpen, setIsDayDetailOpen] = useState(false)
  const [showRecurring, setShowRecurring] = useState(true)
  const { data: calendarEventsResult } = useCalendarEvents({
    enabled: profile.hasProAccess,
  })

  const { dayMap, isLoading, isFetching, error, refresh } = monthQuery

  const weekStart = useMemo(
    () => startOfWeek(weekAnchor, { weekStartsOn }),
    // react-doctor-disable-next-line exhaustive-deps -- weekStartsOn is derived from profile.weekStartDay every render and already listed; no staleness possible https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    [weekAnchor, weekStartsOn],
  )
  const weekEnd = useMemo(
    () => endOfWeek(weekAnchor, { weekStartsOn }),
    // react-doctor-disable-next-line exhaustive-deps -- weekStartsOn is derived from profile.weekStartDay every render and already listed; no staleness possible https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    [weekAnchor, weekStartsOn],
  )
  const rangeEnd = useMemo(
    () => resolveCalendarRangeEnd(parseAPIDate(todayKey), rangeOffset),
    [rangeOffset, todayKey],
  )
  const rangeBounds = useMemo(() => {
    return { lo: addDays(rangeEnd, -(MAX_RANGE_DAYS - 1)), hi: rangeEnd }
  }, [rangeEnd])

  const agendaStart = useMemo(() => parseAPIDate(todayKey), [todayKey])
  const agendaEnd = useMemo(() => addDays(agendaStart, 6), [agendaStart])

  const [gridStartDate, gridEndDate] =
    view === 'week'
      ? [weekStart, weekEnd]
      : view === 'agenda'
        ? [agendaStart, agendaEnd]
        : [rangeBounds.lo, rangeBounds.hi]

  const {
    dayMap: rangeDayMap,
    isLoading: rangeLoading,
    isFetching: rangeFetching,
    error: rangeError,
    refresh: rangeRefresh,
  } = useCalendarRange(
    gridStartDate,
    gridEndDate,
    view === 'week' || view === 'range' || view === 'agenda',
  )

  const gridColumns = useMemo<TimeGridColumn[]>(() => {
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd })
    return days.map((date) => {
      const dateStr = formatAPIDate(date)
      return {
        date,
        dateStr,
        isToday: dateStr === todayKey,
        isFuture: dateStr > todayKey,
      }
    })
  }, [weekStart, weekEnd, todayKey])

  const monthLabel = useMemo(
    () => capitalizeFirstLetter(format(currentMonth, 'MMMM', { locale: dateFnsLocale })),
    [currentMonth, dateFnsLocale],
  )
  const currentYear = currentMonth.getFullYear()

  const displayMonthDayMap = useMemo(
    () => filterRecurringDayMap(dayMap, showRecurring),
    [dayMap, showRecurring],
  )
  const displayRangeDayMap = useMemo(
    () => filterRecurringDayMap(rangeDayMap, showRecurring),
    [rangeDayMap, showRecurring],
  )

  const weekLabel = useMemo(() => {
    const startLabel = format(weekStart, 'MMM d', { locale: dateFnsLocale })
    const endLabel = isSameMonth(weekStart, weekEnd)
      ? format(weekEnd, 'd', { locale: dateFnsLocale })
      : format(weekEnd, 'MMM d', { locale: dateFnsLocale })
    return `${startLabel} - ${endLabel}`
  }, [weekStart, weekEnd, dateFnsLocale])

  const {
    dayMap: activeDayMap,
    isFetching: activeFetching,
    error: activeError,
    refresh: activeRefresh,
  } =
    view === 'month'
      ? { dayMap, isFetching, error, refresh }
      : {
          dayMap: rangeDayMap,
          isFetching: rangeFetching,
          error: rangeError,
          refresh: rangeRefresh,
        }

  const prevMonth = useCallback(() => {
    setMonthSlide('left')
    setCurrentMonth((m) => subMonths(m, 1))
  }, [setCurrentMonth])

  const nextMonth = useCallback(() => {
    setMonthSlide('right')
    setCurrentMonth((m) => addMonths(m, 1))
  }, [setCurrentMonth])

  const selectYear = useCallback((year: number) => {
    setMonthSlide(null)
    setCurrentMonth((m) => startOfMonth(setYear(m, year)))
  }, [setCurrentMonth])

  const goToCurrentMonth = useCallback(() => {
    setMonthSlide(null)
    setCurrentMonth(startOfMonth(new Date()))
  }, [setCurrentMonth])

  const prevWeek = useCallback(() => {
    setWeekSlide('left')
    setWeekAnchor((a) => subWeeks(a, 1))
  }, [])
  const nextWeek = useCallback(() => {
    setWeekSlide('right')
    setWeekAnchor((a) => addWeeks(a, 1))
  }, [])
  const goToCurrentWeek = useCallback(() => {
    setWeekSlide(null)
    setWeekAnchor(new Date())
  }, [])

  const showInlineDayPanel = isWideDesktop && view === 'month'

  const openDay = useCallback(
    (dateStr: string) => {
      setSelectedDay(dateStr)
      if (!showInlineDayPanel) setIsDayDetailOpen(true)
    },
    [showInlineDayPanel],
  )

  const previousRange = useCallback(() => {
    setRangeOffset((offset) => offset - 1)
  }, [])
  const nextRange = useCallback(() => {
    setRangeOffset((offset) => Math.min(0, offset + 1))
  }, [])

  const selectedEntries = useMemo(() => {
    if (!selectedDay) return []
    return activeDayMap.get(selectedDay) ?? []
  }, [selectedDay, activeDayMap])

  const selectedCalendarEvents = useMemo(
    () =>
      profile.hasProAccess && calendarEventsResult?.status === 'connected'
        ? filterCalendarSyncEventsByDate(calendarEventsResult.events, selectedDay)
        : [],
    [calendarEventsResult, profile.hasProAccess, selectedDay],
  )

  const dayDetailTitle = useMemo(() => {
    if (!selectedDay) return ''
    return capitalizeFirstLetter(displayWeekdayDate(parseAPIDate(selectedDay)))
  }, [selectedDay, displayWeekdayDate])

  const { monthStats } = useMemo(
    () => buildCalendarMonthModel(currentMonth, displayMonthDayMap, weekStartsOn, todayKey),
    [currentMonth, displayMonthDayMap, weekStartsOn, todayKey],
  )
  const { monthStats: sourceMonthStats } = useMemo(
    () => buildCalendarMonthModel(currentMonth, dayMap, weekStartsOn, todayKey),
    [currentMonth, dayMap, weekStartsOn, todayKey],
  )
  const showMonthRecurringToggle =
    !isLoading && currentMonth <= startOfMonth(parseAPIDate(todayKey)) && sourceMonthStats.hasEntries
  const monthDisplayState = resolveCalendarMonthDisplayState({
    currentMonth,
    today: todayKey,
    hasEntries: monthStats.hasEntries,
    isLoading,
  })

  const rangeModel = useMemo(
    () => buildCalendarRangeModel(rangeEnd, displayRangeDayMap, weekStartsOn, todayKey),
    [rangeEnd, displayRangeDayMap, weekStartsOn, todayKey],
  )

  const weekdayLabels = useMemo(() => {
    const mondayFirst = [
      t('dates.daysShort.monday'),
      t('dates.daysShort.tuesday'),
      t('dates.daysShort.wednesday'),
      t('dates.daysShort.thursday'),
      t('dates.daysShort.friday'),
      t('dates.daysShort.saturday'),
      t('dates.daysShort.sunday'),
    ]
    return weekStartsOn === 0 ? [mondayFirst[6]!, ...mondayFirst.slice(0, 6)] : mondayFirst
  }, [t, weekStartsOn])

  const rangeLabel = useMemo(() => {
    const pattern = locale === 'pt-BR' ? 'd MMM' : 'MMM d'
    return t('calendar.range.label', {
      start: format(rangeModel.start, pattern, { locale: dateFnsLocale }),
      end: format(rangeModel.end, pattern, { locale: dateFnsLocale }),
    })
  }, [dateFnsLocale, locale, rangeModel.end, rangeModel.start, t])

  const monthStatTiles = useMemo(
    () => [
      { key: 'bestStreak', value: monthStats.bestStreak, label: t('calendar.bestStreak') },
      { key: 'totalLogs', value: monthStats.totalLogs, label: t('calendar.totalLogs') },
      { key: 'missed', value: monthStats.missed, label: t('calendar.missedCount') },
    ] as const,
    [monthStats, t],
  )

  const rangeStatTiles = useMemo(
    () => [
      { key: 'bestStreak', value: rangeModel.stats.bestStreak, label: t('calendar.bestStreak') },
      { key: 'totalLogs', value: rangeModel.stats.totalLogs, label: t('calendar.totalLogs') },
      { key: 'missed', value: rangeModel.stats.missed, label: t('calendar.missedCount') },
    ] as const,
    [rangeModel.stats, t],
  )

  const viewOptions = useMemo(
    () => [
      { value: 'month' as const, label: t('calendar.view.month') },
      { value: 'week' as const, label: t('calendar.view.week') },
      { value: 'range' as const, label: t('calendar.view.range') },
      { value: 'agenda' as const, label: t('calendar.view.agenda') },
    ] as const,
    [t],
  )

  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY }
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStart.current === null) return
    const touch = e.changedTouches[0]
    const start = touchStart.current
    touchStart.current = null
    if (!touch) return
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.abs(deltaX) <= CALENDAR_MONTH_SWIPE_THRESHOLD) return
    if (Math.abs(deltaX) <= Math.abs(deltaY) * CALENDAR_HORIZONTAL_SWIPE_DIRECTION_RATIO) return
    if (deltaX < 0) {
      setMonthSlide('right')
      setCurrentMonth((m) => addMonths(m, 1))
    } else {
      setMonthSlide('left')
      setCurrentMonth((m) => subMonths(m, 1))
    }
  }, [setCurrentMonth])

  const monthSlideClass = resolveMonthSlideClass(monthSlide)

  const openHabitCreation = useCallback(() => {
    setShowCreateModal(true)
  }, [setShowCreateModal])

  const calendarHeader = (
    <CalendarHeader
      monthLabel={monthLabel}
      year={currentYear}
      previousMonthLabel={t('common.previousMonth')}
      nextMonthLabel={t('common.nextMonth')}
      currentMonthLabel={t('calendar.goToCurrentMonth')}
      selectYearLabel={t('common.selectYear')}
      onPreviousMonth={prevMonth}
      onNextMonth={nextMonth}
      onCurrentMonth={goToCurrentMonth}
      onSelectYear={selectYear}
    />
  )

  return (
    <div className="relative">
      <div className="relative z-[1]">
        <div style={{ padding: '12px 16px 16px' }}>
          <SegmentedControl<CalendarView>
            options={viewOptions}
            value={view}
            onChange={setView}
            label={t('calendar.view.switchLabel')}
          />
        </div>

        <div
          className={`loading-bar w-full transition-opacity duration-[var(--dur-slow)] ${
            activeFetching ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />

        {view === 'range' && calendarHeader}

        {activeError ? (
          <div style={{ padding: '12px 16px 16px' }}>
            <CalendarLoadError onRetry={() => void activeRefresh()} />
          </div>
        ) : (
          <>
            {view === 'month' && (
              <div className="lg:grid lg:grid-cols-[minmax(440px,55%)_minmax(0,1fr)] lg:items-start">
                <div>
                  {calendarHeader}
                  <div
                    key={format(currentMonth, 'yyyy-MM')}
                    className={monthSlideClass}
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
                  </div>

                  <CalendarMonthLegend
                    state={monthDisplayState}
                    loggableLabel={t('calendar.legend.loggable')}
                    fullLabel={t('calendar.dayCell.full')}
                    partialLabel={t('calendar.dayCell.partial')}
                    noneLabel={t('calendar.dayCell.none')}
                  />

                  <MonthRecurringFilter
                    visible={showMonthRecurringToggle}
                    checked={showRecurring}
                    onChange={setShowRecurring}
                  />

                  <CalendarMonthFeedback
                    state={monthDisplayState}
                    emptyText={t('calendar.emptyMonth')}
                    futureText={t('calendar.futureMonth')}
                    createLabel={t('habits.createHabit')}
                    createVariant={isWideDesktop ? 'secondary' : 'primary'}
                    onCreate={openHabitCreation}
                  />

                  <CalendarStats
                    stats={monthStatTiles}
                    state={calendarStatState(monthDisplayState)}
                    loadingLabel={t('calendar.loading')}
                    emptyLabel={t('calendar.emptyStat')}
                  />
                </div>

                <CalendarInlineDayPanel
                  show={showInlineDayPanel}
                  state={monthDisplayState}
                  loadingLabel={t('calendar.loading')}
                  title={dayDetailTitle}
                  selectedDay={selectedDay}
                  entries={selectedEntries}
                  calendarEvents={selectedCalendarEvents}
                  showRecurring={showRecurring}
                  showRecurringToggle={!showMonthRecurringToggle}
                  onShowRecurringChange={setShowRecurring}
                />
              </div>
            )}

            {view === 'week' && (
              <CalendarWeekView
                columns={gridColumns}
                dayMap={displayRangeDayMap}
                weekLabel={weekLabel}
                previousWeekLabel={t('common.previousWeek')}
                nextWeekLabel={t('common.nextWeek')}
                currentWeekLabel={t('calendar.goToCurrentWeek')}
                slideDirection={weekSlide}
                isLoading={rangeLoading}
                onPreviousWeek={prevWeek}
                onNextWeek={nextWeek}
                onCurrentWeek={goToCurrentWeek}
                onSelectDay={openDay}
                displayTime={displayTime}
                dateFnsLocale={dateFnsLocale}
                allDayLabel={t('calendar.timeGrid.noSetTime')}
                nowLabel={t('calendar.timeGrid.now')}
                timeZone={profile.timeZone}
                showRecurring={showRecurring}
                onShowRecurringChange={setShowRecurring}
              />
            )}

            {view === 'range' && (
              <CalendarRangeView
                model={rangeModel}
                weekdayLabels={weekdayLabels}
                rangeLabel={rangeLabel}
                previousRangeLabel={t('calendar.range.previous')}
                nextRangeLabel={t('calendar.range.next')}
                onPreviousRange={previousRange}
                onNextRange={nextRange}
                nextRangeDisabled={rangeOffset === 0}
                isLoading={rangeLoading}
                loadingLabel={t('common.loading')}
                stats={rangeStatTiles}
                showRecurring={showRecurring}
                onShowRecurringChange={setShowRecurring}
              />
            )}

            {view === 'agenda' && (
              <CalendarAgendaView
                startDate={agendaStart}
                dayMap={rangeDayMap}
                displayTime={displayTime}
                displayWeekdayDate={displayWeekdayDate}
                todayKey={todayKey}
                isLoading={rangeLoading}
                loadingLabel={t('common.loading')}
              />
            )}
          </>
        )}
      </div>

      {isDayDetailOpen && !showInlineDayPanel ? (<Sheet
        open
        onClose={() => (setIsDayDetailOpen)(false)}
        title={dayDetailTitle}
      >
        <CalendarDayDetail
          dateStr={selectedDay}
          entries={selectedEntries}
          calendarEvents={selectedCalendarEvents}
          showRecurring={showRecurring}
          onShowRecurringChange={setShowRecurring}
        />
      </Sheet>) : null}
    </div>
  )
}
