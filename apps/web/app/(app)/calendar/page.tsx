'use client'

import { PersonalText } from '@/components/ui/personal-text'

import { useCalendars } from '@/hooks/use-calendars'

import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef, Suspense, type Dispatch, type SetStateAction, type ReactNode } from 'react'
import {
  addMonths,
  addDays,
  subMonths,
  addWeeks,
  subWeeks,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
} from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  formatAPIDate,
  formatWeekdayLabels,
  parseAPIDate,
  formatCalendarSpanEnds,
  formatCalendarDayTitle,
  orderCalendarDayEntries,
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
  calendarMonthForDay,
  shouldOpenCalendarImportSheet,
  calendarImportTitleKey,
  calendarImportRouteRequestKey,
} from '@orbit/shared/utils'
import { getCalendarEntryMutationKey } from '@orbit/shared/hooks'
import { useCalendarEntryMutationLock } from '@/hooks/use-calendar-entry-mutation-lock'
import { useCalendarData, useCalendarRange } from '@/hooks/use-calendar-data'
import { useCalendarEvents } from '@/hooks/use-calendar-events'
import { useAccountBoundRouteRequest, useAccountScopedState } from '@/hooks/use-session-reset'
import {
  useCalendarAutoSyncState,
} from '@/hooks/use-calendar-auto-sync'
import { useLogHabit } from '@/hooks/use-habits'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useProfile } from '@/hooks/use-profile'
import { buildCalendarMonthModel } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { Profile } from '@orbit/shared/types/profile'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
import { CalendarDayEvents } from '@/components/calendar/calendar-day-events'
import { CalendarImportContent, type CalendarImportActionHandle, type CalendarImportActionState } from '@/components/calendar-sync/calendar-import-content'
import { CalendarStats } from '@/components/calendar/calendar-stats'
import { CalendarWeekView } from '@/components/calendar/calendar-week-view'
import { CalendarRangeView } from '@/components/calendar/calendar-range-view'
import { CalendarAgendaView } from '@/components/calendar/calendar-agenda-view'
import { CalendarLoadError } from '@/components/calendar/calendar-load-error'
import type { TimeGridColumn } from '@/components/calendar/calendar-time-grid'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { plural } from '@/lib/plural'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { useUIStore } from '@/stores/ui-store'
import { useOffline } from '@/hooks/use-offline'
import { OfflineRefusal } from '@/components/ui/offline-refusal'
import { useToday } from '../today-provider'
import { CalendarOptions } from './_components/calendar-options'
import {
  CalendarHeader,
} from './_components/calendar-shell'

import { useCalendarNavigation, type CalendarView } from '@/hooks/use-calendar-navigation'

type MonthSlide = 'left' | 'right' | null

function calendarDateFnsLocale(locale: string) {
  return locale === 'pt-BR' ? ptBR : enUS
}

function calendarWithoutImport(search: string): string {
  const params = new URLSearchParams(search)
  params.delete('mode')
  params.delete('import')
  return params.size ? `/calendar?${params}` : '/calendar'
}

function useClearStaleCalendarImportRoute(routeRequestKey: string, importRequested: boolean) {
  const router = useRouter()
  const search = useSearchParams().toString()
  useEffect(() => {
    if (routeRequestKey && !importRequested) router.replace(calendarWithoutImport(search))
  }, [routeRequestKey, importRequested, router, search])
}

