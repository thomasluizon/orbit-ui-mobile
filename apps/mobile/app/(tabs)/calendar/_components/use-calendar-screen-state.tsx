import { buildCalendarRangeBounds,buildCalendarGridColumns,createCalendarDateActions,getCalendarEntryMutationKey } from '@orbit/shared/hooks'
import type { useCalendarNavigation } from './use-calendar-navigation'
import { useOpenHabit } from '@/hooks/use-open-habit'
import { buildCalendarHeaderState,resolveCalendarProfileSettings,type CalendarProfile,type CalendarView } from '@orbit/shared/utils/calendar-navigation'
import { useCalendars } from '@/hooks/use-calendars'
import { useState,useMemo,useCallback,useEffect,useLayoutEffect,useRef,type Dispatch,type SetStateAction } from "react"
import { View,FlatList } from "react-native"
import { FadeInLeft,FadeInRight,ReduceMotion } from "react-native-reanimated"
import { useTranslation } from "react-i18next"
import { useLocalSearchParams,useRouter } from "expo-router"
import { buildHabitCreateHref,formatCalendarSpanEnds,formatCalendarDayTitle,orderCalendarDayEntries,buildCalendarRangeModel,CALENDAR_MONTH_SWIPE_THRESHOLD,filterRecurringDayMap,filterRecurringEntries,filterCalendarSyncEventsByDate,isCalendarDayLoggable,buildCalendarMonthModel,formatWeekdayLabels,resolveCalendarMonthDisplayState,resolveCalendarEventsDisplayState,shouldOpenCalendarImportSheet,calendarImportRouteRequestKey } from "@orbit/shared/utils"
import { useCalendarEntryMutationLock } from '@/hooks/use-calendar-entry-mutation-lock'
import type { CalendarDayEntry } from "@orbit/shared/types/calendar"
import { useCalendarData, useCalendarRange } from '@/hooks/use-calendar-data'
import { useLogHabit } from '@/hooks/use-habit-logging'
import { useCalendarEvents } from "@/hooks/use-calendar-events"
import { useCalendarAutoSyncState } from "@/hooks/use-calendar-auto-sync"
import { useAccountBoundRouteRequest,useAccountScopedState } from '@/hooks/use-session-reset'
import { useTimeFormat } from "@/hooks/use-time-format"
import { useHorizontalSwipe } from "@/hooks/use-horizontal-swipe"
import { createTokensV2 } from "@/lib/theme"
import { useRootScrollToTop } from '@/components/shell/root-scroll-context'
import { useShellScrollerClearance } from '@/components/shell/shell-scroller-clearance'
import { useAppTheme } from "@/lib/use-app-theme"
import { useSheetHost } from '@/components/ui/sheet'
import { SegmentedControl } from "@/components/ui/segmented-control"
import { CalendarHeader } from "./calendar-shell"
import { type CalendarImportActionHandle,type CalendarImportActionState } from '@/components/calendar-sync/calendar-import-content'
import { useCurrentDate } from "../../use-today-date"
import { useUIStore } from "@/stores/ui-store"
import { createStyles } from './calendar-screen-styles'

type MonthSlide = "left" | "right" | null

function useClearStaleCalendarImportRoute(routeRequestKey: string, importRequested: boolean) {
  const router = useRouter()
  useEffect(() => {
    if (routeRequestKey && !importRequested) router.replace('/calendar')
  }, [routeRequestKey, importRequested, router])
}

function resolveMonthEntering(monthSlide: MonthSlide) {
  if (monthSlide === "right")
    return FadeInRight.duration(220).reduceMotion(ReduceMotion.System)
  if (monthSlide === "left")
    return FadeInLeft.duration(220).reduceMotion(ReduceMotion.System)
  return undefined
}

