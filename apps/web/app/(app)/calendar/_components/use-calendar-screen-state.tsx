import { createUseCalendarEventState,createUseCalendarRangeState,buildCalendarGridColumns,createCalendarDateActions } from '@orbit/shared/hooks'
import { buildCalendarHeaderState,resolveCalendarProfileSettings,type CalendarProfile } from '@orbit/shared/utils/calendar-navigation'
import { useOpenHabit } from '@/hooks/use-open-habit'
import { useCalendars } from '@/hooks/use-calendars'
import { useState,useMemo,useCallback,useEffect,useLayoutEffect,useRef,type Dispatch,type SetStateAction,type ReactNode } from 'react'
import { enUS,ptBR } from 'date-fns/locale'
import { useLocale,useTranslations } from 'next-intl'
import { useRouter,useSearchParams } from 'next/navigation'
import { formatWeekdayLabels,formatCalendarSpanEnds,formatCalendarDayTitle,orderCalendarDayEntries,filterCalendarSyncEventsByDate,isCalendarDayLoggable,buildCalendarRangeModel,CALENDAR_HORIZONTAL_SWIPE_DIRECTION_RATIO,CALENDAR_MONTH_SWIPE_THRESHOLD,filterRecurringDayMap,resolveCalendarMonthDisplayState,shouldOpenCalendarImportSheet,calendarImportRouteRequestKey } from '@orbit/shared/utils'
import { getCalendarEntryMutationKey } from '@orbit/shared/hooks'
import { useCalendarEntryMutationLock } from '@/hooks/use-calendar-entry-mutation-lock'
import { useCalendarData,useCalendarRange } from '@/hooks/use-calendar-data'
import { useCalendarEvents } from '@/hooks/use-calendar-events'
import { useAccountBoundRouteRequest,useAccountScopedState } from '@/hooks/use-session-reset'
import { useCalendarAutoSyncState } from '@/hooks/use-calendar-auto-sync'
import { useLogHabit } from '@/hooks/use-habit-logging'
import { useTimeFormat } from '@/hooks/use-time-format'
import { buildCalendarMonthModel, type CalendarSlideDirection } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { type CalendarImportActionHandle,type CalendarImportActionState } from '@/components/calendar-sync/calendar-import-content'
import { useSheetHost } from '@/components/ui/sheet'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { useUIStore } from '@/stores/ui-store'
import { useOffline } from '@/hooks/use-offline'
import { useToday } from '../../today-provider'
import { useAccountClockSeed } from '@/lib/account-clock'
import { CalendarHeader } from './calendar-shell'
import { useCalendarNavigation,type CalendarView } from '@/hooks/use-calendar-navigation'

type MonthSlide = CalendarSlideDirection | null

function calendarDateFnsLocale(locale: string) {
  return locale === 'pt-BR' ? ptBR : enUS
}

function useClearStaleCalendarImportRoute(routeRequestKey: string, importRequested: boolean, returnHref: string) {
  const router = useRouter()
  useEffect(() => {
    if (routeRequestKey && !importRequested) router.replace(returnHref, { scroll: false })
  }, [routeRequestKey, importRequested, returnHref, router])
}