function CalendarImportActions({ state, onImport, t }: {
  state: CalendarImportActionState;
  onImport: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return <PillButton size="sm" disabled={state.disabled} onClick={onImport}>
    {plural(t('calendar.importButton', { count: state.count }), state.count)}
  </PillButton>
}

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

function CalendarDayCardSlot({ loading, label, children }: Readonly<{ loading: boolean; label: string; children: ReactNode }>) {
  return <div data-testid="calendar-day-card-slot" style={{ paddingInline: 16, paddingBlockStart: 24 }}>{loading ? (
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
  return <Suspense fallback={null}><CalendarPageState /></Suspense>
}

function CalendarPageState() {
  const { profile, error: profileError, refetch: refetchProfile } = useProfile()
  const navigation = useCalendarNavigation()
  const { selectedDay, setSelectedDay, view, setView } = navigation
  const currentMonth = useMemo(() => calendarMonthForDay(selectedDay), [selectedDay])
  const monthQuery = useCalendarData(currentMonth)

  return (
    <CalendarPageContent
      navigation={navigation}
      profile={profile}
      profileError={profileError}
      onRetryProfile={() => void refetchProfile()}
      currentMonth={currentMonth}
      selectedDay={selectedDay}
      setSelectedDay={setSelectedDay}
      monthQuery={{ ...monthQuery, isLoading: !profile || monthQuery.isLoading }}
      view={view}
      setView={setView}
    />
  )
}

function CalendarBody({ profileReady, profileError, onRetryProfile, error, onRetry, children }: Readonly<{
  profileReady: boolean
  profileError: Error | null
  onRetryProfile: () => void
  error: string | null
  onRetry: () => void
  children: ReactNode
}>) {
  if (!profileReady && profileError) return <CalendarLoadError onRetry={onRetryProfile} />
  if (profileReady && error) return <div style={{ padding: '0 16px 16px' }}><CalendarLoadError onRetry={onRetry} /></div>
  return children
}

interface CalendarPageContentProps {
  navigation: ReturnType<typeof useCalendarNavigation>
  profile: Pick<
    Profile,
    | 'weekStartDay'
    | 'timeZone'
    | 'hasProAccess'
    | 'hasGoogleConnection'
    | 'googleCalendarAutoSyncEnabled'
    | 'googleCalendarAutoSyncStatus'
    | 'googleCalendarLastSyncedAt'
  > | undefined
  profileError: Error | null
  onRetryProfile: () => void
  currentMonth: Date
  selectedDay: string
  setSelectedDay: Dispatch<SetStateAction<string>>
  monthQuery: ReturnType<typeof useCalendarData>
  view: CalendarView
  setView: Dispatch<SetStateAction<CalendarView>>
}


function resolveProfileSettings(profile: CalendarPageContentProps['profile']) {
  return {
    weekStartsOn: profile?.weekStartDay ?? 1,
    hasProAccess: profile?.hasProAccess ?? false,
    timeZone: profile?.timeZone ?? null,
    autoSyncState: profile ? {
      enabled: profile.googleCalendarAutoSyncEnabled,
      status: profile.googleCalendarAutoSyncStatus,
      lastSyncedAt: profile.googleCalendarLastSyncedAt,
      hasGoogleConnection: profile.hasGoogleConnection,
    } : undefined,
  };
}

function calendarPageLayout(view: CalendarView, profileReady: boolean, profileHasError: boolean, hasDataError: boolean, header: ReactNode) {
  const hasError = profileReady ? hasDataError : profileHasError
  const fillsPage = view === 'week' && !hasError
  return {
    viewportProps: { 'data-page-viewport': fillsPage ? '' : undefined },
    pageClass: fillsPage ? 'relative flex h-full min-h-0 flex-col' : 'relative',
    contentClass: fillsPage ? 'relative z-[1] flex min-h-0 flex-1 flex-col' : 'relative z-[1]',
    header: <div className="shrink-0">{header}</div>,
  }
}

// react-doctor-disable-next-line no-giant-component -- calendar shell hosting four distinct views (month/week/range/agenda); extraction deferred to avoid regression without visual QA https://github.com/thomasluizon/orbit-ui-mobile/issues/243
function CalendarPageContent({
  navigation,
  profile,
  profileError,
  onRetryProfile,
  currentMonth,
  selectedDay,
  setSelectedDay,
  monthQuery,
  view,
  setView,
}: Readonly<CalendarPageContentProps>) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()
  const { sheetRef, closeSheet } = useSheetHost()
  const { sheetRef: importSheetRef, closeSheet: closeImportSheet } = useSheetHost()
  const locale = useLocale()
  const dateFnsLocale = calendarDateFnsLocale(locale)
  const { displayTime } = useTimeFormat()
  const { weekStartsOn, hasProAccess, timeZone, autoSyncState } = resolveProfileSettings(profile)
  const isWideDesktop = useIsWideDesktop()
  const todayKey = useToday(profile?.timeZone)
  const setShowCreateModal = useUIStore((state) => state.setShowCreateModal)
  const setCalendarHasError = useUIStore((state) => state.setCalendarHasError)
  const { isOnline } = useOffline()
  const [showCreateRefusal, setShowCreateRefusal] = useAccountScopedState(false)
  useEffect(() => { if (isOnline) setShowCreateRefusal(false) }, [isOnline, setShowCreateRefusal])
  const logHabit = useLogHabit()

  const [monthSlide, setMonthSlide] = useState<MonthSlide>(null)
  const { weekAnchor, setWeekAnchor, agendaOffset, setAgendaOffset, rangeOffset, setRangeOffset } = navigation
  const [weekSlide, setWeekSlide] = useState<MonthSlide>(null)
  const [isDayDetailOpen, setIsDayDetailOpen] = useAccountScopedState(false)
  const [isEventsOpen, setIsEventsOpen] = useAccountScopedState(false)
  const [expandedHabitTitle, setExpandedHabitTitle] = useAccountScopedState<string | null>(null)
  const disclosedWeekDay = view === 'week' ? selectedDay : null
  const openGoogleCalendar = () => {
    if (hasProAccess) openImport(null)
    else router.push('/upgrade')
  }
  const openDayDisclosure = (open: () => void) => closeSheet(() => { setIsDayDetailOpen(false); open() })
  const [isImportOpen, setIsImportOpen] = useAccountScopedState(false)
  const [importActionState, setImportActionState] = useAccountScopedState<CalendarImportActionState | null>(null)
  const importActionRef = useRef<CalendarImportActionHandle>(null)
  const commitCalendarImport = useCallback(() => importActionRef.current?.importSelected(), [])
  const [initialImportEventId, setInitialImportEventId] = useAccountScopedState<string | null>(null)
  const search = searchParams.toString()
  const reviewRequested = searchParams.get('mode') === 'review'
  const routeRequestKey = calendarImportRouteRequestKey(reviewRequested, searchParams.get('import') === '1')
  const importRequested = useAccountBoundRouteRequest(routeRequestKey)
  useClearStaleCalendarImportRoute(routeRequestKey, importRequested)
  const showImportSheet = shouldOpenCalendarImportSheet(hasProAccess, isImportOpen, importRequested)

  const openImport = useCallback((eventId: string | null) => {
    const open = () => {
      setIsDayDetailOpen(false)
      setInitialImportEventId(eventId)
      setIsImportOpen(true)
    }
    if (isDayDetailOpen && view === 'week') closeSheet(open)
    else open()
  }, [closeSheet, isDayDetailOpen, setIsDayDetailOpen, setInitialImportEventId, setIsImportOpen, view])

  const closeImport = useCallback(() => {
    setIsImportOpen(false)
    setInitialImportEventId(null)
    if (importRequested) router.replace(calendarWithoutImport(search), { scroll: false })
  }, [importRequested, router, search, setInitialImportEventId, setIsImportOpen])
  const { data: connectedCalendars } = useCalendars({ enabled: hasProAccess })
  const showEventSource = (connectedCalendars?.length ?? 0) > 1
  const showRecurring = useUIStore((state) => state.calendarShowRecurring)
  const {
    data: calendarEventsResult,
    isPending: calendarEventsPending,
    error: calendarEventsError,
    refetch: refetchCalendarEvents,
  } = useCalendarEvents({
    enabled: hasProAccess,
    timeZone: timeZone,
  })
  useCalendarAutoSyncState({
    enabled: hasProAccess,
    initialData: autoSyncState,
  })
  const openOrbitPro = useCallback(() => {
    closeSheet(() => {
      setIsDayDetailOpen(false)
      router.push('/upgrade')
    })
  }, [closeSheet, router, setIsDayDetailOpen])
  const calendarEventsState = resolveCalendarEventsDisplayState({
    enabled: hasProAccess,
    isPending: calendarEventsPending,
    error: calendarEventsError,
    resultStatus: calendarEventsResult?.status,
  })

  const { dayMap, isLoading, error, refresh } = monthQuery

  const weekStart = useMemo(
    () => startOfWeek(weekAnchor ?? parseAPIDate(todayKey), { weekStartsOn }),
    // react-doctor-disable-next-line exhaustive-deps -- weekStartsOn is derived from profile.weekStartDay every render and already listed; no staleness possible https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    [todayKey, weekAnchor, weekStartsOn],
  )
  const weekEnd = useMemo(
    () => endOfWeek(weekAnchor ?? parseAPIDate(todayKey), { weekStartsOn }),
    // react-doctor-disable-next-line exhaustive-deps -- weekStartsOn is derived from profile.weekStartDay every render and already listed; no staleness possible https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    [todayKey, weekAnchor, weekStartsOn],
  )
  const rangeEnd = useMemo(
    () => resolveCalendarRangeEnd(parseAPIDate(todayKey), rangeOffset),
    [rangeOffset, todayKey],
  )
  const rangeBounds = useMemo(() => {
    return { lo: addDays(rangeEnd, -(MAX_RANGE_DAYS - 1)), hi: rangeEnd }
  }, [rangeEnd])

  const agendaStart = useMemo(() => addDays(parseAPIDate(todayKey), agendaOffset * 7), [agendaOffset, todayKey])
  const agendaEnd = useMemo(() => addDays(agendaStart, 6), [agendaStart])

  const [gridStartDate, gridEndDate] =
    view === 'week'
      ? [weekStart, weekEnd]
      : view === 'agenda'
        ? [agendaStart, agendaEnd]
        : [rangeBounds.lo, rangeBounds.hi]

  const {
    dayMap: rangeDayMap,
    isLoading: rangeQueryLoading,
    error: rangeError,
    refresh: rangeRefresh,
  } = useCalendarRange(
    gridStartDate,
    gridEndDate,
    Boolean(profile) && (view === 'week' || view === 'range' || view === 'agenda'),
  )

  const rangeLoading = !profile || rangeQueryLoading

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



  const displayMonthDayMap = useMemo(
    () => filterRecurringDayMap(dayMap, showRecurring),
    [dayMap, showRecurring],
  )
  const displayRangeDayMap = useMemo(
    () => filterRecurringDayMap(rangeDayMap, showRecurring),
    [rangeDayMap, showRecurring],
  )

  const weekLabel = t('calendar.range.label', formatCalendarSpanEnds(weekStart, weekEnd, locale))

  const {
    dayMap: activeDayMap,
    error: activeError,
    refresh: activeRefresh,
  } =
    view === 'month'
      ? { dayMap, error, refresh }
      : {
          dayMap: rangeDayMap,
          error: rangeError,
          refresh: rangeRefresh,
        }

  useLayoutEffect(() => {
    setCalendarHasError(Boolean(activeError))
    return () => setCalendarHasError(false)
  }, [activeError, setCalendarHasError])

  const prevMonth = useCallback(() => {
    setMonthSlide('left')
    const month = subMonths(currentMonth, 1)
    setSelectedDay(formatAPIDate(month))
  }, [currentMonth, setSelectedDay, setMonthSlide])

  const nextMonth = useCallback(() => {
    setMonthSlide('right')
    const month = addMonths(currentMonth, 1)
    setSelectedDay(formatAPIDate(month))
  }, [currentMonth, setSelectedDay, setMonthSlide])

  const selectMonth = useCallback((month: number, year: number) => {
    setMonthSlide(null);
    setSelectedDay(formatAPIDate(new Date(year, month, 1)));
  }, [setSelectedDay, setMonthSlide]);

  const goToCurrentMonth = useCallback(() => {
    setMonthSlide(null)
    setSelectedDay(todayKey)
  }, [setSelectedDay, todayKey, setMonthSlide])

  const prevWeek = useCallback(() => {
    setWeekSlide('left')
    setWeekAnchor((a) => subWeeks(a ?? parseAPIDate(todayKey), 1))
  }, [setWeekAnchor, setWeekSlide, todayKey])
  const nextWeek = useCallback(() => {
    setWeekSlide('right')
    setWeekAnchor((a) => addWeeks(a ?? parseAPIDate(todayKey), 1))
  }, [setWeekAnchor, setWeekSlide, todayKey])
  const goToCurrentWeek = useCallback(() => {
    setWeekSlide(null)
    setWeekAnchor(parseAPIDate(todayKey))
  }, [todayKey, setWeekAnchor, setWeekSlide])

  const openDay = useCallback(
    (dateStr: string) => {
      setSelectedDay(dateStr)
      if (view === 'week') setIsDayDetailOpen(true)
    },
    [setIsDayDetailOpen, setSelectedDay, view],
  )

  const previousRange = useCallback(() => {
    setRangeOffset((offset) => offset - 1)
  }, [setRangeOffset])
  const nextRange = useCallback(() => {
    setRangeOffset((offset) => Math.min(0, offset + 1))
  }, [setRangeOffset])

  const selectedEntries = useMemo(() => {
    if (!selectedDay) return []
    return orderCalendarDayEntries(activeDayMap.get(selectedDay) ?? [])
  }, [selectedDay, activeDayMap])

  const selectedCalendarEvents = useMemo(
    () =>
      hasProAccess && calendarEventsResult?.status === 'connected'
        ? filterCalendarSyncEventsByDate(calendarEventsResult.events, selectedDay)
        : [],
    [calendarEventsResult, hasProAccess, selectedDay],
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
    return formatCalendarDayTitle(selectedDay, locale, todayKey, (date) => t('dates.todayWithDate', { date }))
  }, [selectedDay, locale, todayKey, t])

  const { monthStats } = useMemo(
    () => buildCalendarMonthModel(currentMonth, displayMonthDayMap, weekStartsOn, todayKey),
    [currentMonth, displayMonthDayMap, weekStartsOn, todayKey],
  )
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

  const weekdayLabels = useMemo(() => formatWeekdayLabels(locale, weekStartsOn), [locale, weekStartsOn])

  const rangeLabel = t('calendar.range.label', formatCalendarSpanEnds(rangeModel.start, rangeModel.end, locale))

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
    <SegmentedControl<CalendarView> fullWidth
      options={viewOptions}
      value={view}
      onChange={setView}
      label={t('calendar.view.switchLabel')}
    />
  )
  const calendarHeader = (
    <CalendarHeader
      currentMonth={currentMonth}
      todayKey={todayKey}
      previousMonthLabel={t('common.previousMonth')}
      nextMonthLabel={t('common.nextMonth')}
      onPreviousMonth={prevMonth}
      onNextMonth={nextMonth}
      onCurrentMonth={goToCurrentMonth}
      onSelectMonth={selectMonth}
      viewSelector={viewSelector}
      period={{ month: undefined, week: {
          view: 'week' as const, label: weekLabel, previousLabel: t('common.previousWeek'), nextLabel: t('common.nextWeek'),
          onPrevious: prevWeek, onNext: nextWeek, onCurrent: goToCurrentWeek,
        }, range: {
          view: 'range' as const, label: rangeLabel, previousLabel: t('calendar.range.previous'), nextLabel: t('calendar.range.next'),
          onPrevious: previousRange, onNext: nextRange, onCurrent: () => setRangeOffset(0), nextDisabled: rangeOffset === 0,
        }, agenda: {
          view: 'agenda' as const, label: t('calendar.range.label', formatCalendarSpanEnds(agendaStart, agendaEnd, locale)), previousLabel: t('common.previousWeek'), nextLabel: t('common.nextWeek'),
          onPrevious: () => setAgendaOffset((offset) => offset - 1), onNext: () => setAgendaOffset((offset) => offset + 1), onCurrent: () => setAgendaOffset(0),
        } }[view]}
    />
  )

  const pageLayout = calendarPageLayout(view, Boolean(profile), Boolean(profileError), Boolean(activeError), calendarHeader)

  return (
    <div {...pageLayout.viewportProps} className={pageLayout.pageClass}>
      <h1 className="sr-only" tabIndex={-1}>{t('nav.calendar')}</h1>
      <div className={pageLayout.contentClass}>
        <CalendarOptions onGoogleCalendar={profile ? openGoogleCalendar : undefined} />
        {pageLayout.header}

        <CalendarBody profileReady={Boolean(profile)} profileError={profileError} onRetryProfile={onRetryProfile} error={activeError} onRetry={() => void activeRefresh()}>
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
                        today={todayKey}
                        entries={selectedEntries}
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
                slideDirection={weekSlide}
                isLoading={rangeLoading}
                onSelectDay={openDay}
                displayTime={displayTime}
                dateFnsLocale={dateFnsLocale}
                allDayLabel={t('calendar.timeGrid.noSetTime')}
                nowLabel={t('calendar.timeGrid.now')}
                timeZone={timeZone}
              />
            )}

            {view === 'range' && (
              <CalendarRangeView
                model={rangeModel}
                weekdayLabels={weekdayLabels}
                rangeLabel={rangeLabel}
                isLoading={rangeLoading}
                loadingLabel={t('common.loading')}
                stats={rangeStatTiles}
              />
            )}

            {view === 'agenda' && (
              <CalendarAgendaView
                startDate={agendaStart}
                dayMap={displayRangeDayMap}
                displayTime={displayTime}
                todayKey={todayKey}
                isLoading={rangeLoading}
                loadingLabel={t('common.loading')}
              />
            )}
        </CalendarBody>
      </div>

      {isDayDetailOpen && view === 'week' ? (<Sheet
        ref={sheetRef}
        open
        onClose={() => (setIsDayDetailOpen)(false)}
        title={dayDetailTitle}
      >
        <CalendarDayDetail
          dateStr={selectedDay}
          today={todayKey}
          showTitle={false}
          entries={selectedEntries}
          calendarEvents={selectedCalendarEvents}
          showEventSource={showEventSource}
          calendarEventsState={calendarEventsState}
          onRetryCalendarEvents={() => void refetchCalendarEvents()}
          onReconnectCalendarEvents={() => openImport(null)}
          onOpenCalendarImport={openImport}
          onOpenEvents={() => openDayDisclosure(() => setIsEventsOpen(true))}
          onOpenHabitTitle={(title) => openDayDisclosure(() => setExpandedHabitTitle(title))}
          onViewPro={openOrbitPro}
          loggable={selectedDayLoggable}
          showRecurring={showRecurring}
          pendingEntryStates={pendingEntryStates}
          onEntryChange={changeSelectedEntry}
        />
      </Sheet>) : null}
      {disclosedWeekDay ? <CalendarDayEvents key={disclosedWeekDay} sheetOnly open={isEventsOpen} onClose={() => setIsEventsOpen(false)} calendarEvents={selectedCalendarEvents} showEventSource={showEventSource} onOpenImport={openImport} /> : null}
      <ExpandedHabitTitleSheet title={expandedHabitTitle} onClose={() => setExpandedHabitTitle(null)} />
      {showImportSheet ? <Sheet
        ref={importSheetRef}
        open
        onClose={closeImport}
        title={t(calendarImportTitleKey(reviewRequested))}
        actions={importActionState ? <CalendarImportActions state={importActionState} onImport={commitCalendarImport} t={t} /> : undefined}
      >
        <CalendarImportContent
          reviewMode={reviewRequested}
          initialEventId={initialImportEventId}
          actionRef={importActionRef}
          onActionStateChange={setImportActionState}
          onClose={() => closeImportSheet()}
          onGoToHabits={() => closeImportSheet(() => {
            setIsImportOpen(false)
            router.push('/')
          })}
        />
      </Sheet> : null}
    </div>
  )
}

function ExpandedHabitTitleSheet({ title, onClose }: Readonly<{ title: string | null; onClose: () => void }>) {
  const t = useTranslations()
  if (!title) return null
  return <Sheet open title={t('habits.form.title')} onClose={onClose}>
    <PersonalText expanded className="text-base text-[var(--fg-1)]">{title}</PersonalText>
  </Sheet>
}