export interface CalendarScreenContentProps {
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

type CalendarScreenSessionInputs = Pick<CalendarScreenContentProps, 'navigation' | 'profile' | 'view' | 'selectedDay'>

function useCalendarScreenSession({ navigation, profile, view, selectedDay }: CalendarScreenSessionInputs) {
  const { t, i18n } = useTranslation()
  const clearance = useShellScrollerClearance()
  const listRef = useRef<FlatList<CalendarDayEntry>>(null)
  useRootScrollToTop('calendario', useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, []))
  const router = useRouter()
  const params = useLocalSearchParams<{ mode?: string; import?: string; event?: string }>()
  const { sheetRef, closeSheet } = useSheetHost()
  const { sheetRef: importSheetRef, closeSheet: closeImportSheet } = useSheetHost()
  const { displayTime } = useTimeFormat()
  const { weekStartsOn, hasProAccess, timeZone, autoSyncState } = resolveCalendarProfileSettings(profile)
  const todayKey = useCurrentDate(profile?.timeZone)
  const setCalendarHasError = useUIStore((state) => state.setCalendarHasError)
  const logHabit = useLogHabit()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(), [])
  const calendarGridRef = useRef<View>(null)
  const calendarDayRef = useRef<View>(null)
  const [monthSlide, setMonthSlide] = useState<MonthSlide>(null)
  const { weekAnchor, setWeekAnchor, agendaOffset, setAgendaOffset, rangeOffset, setRangeOffset } = navigation
  const [weekSlide, setWeekSlide] = useState<MonthSlide>(null)
  const [isDayDetailOpen, setIsDayDetailOpen] = useAccountScopedState(false)
  const [isEventsOpen, setIsEventsOpen] = useAccountScopedState(false)
  const openHabit = useOpenHabit()
  const disclosedWeekDay = view === 'week' ? selectedDay : null
  const openDayDisclosure = (open: () => void) => closeSheet(() => { setIsDayDetailOpen(false); open() })
  const [isImportOpen, setIsImportOpen] = useAccountScopedState(false)
  const [importActionState, setImportActionState] = useAccountScopedState<CalendarImportActionState | null>(null)
  const importActionRef = useRef<CalendarImportActionHandle>(null)
  const commitCalendarImport = useCallback(() => importActionRef.current?.importSelected(), [])
  const [initialImportEventId, setInitialImportEventId] = useAccountScopedState<string | null>(null)
  const reviewRequested = params.mode === 'review'
  const routeRequestKey = calendarImportRouteRequestKey(reviewRequested, params.import === '1')
  const importRequested = useAccountBoundRouteRequest(routeRequestKey)
  useClearStaleCalendarImportRoute(routeRequestKey, importRequested)
  const showImportSheet = shouldOpenCalendarImportSheet(Boolean(profile), isImportOpen, importRequested)
  const openImport = useCallback((eventId: string | null) => {
    const open = () => {
      setIsDayDetailOpen(false)
      setInitialImportEventId(eventId)
      setIsImportOpen(true)
    }
    if (isDayDetailOpen && view === 'week') closeSheet(open)
    else open()
  }, [closeSheet, isDayDetailOpen, setInitialImportEventId, setIsImportOpen, view, setIsDayDetailOpen])
  const closeImport = useCallback(() => {
    setIsImportOpen(false)
    setInitialImportEventId(null)
    if (importRequested) router.replace('/calendar')
  }, [importRequested, router, setInitialImportEventId, setIsImportOpen])
  return { hasProAccess, timeZone, autoSyncState, closeSheet, setIsDayDetailOpen, router, weekAnchor, todayKey, weekStartsOn, rangeOffset, agendaOffset, t, i18n, setMonthSlide, setWeekSlide, setWeekAnchor, setRangeOffset, setCalendarHasError, logHabit, monthSlide, openImport, setAgendaOffset, tokens, listRef, calendarGridRef, calendarDayRef, displayTime, styles, weekSlide, clearance, isDayDetailOpen, sheetRef, openDayDisclosure, setIsEventsOpen, openHabit, disclosedWeekDay, isEventsOpen, showImportSheet, importSheetRef, closeImport, reviewRequested, importActionState, commitCalendarImport, importRequested, params, initialImportEventId, importActionRef, setImportActionState, closeImportSheet, setIsImportOpen }
}