export interface CalendarPageContentProps {
  navigation: ReturnType<typeof useCalendarNavigation>
  profile: CalendarProfile | undefined
  profileError: Error | null
  onRetryProfile: () => void
  currentMonth: Date
  selectedDay: string
  setSelectedDay: Dispatch<SetStateAction<string>>
  monthQuery: ReturnType<typeof useCalendarData>
  view: CalendarView
  setView: Dispatch<SetStateAction<CalendarView>>
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

type CalendarScreenSessionInputs = Pick<CalendarPageContentProps, 'profile' | 'navigation' | 'view' | 'selectedDay'>

function useCalendarScreenSession({ profile, navigation, view, selectedDay }: CalendarScreenSessionInputs) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()
  const { sheetRef, closeSheet } = useSheetHost()
  const { sheetRef: importSheetRef, closeSheet: closeImportSheet } = useSheetHost()
  const locale = useLocale()
  const dateFnsLocale = calendarDateFnsLocale(locale)
  const { displayTime } = useTimeFormat()
  const accountClockSeed = useAccountClockSeed()
  const { weekStartsOn, hasProAccess, autoSyncState } = resolveCalendarProfileSettings(profile)
  const timeZone = (profile ?? accountClockSeed)?.timeZone ?? null
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
  const openHabit = useOpenHabit()
  const disclosedWeekDay = view === 'week' ? selectedDay : null
  const openGoogleCalendar = () => {
    openImport(null)
  }
  const openDayDisclosure = (open: () => void) => closeSheet(() => { setIsDayDetailOpen(false); open() })
  const [isImportOpen, setIsImportOpen] = useAccountScopedState(false)
  const [importActionState, setImportActionState] = useAccountScopedState<CalendarImportActionState | null>(null)
  const importActionRef = useRef<CalendarImportActionHandle>(null)
  const commitCalendarImport = useCallback(() => importActionRef.current?.importSelected(), [])
  const [initialImportEventId, setInitialImportEventId] = useAccountScopedState<string | null>(null)
  const reviewRequested = searchParams.get('mode') === 'review'
  const routeRequestKey = calendarImportRouteRequestKey(reviewRequested, searchParams.get('import') === '1')
  const importRequested = useAccountBoundRouteRequest(routeRequestKey)
  useClearStaleCalendarImportRoute(routeRequestKey, importRequested, navigation.importReturnHref)
  const showImportSheet = shouldOpenCalendarImportSheet(Boolean(profile), isImportOpen, importRequested)

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
    if (importRequested) router.replace(navigation.importReturnHref, { scroll: false })
  }, [importRequested, navigation.importReturnHref, router, setInitialImportEventId, setIsImportOpen])
  return { hasProAccess, timeZone, autoSyncState, closeSheet, setIsDayDetailOpen, router, weekAnchor, todayKey, weekStartsOn, rangeOffset, agendaOffset, t, locale, setCalendarHasError, setMonthSlide, setWeekSlide, setWeekAnchor, setRangeOffset, logHabit, monthSlide, isOnline, setShowCreateRefusal, setShowCreateModal, setAgendaOffset, openGoogleCalendar, isWideDesktop, showCreateRefusal, openImport, weekSlide, displayTime, dateFnsLocale, isDayDetailOpen, sheetRef, openDayDisclosure, setIsEventsOpen, openHabit, disclosedWeekDay, isEventsOpen, showImportSheet, importSheetRef, closeImport, reviewRequested, importActionState, commitCalendarImport, importRequested, searchParams, initialImportEventId, importActionRef, setImportActionState, closeImportSheet, setIsImportOpen }
}

const useCalendarEventState = createUseCalendarEventState({
  useCalendars, useCalendarEvents, useCalendarAutoSyncState, useCallback,
  useShowRecurring: () => useUIStore((state) => state.calendarShowRecurring),
})

const useCalendarRangeState = createUseCalendarRangeState({ useMemo, useCalendarRange })

type CalendarDisplayStateInputs = Pick<ReturnType<typeof useCalendarRangeState>, 'weekStart' | 'weekEnd' | 'dayMap' | 'rangeDayMap' | 'error' | 'refresh' | 'rangeError' | 'rangeRefresh'> & Pick<ReturnType<typeof useCalendarScreenSession>, 'todayKey' | 't' | 'locale' | 'setCalendarHasError'> & Pick<ReturnType<typeof useCalendarEventState>, 'showRecurring'> & Pick<CalendarPageContentProps, 'view'>

