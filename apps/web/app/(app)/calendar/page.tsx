'use client'

import { useState, useMemo, useCallback, useEffect, useRef, type Dispatch, type SetStateAction, type ReactNode } from 'react'
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
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  formatAPIDate,
  parseAPIDate,
  capitalizeFirstLetter,
  filterCalendarSyncEventsByDate,
  isCalendarDayLoggable,
  buildCalendarRangeModel,
  CALENDAR_HORIZONTAL_SWIPE_DIRECTION_RATIO,
  CALENDAR_MONTH_SWIPE_THRESHOLD,
  filterRecurringDayMap,
  MAX_RANGE_DAYS,
  resolveCalendarRangeEnd,
  resolveCalendarMonthDisplayState,
  resolveCalendarEventsDisplayState,
  type CalendarMonthDisplayState,
  getFriendlyErrorMessage,
  calendarMonthForDay,
} from '@orbit/shared/utils'
import { getCalendarEntryMutationKey } from '@orbit/shared/hooks'
import { useCalendarEntryMutationLock } from '@/hooks/use-calendar-entry-mutation-lock'
import { useCalendarData, useCalendarRange } from '@/hooks/use-calendar-data'
import { useCalendarEvents } from '@/hooks/use-calendar-events'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import {
  useCalendarAutoSyncState,
  useSetCalendarAutoSync,
} from '@/hooks/use-calendar-auto-sync'
import { useLogHabit } from '@/hooks/use-habits'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useDateFormat } from '@/hooks/use-date-format'
import { useProfile } from '@/hooks/use-profile'
import { buildCalendarMonthModel } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { Profile } from '@orbit/shared/types/profile'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
import { CalendarStats } from '@/components/calendar/calendar-stats'
import { CalendarWeekView } from '@/components/calendar/calendar-week-view'
import { CalendarRangeView } from '@/components/calendar/calendar-range-view'
import { CalendarAgendaView } from '@/components/calendar/calendar-agenda-view'
import { CalendarLoadError } from '@/components/calendar/calendar-load-error'
import { ShowRecurringToggle } from '@/components/calendar/show-recurring-toggle'
import type { TimeGridColumn } from '@/components/calendar/calendar-time-grid'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { useUIStore } from '@/stores/ui-store'
import { useOffline } from '@/hooks/use-offline'
import { OfflineRefusal } from '@/components/ui/offline-refusal'
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

function CalendarDayCardSlot({ loading, label, children }: Readonly<{ loading: boolean; label: string; children: ReactNode }>) {
  return <div style={{ paddingInline: 16, paddingBlockStart: 24 }}>{loading ? (
    <div data-testid="calendar-day-skeleton" className="rounded-[var(--r-card)] bg-[var(--bg-card)] shadow-[inset_0_0_0_1px_var(--hairline-ghost)]" style={{ paddingBlock: 24 }}>
      <Skeleton variant="settings" rows={5} label={label} />
    </div>
  ) : children}</div>
}

function calendarActionVariant(wide: boolean): 'primary' | 'secondary' {
  return wide ? 'secondary' : 'primary'
}

function resolveMonthSlideClass(monthSlide: MonthSlide): string {
  if (monthSlide === 'right') return 'animate-slide-date-right'
  if (monthSlide === 'left') return 'animate-slide-date-left'
  return ''
}

export default function CalendarPage() {
  const { profile, error: profileError, refetch: refetchProfile } = useProfile()
  const [selectedDay, setSelectedDay] = useAccountScopedState(() => formatAPIDate(new Date()))
  const currentMonth = useMemo(() => calendarMonthForDay(selectedDay), [selectedDay])
  const [view, setView] = useState<CalendarView>('month')
  const monthQuery = useCalendarData(currentMonth)
  if (!profile) return (
    <CalendarProfileState
      currentMonth={currentMonth}
      setSelectedDay={setSelectedDay}
      view={view}
      setView={setView}
      error={profileError}
      onRetry={() => void refetchProfile()}
    />
  )

  return (
    <CalendarPageContent
      profile={profile}
      currentMonth={currentMonth}
      selectedDay={selectedDay}
      setSelectedDay={setSelectedDay}
      monthQuery={monthQuery}
      view={view}
      setView={setView}
    />
  )
}