type CalendarEventStateInputs = Pick<ReturnType<typeof useCalendarScreenSession>, 'hasProAccess' | 'timeZone' | 'autoSyncState' | 'closeSheet' | 'setIsDayDetailOpen' | 'router'> & Pick<CalendarScreenContentProps, 'profile'>

function useCalendarEventState({ hasProAccess, timeZone, autoSyncState, closeSheet, setIsDayDetailOpen, router, profile }: CalendarEventStateInputs) {
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
    profileReady: Boolean(profile),
    enabled: hasProAccess,
    isPending: calendarEventsPending,
    error: calendarEventsError,
    resultStatus: calendarEventsResult?.status,
  })
  return { showRecurring, calendarEventsResult, showEventSource, calendarEventsState, refetchCalendarEvents, openOrbitPro }
}

type CalendarRangeStateInputs = Pick<CalendarScreenContentProps, 'monthQuery' | 'view' | 'profile'> & Pick<ReturnType<typeof useCalendarScreenSession>, 'weekAnchor' | 'todayKey' | 'weekStartsOn' | 'rangeOffset' | 'agendaOffset' | 't'>

function useCalendarRangeState({ monthQuery, weekAnchor, todayKey, weekStartsOn, rangeOffset, agendaOffset, view, profile, t }: CalendarRangeStateInputs) {
  const { dayMap, isLoading, error, refresh } = monthQuery

  const { weekStart, weekEnd, rangeEnd, agendaStart, agendaEnd, queryBounds } = useMemo(
    () => buildCalendarRangeBounds(todayKey, weekAnchor, weekStartsOn, rangeOffset, agendaOffset, view),
    [todayKey, weekAnchor, weekStartsOn, rangeOffset, agendaOffset, view],
  )

  const {
    dayMap: rangeDayMap,
    isLoading: rangeQueryLoading,
    error: rangeError,
    refresh: rangeRefresh,
  } = useCalendarRange(
    queryBounds.lo,
    queryBounds.hi,
    Boolean(profile) && (view === "week" || view === "range" || view === "agenda"),
  )

  const rangeLoading = !profile || rangeQueryLoading
  const rangeLoadingLabel = useMemo(
    () => rangeLoading ? t('calendar.loading') : undefined,
    [rangeLoading, t],
  )
  return { weekStart, weekEnd, dayMap, rangeDayMap, isLoading, rangeEnd, error, refresh, rangeError, rangeRefresh, agendaStart, agendaEnd, rangeLoading, rangeLoadingLabel }
}

type CalendarDisplayStateInputs = Pick<ReturnType<typeof useCalendarRangeState>, 'weekStart' | 'weekEnd' | 'dayMap' | 'rangeDayMap'> & Pick<ReturnType<typeof useCalendarScreenSession>, 'todayKey' | 't' | 'i18n'> & Pick<ReturnType<typeof useCalendarEventState>, 'showRecurring'>

function useCalendarDisplayState({ weekStart, weekEnd, todayKey, dayMap, showRecurring, rangeDayMap, t, i18n }: CalendarDisplayStateInputs) {
  const gridColumns = useMemo(() => buildCalendarGridColumns(weekStart, weekEnd, todayKey), [weekStart, weekEnd, todayKey])

  const displayMonthDayMap = useMemo(
    () => filterRecurringDayMap(dayMap, showRecurring),
    [dayMap, showRecurring],
  )
  const displayRangeDayMap = useMemo(
    () => filterRecurringDayMap(rangeDayMap, showRecurring),
    [rangeDayMap, showRecurring],
  )

  const weekLabel = t('calendar.range.label', formatCalendarSpanEnds(weekStart, weekEnd, i18n.language))
  return { displayMonthDayMap, displayRangeDayMap, weekLabel, gridColumns }
}

type CalendarDateActionsInputs = Pick<ReturnType<typeof useCalendarScreenSession>, 'setMonthSlide' | 'todayKey' | 'setWeekSlide' | 'setWeekAnchor' | 'setIsDayDetailOpen' | 'setRangeOffset'> & Pick<CalendarScreenContentProps, 'currentMonth' | 'setSelectedDay'>