function useCalendarDisplayState({ weekStart, weekEnd, todayKey, dayMap, showRecurring, rangeDayMap, t, locale, view, error, refresh, rangeError, rangeRefresh, setCalendarHasError }: CalendarDisplayStateInputs) {
  const gridColumns = useMemo(() => buildCalendarGridColumns(weekStart, weekEnd, todayKey), [weekStart, weekEnd, todayKey])

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
  return { activeDayMap, displayMonthDayMap, displayRangeDayMap, weekLabel, activeError, activeRefresh, gridColumns }
}

type CalendarDateActionsInputs = Pick<ReturnType<typeof useCalendarScreenSession>, 'setMonthSlide' | 'todayKey' | 'setWeekSlide' | 'setWeekAnchor' | 'setIsDayDetailOpen' | 'setRangeOffset'> & Pick<CalendarPageContentProps, 'currentMonth' | 'setSelectedDay' | 'view'>

function useCalendarDateActions(inputs: CalendarDateActionsInputs) {
  const actions = useMemo(() => createCalendarDateActions({ ...inputs }), [inputs])
  return actions
}

type CalendarEntryStateInputs = Pick<CalendarPageContentProps, 'selectedDay' | 'monthQuery'> & Pick<ReturnType<typeof useCalendarDisplayState>, 'activeDayMap'> & Pick<ReturnType<typeof useCalendarScreenSession>, 'hasProAccess' | 'todayKey' | 'logHabit'> & Pick<ReturnType<typeof useCalendarEventState>, 'calendarEventsResult'>

function useCalendarEntryState({ selectedDay, activeDayMap, monthQuery, hasProAccess, calendarEventsResult, todayKey, logHabit }: CalendarEntryStateInputs) {
  const selectedEntries = useMemo(() => {
    if (!selectedDay) return []
    return orderCalendarDayEntries(activeDayMap.get(selectedDay) ?? [])
  }, [selectedDay, activeDayMap])

  const monthDayEntries = useMemo(
    () => orderCalendarDayEntries(monthQuery.loadingDayMap?.get(selectedDay) ?? selectedEntries),
    [monthQuery.loadingDayMap, selectedDay, selectedEntries],
  )

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
  return { monthDayEntries, selectedCalendarEvents, selectedDayLoggable, pendingEntryStates, changeSelectedEntry, selectedEntries }
}

type CalendarViewModelInputs = Pick<CalendarPageContentProps, 'selectedDay' | 'currentMonth'> & Pick<ReturnType<typeof useCalendarScreenSession>, 'locale' | 'todayKey' | 't' | 'weekStartsOn'> & Pick<ReturnType<typeof useCalendarDisplayState>, 'displayMonthDayMap' | 'displayRangeDayMap'> & Pick<ReturnType<typeof useCalendarRangeState>, 'isLoading' | 'rangeEnd'>

function useCalendarViewModel({ selectedDay, locale, todayKey, t, currentMonth, displayMonthDayMap, weekStartsOn, isLoading, rangeEnd, displayRangeDayMap }: CalendarViewModelInputs) {
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
  return { viewOptions, rangeLabel, monthDisplayState, monthStatTiles, rangeModel, weekdayLabels, rangeStatTiles, dayDetailTitle }
}

type CalendarMonthSwipeInputs = Pick<ReturnType<typeof useCalendarDateActions>, 'nextMonth' | 'prevMonth'> & Pick<ReturnType<typeof useCalendarScreenSession>, 'isOnline' | 'setShowCreateRefusal' | 'setShowCreateModal'>

function useCalendarMonthSwipe({ nextMonth, prevMonth, isOnline, setShowCreateRefusal, setShowCreateModal }: CalendarMonthSwipeInputs) {
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

  const openHabitCreation = useCallback(() => {
    if (!isOnline) { setShowCreateRefusal(true); return }
    setShowCreateModal(true)
  }, [isOnline, setShowCreateRefusal, setShowCreateModal])
  return { handleTouchStart, handleTouchEnd, openHabitCreation }
}