function CalendarProfileState({
  currentMonth,
  setSelectedDay,
  view,
  setView,
  error,
  onRetry,
}: Readonly<{
  currentMonth: Date
  setSelectedDay: Dispatch<SetStateAction<string>>
  view: CalendarView
  setView: Dispatch<SetStateAction<CalendarView>>
  error: Error | null
  onRetry: () => void
}>) {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  return (
      <div className="flex min-w-0 flex-col">
        <h1 className="sr-only" tabIndex={-1}>{t('nav.calendar')}</h1>
        {error ? (
          <CalendarLoadError onRetry={onRetry} />
        ) : (
          <>
            <CalendarHeader
              monthLabel={capitalizeFirstLetter(format(currentMonth, 'MMMM', { locale: dateFnsLocale }))}
              year={currentMonth.getFullYear()}
              previousMonthLabel={t('common.previousMonth')}
              nextMonthLabel={t('common.nextMonth')}
              currentMonthLabel={t('calendar.goToCurrentMonth')}
              selectYearLabel={t('common.selectYear')}
              onPreviousMonth={() => setSelectedDay(formatAPIDate(subMonths(currentMonth, 1)))}
              onNextMonth={() => setSelectedDay(formatAPIDate(addMonths(currentMonth, 1)))}
              onCurrentMonth={() => setSelectedDay(formatAPIDate(new Date()))}
              onSelectYear={(year) => setSelectedDay(formatAPIDate(startOfMonth(setYear(currentMonth, year))))}
              showMonthNavigation={view === 'month'}
              viewSelector={<SegmentedControl<CalendarView> options={[
                { value: 'month', label: t('calendar.view.month') },
                { value: 'week', label: t('calendar.view.week') },
                { value: 'range', label: t('calendar.view.range') },
                { value: 'agenda', label: t('calendar.view.agenda') },
              ]} value={view} onChange={setView} label={t('calendar.view.switchLabel')} />}
            />
            <CalendarGrid currentMonth={currentMonth} dayMap={new Map()} onSelectDay={() => undefined} selectedDateStr={null} isLoading weekStartsOn={1} todayKey={formatAPIDate(new Date())} />
            <CalendarDayCardSlot loading label={t('calendar.loading')}>{null}</CalendarDayCardSlot>
            <div style={{ paddingBlockStart: 24 }}><CalendarStats
              stats={[
                { key: 'bestStreak', value: 0, label: t('calendar.bestStreak') },
                { key: 'totalLogs', value: 0, label: t('calendar.totalLogs') },
                { key: 'missed', value: 0, label: t('calendar.missedCount') },
              ]}
              state="loading"
              loadingLabel={t('calendar.loading')}
            /></div>
          </>
        )}
      </div>
    )
}