function useCalendarDateActions(inputs: CalendarDateActionsInputs) {
  const actions = useMemo(() => createCalendarDateActions({ ...inputs, openEveryDay: true }), [inputs])
  const swipeGesture = useHorizontalSwipe({ onSwipeLeft: actions.nextMonth, onSwipeRight: actions.prevMonth, minDistance: CALENDAR_MONTH_SWIPE_THRESHOLD, minVelocity: 0 })
  return { ...actions, onSelectDay: actions.openDay, swipeGesture, selectMonthDay: inputs.setSelectedDay, closeDayDetail: () => inputs.setIsDayDetailOpen(false) }
}

type CalendarViewModelInputs = Pick<ReturnType<typeof useCalendarScreenSession>, 't' | 'i18n' | 'weekStartsOn' | 'todayKey' | 'setCalendarHasError'> & Pick<CalendarScreenContentProps, 'currentMonth' | 'view'> & Pick<ReturnType<typeof useCalendarDisplayState>, 'displayMonthDayMap' | 'displayRangeDayMap'> & Pick<ReturnType<typeof useCalendarRangeState>, 'isLoading' | 'rangeEnd' | 'dayMap' | 'error' | 'refresh' | 'rangeDayMap' | 'rangeError' | 'rangeRefresh'>

function useCalendarViewModel({ t, i18n, weekStartsOn, currentMonth, displayMonthDayMap, todayKey, isLoading, rangeEnd, displayRangeDayMap, view, dayMap, error, refresh, rangeDayMap, rangeError, rangeRefresh, setCalendarHasError }: CalendarViewModelInputs) {
  const viewOptions = useMemo(
    () => [
      { value: "month" as const, label: t("calendar.view.month") },
      { value: "week" as const, label: t("calendar.view.week") },
      { value: "range" as const, label: t("calendar.view.range") },
      { value: "agenda" as const, label: t("calendar.view.agenda") },
    ] as const,
    [t],
  )

  const weekdayHeaders = useMemo(
    () => formatWeekdayLabels(i18n.language, weekStartsOn).map((label, index) => ({ key: String(index), label })),
    [i18n.language, weekStartsOn],
  )

  const { gridDays, monthStats } = useMemo(
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

  const rangeLabel = t('calendar.range.label', formatCalendarSpanEnds(rangeModel.start, rangeModel.end, i18n.language))

  const {
    dayMap: activeDayMap,
    error: activeError,
    refresh: activeRefresh,
  } =
    view === "month"
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
  return { activeDayMap, monthStats, rangeModel, rangeLabel, viewOptions, gridDays, weekdayHeaders, monthDisplayState, activeError, activeRefresh }
}

type CalendarEntryStateInputs = Pick<CalendarScreenContentProps, 'selectedDay' | 'monthQuery'> & Pick<ReturnType<typeof useCalendarViewModel>, 'activeDayMap'> & Pick<ReturnType<typeof useCalendarScreenSession>, 'hasProAccess' | 'i18n' | 'todayKey' | 't' | 'logHabit' | 'closeSheet' | 'setIsDayDetailOpen' | 'router'> & Pick<ReturnType<typeof useCalendarEventState>, 'calendarEventsResult' | 'showRecurring'>

function useCalendarEntryState({ selectedDay, activeDayMap, hasProAccess, calendarEventsResult, showRecurring, monthQuery, i18n, todayKey, t, logHabit, closeSheet, setIsDayDetailOpen, router }: CalendarEntryStateInputs) {
  const selectedEntries = useMemo(() => {
    if (!selectedDay) return []
    return orderCalendarDayEntries(activeDayMap.get(selectedDay) ?? [])
  }, [selectedDay, activeDayMap])

  const selectedCalendarEvents = useMemo(
    () =>
      hasProAccess && calendarEventsResult?.status === "connected"
        ? filterCalendarSyncEventsByDate(calendarEventsResult.events, selectedDay)
        : [],
    [calendarEventsResult, hasProAccess, selectedDay],
  )

  const filteredEntries = useMemo(
    () => filterRecurringEntries(selectedEntries, showRecurring),
    [selectedEntries, showRecurring],
  )

  const monthDayEntries = useMemo(
    () => filterRecurringEntries(orderCalendarDayEntries(monthQuery.loadingDayMap?.get(selectedDay) ?? selectedEntries), showRecurring),
    [monthQuery.loadingDayMap, selectedDay, showRecurring, selectedEntries],
  )

  const formattedSelectedDate = useMemo(() => {
    if (!selectedDay) return ""
    return formatCalendarDayTitle(selectedDay, i18n.language, todayKey, (date) => t('dates.todayWithDate', { date }))
  }, [i18n.language, selectedDay, todayKey, t])

  const completedCount = filteredEntries.filter(
    (entry: CalendarDayEntry) => entry.status === "completed",
  ).length

  const selectedDayLoggable = isCalendarDayLoggable(selectedDay, todayKey)

  const selectedEntrySourceStates = useMemo(() => {
    const sourceStates = new Map<string, boolean>()
    if (!selectedDay) return sourceStates
    for (const entry of selectedEntries) {
      sourceStates.set(
        getCalendarEntryMutationKey(selectedDay, entry.habitId),
        entry.status === "completed",
      )
    }
    return sourceStates
  }, [selectedDay, selectedEntries])
  const { pendingEntryStates, startEntryMutation } = useCalendarEntryMutationLock(
    selectedEntrySourceStates,
  )

  const changeSelectedEntry = (entry: CalendarDayEntry, checked: boolean) => {
    if (!selectedDay) return null
    const entryKey = getCalendarEntryMutationKey(selectedDay, entry.habitId)
    return startEntryMutation(entryKey, checked, () => logHabit.mutateAsync({
      habitId: entry.habitId,
      date: selectedDay,
      intent: checked ? "log" : "unlog",
    }))
  }

  const goToSelectedDay = () => {
    if (!selectedDay) return
    closeSheet(() => {
      setIsDayDetailOpen(false)
      router.push(`/?date=${selectedDay}`)
    })
  }
  return { formattedSelectedDate, monthDayEntries, selectedCalendarEvents, completedCount, selectedDayLoggable, pendingEntryStates, changeSelectedEntry, filteredEntries, goToSelectedDay }
}

type CalendarStatsStateInputs = Pick<ReturnType<typeof useCalendarViewModel>, 'monthStats' | 'rangeModel'> & Pick<ReturnType<typeof useCalendarScreenSession>, 't' | 'monthSlide' | 'router' | 'openImport'>

function useCalendarStatsState({ monthStats, t, rangeModel, monthSlide, router, openImport }: CalendarStatsStateInputs) {
  const monthStatTiles = useMemo(
    () => [
      {
        key: "bestStreak",
        value: monthStats.bestStreak,
        label: t("calendar.bestStreak"),
      },
      {
        key: "totalLogs",
        value: monthStats.totalLogs,
        label: t("calendar.totalLogs"),
      },
      {
        key: "missed",
        value: monthStats.missed,
        label: t("calendar.missedCount"),
      },
    ] as const,
    [monthStats, t],
  )

  const rangeStatTiles = useMemo(
    () => [
      {
        key: "bestStreak",
        value: rangeModel.stats.bestStreak,
        label: t("calendar.bestStreak"),
      },
      {
        key: "totalLogs",
        value: rangeModel.stats.totalLogs,
        label: t("calendar.totalLogs"),
      },
      {
        key: "missed",
        value: rangeModel.stats.missed,
        label: t("calendar.missedCount"),
      },
    ] as const,
    [rangeModel.stats, t],
  )

  const monthEntering = resolveMonthEntering(monthSlide)

  const openHabitCreation = useCallback(() => {
    router.push(buildHabitCreateHref({ from: '/calendar' }))
  }, [router])

  const openGoogleCalendar = () => {
    openImport(null)
  }
  return { monthEntering, openHabitCreation, monthStatTiles, rangeStatTiles, openGoogleCalendar }
}

type CalendarHeaderStateInputs = Pick<CalendarScreenContentProps, 'currentMonth' | 'view' | 'selectedDay' | 'setView'> & Pick<ReturnType<typeof useCalendarScreenSession>, 'todayKey' | 'weekStartsOn' | 'rangeOffset' | 'agendaOffset' | 'i18n' | 't' | 'setRangeOffset' | 'setAgendaOffset' | 'tokens' | 'listRef'> & Pick<ReturnType<typeof useCalendarRangeState>, 'weekStart' | 'agendaStart' | 'agendaEnd'> & Pick<ReturnType<typeof useCalendarDisplayState>, 'weekLabel'> & Pick<ReturnType<typeof useCalendarViewModel>, 'rangeLabel' | 'viewOptions'> & Pick<ReturnType<typeof useCalendarDateActions>, 'prevWeek' | 'nextWeek' | 'goToCurrentWeek' | 'previousRange' | 'nextRange' | 'prevMonth' | 'nextMonth' | 'goToCurrentMonth' | 'selectMonth'>

function useCalendarHeaderState({ currentMonth, todayKey, view, selectedDay, weekStart, weekStartsOn, rangeOffset, agendaOffset, weekLabel, rangeLabel, agendaStart, agendaEnd, i18n, t, prevWeek, nextWeek, goToCurrentWeek, previousRange, nextRange, setRangeOffset, setAgendaOffset, prevMonth, nextMonth, goToCurrentMonth, selectMonth, tokens, viewOptions, listRef, setView }: CalendarHeaderStateInputs) {
  const calendarHeader = (
    <CalendarHeader
      currentMonth={currentMonth}
      todayKey={todayKey}
      {...buildCalendarHeaderState({
        view, selectedDay, todayKey, weekStart, weekStartsOn, rangeOffset, agendaOffset,
        weekLabel, rangeLabel, agendaStart, agendaEnd, locale: i18n.language, translate: t,
        prevWeek, nextWeek, goToCurrentWeek, previousRange, nextRange, setRangeOffset, setAgendaOffset
      })}
      previousMonthLabel={t('common.previousMonth')}
      nextMonthLabel={t('common.nextMonth')}
      onPreviousMonth={prevMonth}
      onNextMonth={nextMonth}
      onCurrentMonth={goToCurrentMonth}
      onSelectMonth={selectMonth}
      tokens={tokens}
      viewSelector={<SegmentedControl<CalendarView> fullWidth options={viewOptions} value={view} onChange={(nextView) => {
        listRef.current?.scrollToOffset({ offset: 0, animated: false })
        setView(nextView)
      }} label={t('calendar.view.switchLabel')} />}
    />
  )
  return { calendarHeader }
}

export function useCalendarScreenState(props: Readonly<CalendarScreenContentProps>) {
  const calendarScreenSession = useCalendarScreenSession({ ...props })
  const calendarEventState = useCalendarEventState({ ...calendarScreenSession, ...props })
  const calendarRangeState = useCalendarRangeState({ ...props, ...calendarScreenSession })
  const calendarDisplayState = useCalendarDisplayState({ ...calendarRangeState, ...calendarScreenSession, ...calendarEventState })
  const calendarDateActions = useCalendarDateActions({ ...calendarScreenSession, ...props })
  const calendarViewModel = useCalendarViewModel({ ...calendarScreenSession, ...props, ...calendarDisplayState, ...calendarRangeState })
  const calendarEntryState = useCalendarEntryState({ ...props, ...calendarViewModel, ...calendarScreenSession, ...calendarEventState })
  const calendarStatsState = useCalendarStatsState({ ...calendarViewModel, ...calendarScreenSession })
  const calendarHeaderState = useCalendarHeaderState({ ...props, ...calendarScreenSession, ...calendarRangeState, ...calendarDisplayState, ...calendarViewModel, ...calendarDateActions })
  return { ...props, ...calendarScreenSession, ...calendarEventState, ...calendarRangeState, ...calendarDisplayState, ...calendarDateActions, ...calendarViewModel, ...calendarEntryState, ...calendarStatsState, ...calendarHeaderState }
}

export type CalendarScreenState = ReturnType<typeof useCalendarScreenState>