type CalendarHeaderStateInputs = Pick<ReturnType<typeof useCalendarViewModel>, 'viewOptions' | 'rangeLabel'> & Pick<CalendarPageContentProps, 'view' | 'setView' | 'currentMonth' | 'selectedDay' | 'profile' | 'profileError'> & Pick<ReturnType<typeof useCalendarScreenSession>, 't' | 'todayKey' | 'weekStartsOn' | 'rangeOffset' | 'agendaOffset' | 'locale' | 'setRangeOffset' | 'setAgendaOffset'> & Pick<ReturnType<typeof useCalendarRangeState>, 'weekStart' | 'agendaStart' | 'agendaEnd'> & Pick<ReturnType<typeof useCalendarDisplayState>, 'weekLabel' | 'activeError'> & Pick<ReturnType<typeof useCalendarDateActions>, 'prevWeek' | 'nextWeek' | 'goToCurrentWeek' | 'previousRange' | 'nextRange' | 'prevMonth' | 'nextMonth' | 'goToCurrentMonth' | 'selectMonth'>

function useCalendarHeaderState({ viewOptions, view, setView, t, currentMonth, todayKey, selectedDay, weekStart, weekStartsOn, rangeOffset, agendaOffset, weekLabel, rangeLabel, agendaStart, agendaEnd, locale, prevWeek, nextWeek, goToCurrentWeek, previousRange, nextRange, setRangeOffset, setAgendaOffset, prevMonth, nextMonth, goToCurrentMonth, selectMonth, profile, profileError, activeError }: CalendarHeaderStateInputs) {
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
      {...buildCalendarHeaderState({
        view, selectedDay, todayKey, weekStart, weekStartsOn, rangeOffset, agendaOffset,
        weekLabel, rangeLabel, agendaStart, agendaEnd, locale, translate: t,
        prevWeek, nextWeek, goToCurrentWeek, previousRange, nextRange, setRangeOffset, setAgendaOffset
      })}
      previousMonthLabel={t('common.previousMonth')}
      nextMonthLabel={t('common.nextMonth')}
      onPreviousMonth={prevMonth}
      onNextMonth={nextMonth}
      onCurrentMonth={goToCurrentMonth}
      onSelectMonth={selectMonth}
      viewSelector={viewSelector}
    />
  )

  const pageLayout = calendarPageLayout(view, Boolean(profile), Boolean(profileError), Boolean(activeError), calendarHeader)
  return { pageLayout }
}

export function useCalendarScreenState(props: Readonly<CalendarPageContentProps>) {
  const calendarScreenSession = useCalendarScreenSession({ ...props })
  const calendarEventState = useCalendarEventState({ ...calendarScreenSession, ...props })
  const calendarRangeState = useCalendarRangeState({ ...props, ...calendarScreenSession })
  const calendarDisplayState = useCalendarDisplayState({ ...calendarRangeState, ...calendarScreenSession, ...calendarEventState, ...props })
  const calendarDateActions = useCalendarDateActions({ ...calendarScreenSession, ...props })
  const calendarEntryState = useCalendarEntryState({ ...props, ...calendarDisplayState, ...calendarScreenSession, ...calendarEventState })
  const calendarViewModel = useCalendarViewModel({ ...props, ...calendarScreenSession, ...calendarDisplayState, ...calendarRangeState })
  const calendarMonthSwipe = useCalendarMonthSwipe({ ...calendarDateActions, ...calendarScreenSession })
  const calendarHeaderState = useCalendarHeaderState({ ...calendarViewModel, ...props, ...calendarScreenSession, ...calendarRangeState, ...calendarDisplayState, ...calendarDateActions })
  return { ...props, ...calendarScreenSession, ...calendarEventState, ...calendarRangeState, ...calendarDisplayState, ...calendarDateActions, ...calendarEntryState, ...calendarViewModel, ...calendarMonthSwipe, ...calendarHeaderState }
}

export type CalendarScreenState = ReturnType<typeof useCalendarScreenState>