interface CalendarPageContentProps {
  profile: Pick<
    Profile,
    | 'weekStartDay'
    | 'timeZone'
    | 'hasProAccess'
    | 'hasGoogleConnection'
    | 'googleCalendarAutoSyncEnabled'
    | 'googleCalendarAutoSyncStatus'
    | 'googleCalendarLastSyncedAt'
  >
  currentMonth: Date
  selectedDay: string
  setSelectedDay: Dispatch<SetStateAction<string>>
  monthQuery: ReturnType<typeof useCalendarData>
  view: CalendarView
  setView: Dispatch<SetStateAction<CalendarView>>
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
  selectedDay,
  setSelectedDay,
  monthQuery,
  view,
  setView,
}: Readonly<CalendarPageContentProps>) {
  const router = useRouter()
  const t = useTranslations()
  const { sheetRef, closeSheet } = useSheetHost()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const { displayTime } = useTimeFormat()
  const { displayWeekdayDate } = useDateFormat()
  const weekStartsOn = profile.weekStartDay
  const isWideDesktop = useIsWideDesktop()
  const todayKey = useToday(profile.timeZone)
  const setShowCreateModal = useUIStore((state) => state.setShowCreateModal)
  const { isOnline } = useOffline()
  const [showCreateRefusal, setShowCreateRefusal] = useAccountScopedState(false)
  useEffect(() => { if (isOnline) setShowCreateRefusal(false) }, [isOnline, setShowCreateRefusal])
  const logHabit = useLogHabit()

  const [monthSlide, setMonthSlide] = useState<MonthSlide>(null)
  const [weekAnchor, setWeekAnchor] = useState(() => new Date())
  const [weekSlide, setWeekSlide] = useState<MonthSlide>(null)
  const [rangeOffset, setRangeOffset] = useState(0)
  const [isDayDetailOpen, setIsDayDetailOpen] = useAccountScopedState(false)
  const [showRecurring, setShowRecurring] = useState(true)
  const {
    data: calendarEventsResult,
    isPending: calendarEventsPending,
    error: calendarEventsError,
    refetch: refetchCalendarEvents,
  } = useCalendarEvents({
    enabled: profile.hasProAccess,
    timeZone: profile.timeZone,
  })
  const { data: autoSyncState } = useCalendarAutoSyncState({
    enabled: profile.hasProAccess,
    initialData: {
      enabled: profile.googleCalendarAutoSyncEnabled,
      status: profile.googleCalendarAutoSyncStatus,
      lastSyncedAt: profile.googleCalendarLastSyncedAt,
      hasGoogleConnection: profile.hasGoogleConnection,
    },
  })
  const setCalendarAutoSync = useSetCalendarAutoSync()

  const handleCalendarAutoSyncChange = useCallback(async (enabled: boolean) => {
    const requestAccount = getAccountGeneration()
    try {
      await setCalendarAutoSync.mutateAsync({ enabled })
    } catch (error: unknown) {
      if (getAccountGeneration() !== requestAccount) return
      toast.error(getFriendlyErrorMessage(
        error,
        t,
        'calendar.autoSync.syncFailed',
        'generic',
      ))
    }
  }, [setCalendarAutoSync, t])

  const openOrbitPro = useCallback(() => {
    closeSheet(() => {
      setIsDayDetailOpen(false)
      router.push('/upgrade')
    })
  }, [closeSheet, router, setIsDayDetailOpen])
  const calendarEventsState = resolveCalendarEventsDisplayState({
    enabled: profile.hasProAccess,
    isPending: calendarEventsPending,
    error: calendarEventsError,
    resultStatus: calendarEventsResult?.status,
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
    const month = subMonths(currentMonth, 1)
    setSelectedDay(formatAPIDate(month))
  }, [currentMonth, setSelectedDay])

  const nextMonth = useCallback(() => {
    setMonthSlide('right')
    const month = addMonths(currentMonth, 1)
    setSelectedDay(formatAPIDate(month))
  }, [currentMonth, setSelectedDay])

  const selectYear = useCallback((year: number) => {
    setMonthSlide(null)
    const month = startOfMonth(setYear(currentMonth, year))
    setSelectedDay(formatAPIDate(month))
  }, [currentMonth, setSelectedDay])

  const goToCurrentMonth = useCallback(() => {
    setMonthSlide(null)
    setSelectedDay(todayKey)
  }, [setSelectedDay, todayKey])

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

  const openDay = useCallback(
    (dateStr: string) => {
      setSelectedDay(dateStr)
      if (view === 'week') setIsDayDetailOpen(true)
    },
    [setIsDayDetailOpen, setSelectedDay, view],
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

  const selectedDayLoggable = isCalendarDayLoggable(selectedDay, todayKey)

  const selectedEntrySourceStates = useMemo(() => {
    const sourceStates = new Map<string, boolean>()
    if (!selectedDay) return sourceStates
    for (const entry of selectedEntries) {
      sourceStates.set(
        getCalendarEntryMutationKey(selectedDay, entry.habitId),
        entry.status === 'completed',
      )
    }
    return sourceStates
  }, [selectedDay, selectedEntries])
  const { pendingEntryStates, startEntryMutation } = useCalendarEntryMutationLock(
    selectedEntrySourceStates,
  )

  function changeSelectedEntry(
    entry: CalendarDayEntry,
    checked: boolean,
  ): Promise<unknown> | null {
    if (!selectedDay) return null
    const entryKey = getCalendarEntryMutationKey(selectedDay, entry.habitId)
    return startEntryMutation(
      entryKey,
      checked,
      () => logHabit.mutateAsync({
        habitId: entry.habitId,
        date: selectedDay,
        intent: checked ? 'log' : 'unlog',
      }),
    )
  }

  const dayDetailTitle = useMemo(() => {
    if (!selectedDay) return ''
    return capitalizeFirstLetter(displayWeekdayDate(parseAPIDate(selectedDay)))
  }, [selectedDay, displayWeekdayDate])

  const { monthStats } = useMemo(
    () => buildCalendarMonthModel(currentMonth, displayMonthDayMap, weekStartsOn, todayKey),
    [currentMonth, displayMonthDayMap, weekStartsOn, todayKey],
  )
  const showMonthRecurringToggle = !isLoading && [...dayMap.values()].some((entries) => entries.length > 0)
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
      nextMonth()
    } else {
      prevMonth()
    }
  }, [nextMonth, prevMonth])

  const monthSlideClass = resolveMonthSlideClass(monthSlide)

  const openHabitCreation = useCallback(() => {
    if (!isOnline) { setShowCreateRefusal(true); return }
    setShowCreateModal(true)
  }, [isOnline, setShowCreateRefusal, setShowCreateModal])

  const viewSelector = (
    <SegmentedControl<CalendarView>
      options={viewOptions}
      value={view}
      onChange={setView}
      label={t('calendar.view.switchLabel')}
    />
  )
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
      viewSelector={viewSelector}
      showMonthNavigation={view === 'month'}
    />
  )

  return (
    <div className="relative">
      <h1 className="sr-only" tabIndex={-1}>{t('nav.calendar')}</h1>
      <div className="relative z-[1]">
        {calendarHeader}

        <div
          className={`loading-bar w-full transition-opacity duration-[var(--dur-slow)] ${
            activeFetching ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />

        {activeError ? (
          <div style={{ padding: '12px 16px 16px' }}>
            <CalendarLoadError onRetry={() => void activeRefresh()} />
          </div>
        ) : (
          <>
            {view === 'month' && (
              <div className="flex min-w-0 flex-col">
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
                    createVariant={calendarActionVariant(isWideDesktop)}
                    onCreate={openHabitCreation}
                    createRefusal={monthDisplayState === 'empty' && showCreateRefusal && !isOnline ? <OfflineRefusal icon="create" title={t('offline.create.title')} reason={t('offline.create.reason')} /> : null}
                  />

                  <CalendarDayCardSlot loading={monthDisplayState === 'loading'} label={t('calendar.loading')}>
                    <CalendarDayDetail
                        dateStr={selectedDay}
                        entries={selectedEntries}
                        calendarEvents={selectedCalendarEvents}
                        autoSyncState={autoSyncState}
                        calendarEventsState={calendarEventsState}
                        onRetryCalendarEvents={() => void refetchCalendarEvents()}
                        onReconnectCalendarEvents={() => router.push('/calendar-sync')}
                        onViewPro={openOrbitPro}
                        loggable={selectedDayLoggable}
                        showRecurring={showRecurring}
                        pendingEntryStates={pendingEntryStates}
                        onCalendarAutoSyncChange={handleCalendarAutoSyncChange}
                        onEntryChange={changeSelectedEntry}
                        proActionVariant={calendarActionVariant(isWideDesktop)}
                      />
                  </CalendarDayCardSlot>
                  <div style={{ paddingBlockStart: 24 }}><CalendarStats
                    stats={monthStatTiles}
                    state={calendarStatState(monthDisplayState)}
                    loadingLabel={t('calendar.loading')}
                    emptyLabel={t('calendar.emptyStat')}
                  /></div>
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

      {isDayDetailOpen && view === 'week' ? (<Sheet
        ref={sheetRef}
        open
        onClose={() => (setIsDayDetailOpen)(false)}
        title={dayDetailTitle}
      >
        <CalendarDayDetail
          dateStr={selectedDay}
          showTitle={false}
          entries={selectedEntries}
          calendarEvents={selectedCalendarEvents}
          autoSyncState={autoSyncState}
          calendarEventsState={calendarEventsState}
          onRetryCalendarEvents={() => void refetchCalendarEvents()}
          onReconnectCalendarEvents={() => router.push('/calendar-sync')}
          onViewPro={openOrbitPro}
          loggable={selectedDayLoggable}
          showRecurring={showRecurring}
          pendingEntryStates={pendingEntryStates}
          onCalendarAutoSyncChange={handleCalendarAutoSyncChange}
          onEntryChange={changeSelectedEntry}
        />
      </Sheet>) : null}
    </div>
  )
}
