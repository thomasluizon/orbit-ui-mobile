import { useCalendars } from '@/hooks/use-calendars';
import { CalendarOptions } from './calendar/_components/calendar-options';
import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef, type Dispatch, type SetStateAction, type ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
} from "react-native";
import { ScreenReaderHeading } from '@/components/ui/screen-reader-heading'
import {
  FadeInLeft,
  FadeInRight,
  ReduceMotion,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
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
} from "date-fns";
import {
  formatCalendarSpanEnds,
  buildHabitCreateHref,
  formatCalendarDayTitle,
  orderCalendarDayEntries,
  buildCalendarRangeModel,
  CALENDAR_MONTH_SWIPE_THRESHOLD,
  filterRecurringDayMap,
  filterRecurringEntries,
  filterCalendarSyncEventsByDate,
  formatAPIDate,
  isCalendarDayLoggable,
  parseAPIDate,
  MAX_RANGE_DAYS,
  buildCalendarMonthModel,
  formatWeekdayLabels,
  resolveCalendarRangeEnd,
  resolveCalendarMonthDisplayState,
  resolveCalendarEventsDisplayState,
  type CalendarMonthDisplayState,
  calendarMonthForDay,
  shouldOpenCalendarImportSheet,
  calendarImportTitleKey,
  calendarImportRouteRequestKey,
} from "@orbit/shared/utils";
import { getCalendarEntryMutationKey } from '@orbit/shared/hooks'
import { useCalendarEntryMutationLock } from '@/hooks/use-calendar-entry-mutation-lock'
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";
import type { Profile } from "@orbit/shared/types/profile";
import { useCalendarData, useCalendarRange, useLogHabit } from "@/hooks/use-habits";
import { useProfile } from "@/hooks/use-profile";
import { useCalendarEvents } from "@/hooks/use-calendar-events";
import {
  useCalendarAutoSyncState,
} from "@/hooks/use-calendar-auto-sync";
import { useAccountBoundRouteRequest, useAccountScopedState } from '@/hooks/use-session-reset';
import { useTimeFormat } from "@/hooks/use-time-format";
import { useHorizontalSwipe } from "@/hooks/use-horizontal-swipe";
import { createTokensV2, radius } from "@/lib/theme";
import { useRootScrollToTop } from '@/components/shell/root-scroll-context'
import { useShellScrollerClearance } from '@/components/shell/shell-scroller-clearance'
import { useAppTheme } from "@/lib/use-app-theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { Sheet, useSheetHost } from '@/components/ui/sheet';
import { PillButton } from "@/components/ui/pill-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CalendarHeader,
} from "./calendar/_components/calendar-shell";
import { CalendarGrid } from "./calendar/_components/calendar-grid";
import { CalendarDayDetail } from "./calendar/_components/calendar-day-detail";
import { CalendarDayEvents } from './calendar/_components/calendar-day-events';
import { CalendarImportContent, type CalendarImportActionHandle, type CalendarImportActionState } from '@/components/calendar-sync/calendar-import-content';
import { plural } from '@/lib/plural';
import { CalendarStats } from "./calendar/_components/calendar-stats";
import { CalendarAgendaView } from './calendar/_components/calendar-agenda-view';
import { CalendarWeekView } from "./calendar/_components/calendar-week-view";
import { CalendarRangeView } from "./calendar/_components/calendar-range-view";
import type { TimeGridColumn } from "./calendar/_components/calendar-time-grid";
import { useCurrentDate } from "./use-today-date";
import { useUIStore } from "@/stores/ui-store";

type MonthSlide = "left" | "right" | null;
type CalendarView = "month" | "week" | "range" | "agenda";


function useClearStaleCalendarImportRoute(routeRequestKey: string, importRequested: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (routeRequestKey && !importRequested) router.replace('/calendar');
  }, [routeRequestKey, importRequested, router]);
}

function CalendarImportActions({ state, onImport, t }: {
  state: CalendarImportActionState;
  onImport: () => void;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  return <PillButton size="sm" disabled={state.disabled} onClick={onImport}>
    {plural(t('calendar.importButton', { count: state.count }), state.count)}
  </PillButton>;
}

const calendarLayoutStyles = StyleSheet.create({
  inlineDay: { paddingHorizontal: 16, paddingTop: 24 },
  daySkeleton: { borderRadius: radius.xl, borderWidth: 1, paddingVertical: 24 },
});

function CalendarInlineDaySlot({ loading, selected, label, tokens, children }: Readonly<{ loading: boolean; selected: boolean; label: string; tokens: ReturnType<typeof createTokensV2>; children: ReactNode }>) {
  if (!loading && !selected) return null;
  return <View testID="calendar-day-card-slot" style={calendarLayoutStyles.inlineDay}>{loading ? <View testID="calendar-day-skeleton" style={[calendarLayoutStyles.daySkeleton, { backgroundColor: tokens.bgCard, borderColor: tokens.hairlineGhost }]}><Skeleton variant="settings" rows={5} label={label} /></View> : children}</View>;
}

function calendarStatState(
  state: CalendarMonthDisplayState,
): 'default' | 'loading' | 'empty' {
  if (state === 'loading') return 'loading';
  if (state === 'ready') return 'default';
  return 'empty';
}

interface CalendarMonthFeedbackProps {
  state: CalendarMonthDisplayState;
  emptyText: string;
  futureText: string;
  createLabel: string;
  onCreate: () => void;
  tokens: ReturnType<typeof createTokensV2>;
}

function CalendarMonthFeedback({
  state,
  emptyText,
  futureText,
  createLabel,
  onCreate,
  tokens,
}: Readonly<CalendarMonthFeedbackProps>) {
  const styles = useMemo(() => createStyles(), []);
  if (state !== 'empty' && state !== 'future') return null;
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
  );
}

const EMPTY_LIST: readonly CalendarDayEntry[] = [];

function resolveMonthEntering(monthSlide: MonthSlide) {
  if (monthSlide === "right")
    return FadeInRight.duration(220).reduceMotion(ReduceMotion.System);
  if (monthSlide === "left")
    return FadeInLeft.duration(220).reduceMotion(ReduceMotion.System);
  return undefined;
}


export default function CalendarScreen() {
  const { profile, error: profileError, refetch: refetchProfile } = useProfile();
  const [selectedDay, setSelectedDay] = useAccountScopedState(() => formatAPIDate(new Date()));
  const currentMonth = useMemo(() => calendarMonthForDay(selectedDay), [selectedDay]);
  const [view, setView] = useState<CalendarView>('month');
  const monthQuery = useCalendarData(currentMonth);

  return (
    <CalendarScreenContent
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
  );
}

function CalendarLoadError({ onRetry, tokens }: Readonly<{ onRetry: () => void; tokens: ReturnType<typeof createTokensV2> }>) {
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(), []);
  return <View style={styles.errorWrap}>
    <View style={[styles.errorCard, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
      <Text style={[styles.errorText, { color: tokens.fg2 }]}>{t('calendar.loadError')}</Text>
      <PillButton variant="ghost" onClick={onRetry}>{t('common.retry')}</PillButton>
    </View>
  </View>;
}

function CalendarBody({ profileReady, profileError, onRetryProfile, error, onRetry, tokens, children }: Readonly<{
  profileReady: boolean;
  profileError: Error | null;
  onRetryProfile: () => void;
  error: string | null;
  onRetry: () => void;
  tokens: ReturnType<typeof createTokensV2>;
  children: ReactNode;
}>) {
  if (!profileReady && profileError) return <CalendarLoadError onRetry={onRetryProfile} tokens={tokens} />;
  if (profileReady && error) return <CalendarLoadError onRetry={onRetry} tokens={tokens} />;
  return children;
}

function calendarMonthFooter(profileReady: boolean, profileError: Error | null, error: string | null, footer: ReactNode) {
  if (profileReady ? error : profileError) return undefined;
  return <>{footer}</>;
}

interface CalendarScreenContentProps {
  profile: Pick<
    Profile,
    | 'weekStartDay'
    | 'timeZone'
    | 'hasProAccess'
    | 'hasGoogleConnection'
    | 'googleCalendarAutoSyncEnabled'
    | 'googleCalendarAutoSyncStatus'
    | 'googleCalendarLastSyncedAt'
  > | undefined;
  profileError: Error | null;
  onRetryProfile: () => void;
  currentMonth: Date;
  selectedDay: string;
  setSelectedDay: Dispatch<SetStateAction<string>>;
  monthQuery: ReturnType<typeof useCalendarData>;
  view: CalendarView;
  setView: Dispatch<SetStateAction<CalendarView>>;
}

function resolveProfileSettings(profile: CalendarScreenContentProps['profile']) {
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

// react-doctor-disable-next-line no-giant-component -- Screen orchestration is already decomposed into ./calendar/_components/*; the remaining hook wiring + JSX tree is inherently long, and further splitting is a regression-prone refactor with cross-platform parity cost. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
function CalendarScreenContent({
  profile,
  profileError,
  onRetryProfile,
  currentMonth,
  selectedDay,
  setSelectedDay,
  monthQuery,
  view,
  setView,
}: Readonly<CalendarScreenContentProps>) {
  const { t, i18n } = useTranslation();
  const clearance = useShellScrollerClearance();
  const listRef = useRef<FlatList<CalendarDayEntry>>(null);
  useRootScrollToTop('calendario', useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []));
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; import?: string }>();
  const { sheetRef, closeSheet } = useSheetHost();
  const { sheetRef: importSheetRef, closeSheet: closeImportSheet } = useSheetHost();
  const { displayTime } = useTimeFormat();
  const { weekStartsOn, hasProAccess, timeZone, autoSyncState } = resolveProfileSettings(profile);
  const todayKey = useCurrentDate(profile?.timeZone);
  const setCalendarHasError = useUIStore((state) => state.setCalendarHasError);
  const logHabit = useLogHabit();
  const { currentScheme, currentTheme } = useAppTheme();
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const styles = useMemo(() => createStyles(), []);
  const calendarGridRef = useRef<View>(null);
  const calendarDayRef = useRef<View>(null);
  const [monthSlide, setMonthSlide] = useState<MonthSlide>(null);
  const [weekAnchor, setWeekAnchor] = useAccountScopedState<Date | null>(null);
  const [weekSlide, setWeekSlide] = useState<MonthSlide>(null);
  const [agendaOffset, setAgendaOffset] = useAccountScopedState(0);
  const [rangeOffset, setRangeOffset] = useAccountScopedState(0);
  const [isDayDetailOpen, setIsDayDetailOpen] = useAccountScopedState(false);
  const [isEventsOpen, setIsEventsOpen] = useAccountScopedState(false)
  const [expandedHabitTitle, setExpandedHabitTitle] = useAccountScopedState<string | null>(null)
  const disclosedWeekDay = view === 'week' ? selectedDay : null
  const openDayDisclosure = (open: () => void) => closeSheet(() => { setIsDayDetailOpen(false); open() })
  const [isImportOpen, setIsImportOpen] = useAccountScopedState(false);
  const [importActionState, setImportActionState] = useAccountScopedState<CalendarImportActionState | null>(null);
  const importActionRef = useRef<CalendarImportActionHandle>(null);
  const commitCalendarImport = useCallback(() => importActionRef.current?.importSelected(), []);
  const [initialImportEventId, setInitialImportEventId] = useAccountScopedState<string | null>(null);
  const reviewRequested = params.mode === 'review';
  const routeRequestKey = calendarImportRouteRequestKey(reviewRequested, params.import === '1');
  const importRequested = useAccountBoundRouteRequest(routeRequestKey);
  useClearStaleCalendarImportRoute(routeRequestKey, importRequested);
  const showImportSheet = shouldOpenCalendarImportSheet(hasProAccess, isImportOpen, importRequested);
  const openImport = useCallback((eventId: string | null) => {
    const open = () => {
      setIsDayDetailOpen(false);
      setInitialImportEventId(eventId);
      setIsImportOpen(true);
    };
    if (isDayDetailOpen && view === 'week') closeSheet(open);
    else open();
  }, [closeSheet, isDayDetailOpen, setInitialImportEventId, setIsImportOpen, view, setIsDayDetailOpen]);
  const closeImport = useCallback(() => {
    setIsImportOpen(false);
    setInitialImportEventId(null);
    if (importRequested) router.replace('/calendar');
  }, [importRequested, router, setInitialImportEventId, setIsImportOpen]);
  const { data: connectedCalendars } = useCalendars({ enabled: hasProAccess });
  const showEventSource = (connectedCalendars?.length ?? 0) > 1;
  const showRecurring = useUIStore((state) => state.calendarShowRecurring);
  const {
    data: calendarEventsResult,
    isPending: calendarEventsPending,
    error: calendarEventsError,
    refetch: refetchCalendarEvents,
  } = useCalendarEvents({
    enabled: hasProAccess,
    timeZone: timeZone,
  });
  useCalendarAutoSyncState({
    enabled: hasProAccess,
    initialData: autoSyncState,
  });
  const openOrbitPro = useCallback(() => {
    closeSheet(() => {
      setIsDayDetailOpen(false);
      router.push('/upgrade');
    });
  }, [closeSheet, router, setIsDayDetailOpen]);
  const calendarEventsState = resolveCalendarEventsDisplayState({
    enabled: hasProAccess,
    isPending: calendarEventsPending,
    error: calendarEventsError,
    resultStatus: calendarEventsResult?.status,
  });

  const { dayMap, isLoading, error, refresh } = monthQuery;

  const weekStart = useMemo(
    () => startOfWeek(weekAnchor ?? parseAPIDate(todayKey), { weekStartsOn }),
    [todayKey, weekAnchor, weekStartsOn],
  );
  const weekEnd = useMemo(
    () => endOfWeek(weekAnchor ?? parseAPIDate(todayKey), { weekStartsOn }),
    [todayKey, weekAnchor, weekStartsOn],
  );
  const rangeEnd = useMemo(
    () => resolveCalendarRangeEnd(parseAPIDate(todayKey), rangeOffset),
    [rangeOffset, todayKey],
  );
  const rangeBounds = useMemo(() => {
    return { lo: addDays(rangeEnd, -(MAX_RANGE_DAYS - 1)), hi: rangeEnd };
  }, [rangeEnd]);

  const agendaStart = useMemo(() => addDays(parseAPIDate(todayKey), agendaOffset * 7), [agendaOffset, todayKey]);
  const agendaEnd = useMemo(() => addDays(agendaStart, 6), [agendaStart]);

  let gridStartDate = rangeBounds.lo;
  let gridEndDate = rangeBounds.hi;
  if (view === "week") {
    gridStartDate = weekStart;
    gridEndDate = weekEnd;
  } else if (view === "agenda") {
    gridStartDate = agendaStart;
    gridEndDate = agendaEnd;
  }

  const {
    dayMap: rangeDayMap,
    isLoading: rangeQueryLoading,
    error: rangeError,
    refresh: rangeRefresh,
  } = useCalendarRange(
    gridStartDate,
    gridEndDate,
    Boolean(profile) && (view === "week" || view === "range" || view === "agenda"),
  );

  const rangeLoading = !profile || rangeQueryLoading;

  const gridColumns = useMemo<TimeGridColumn[]>(() => {
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
    return days.map((date) => {
      const dateStr = formatAPIDate(date);
      return {
        date,
        dateStr,
        isToday: dateStr === todayKey,
        isFuture: dateStr > todayKey,
      };
    });
  }, [weekStart, weekEnd, todayKey]);

  const displayMonthDayMap = useMemo(
    () => filterRecurringDayMap(dayMap, showRecurring),
    [dayMap, showRecurring],
  );
  const displayRangeDayMap = useMemo(
    () => filterRecurringDayMap(rangeDayMap, showRecurring),
    [rangeDayMap, showRecurring],
  );



  const weekLabel = t('calendar.range.label', formatCalendarSpanEnds(weekStart, weekEnd, i18n.language));

  const prevMonth = useCallback(() => {
    setMonthSlide("left");
    const month = subMonths(currentMonth, 1);
    setSelectedDay(formatAPIDate(month));
  }, [currentMonth, setSelectedDay, setMonthSlide]);

  const nextMonth = useCallback(() => {
    setMonthSlide("right");
    const month = addMonths(currentMonth, 1);
    setSelectedDay(formatAPIDate(month));
  }, [currentMonth, setSelectedDay, setMonthSlide]);

  const selectMonth = useCallback((month: number, year: number) => {
    setMonthSlide(null);
    setSelectedDay(formatAPIDate(new Date(year, month, 1)));
  }, [setSelectedDay, setMonthSlide]);

  const goToCurrentMonth = useCallback(() => {
    setMonthSlide(null);
    setSelectedDay(todayKey);
  }, [setSelectedDay, todayKey, setMonthSlide]);

  const prevWeek = useCallback(() => {
    setWeekSlide("left");
    setWeekAnchor((a) => subWeeks(a ?? parseAPIDate(todayKey), 1));
  }, [setWeekAnchor, setWeekSlide, todayKey]);
  const nextWeek = useCallback(() => {
    setWeekSlide("right");
    setWeekAnchor((a) => addWeeks(a ?? parseAPIDate(todayKey), 1));
  }, [setWeekAnchor, setWeekSlide, todayKey]);
  const goToCurrentWeek = useCallback(() => {
    setWeekSlide(null);
    setWeekAnchor(parseAPIDate(todayKey));
  }, [todayKey, setWeekAnchor, setWeekSlide]);

  const swipeGesture = useHorizontalSwipe({
    onSwipeLeft: nextMonth,
    onSwipeRight: prevMonth,
    minDistance: CALENDAR_MONTH_SWIPE_THRESHOLD,
    minVelocity: 0,
  });

  const onSelectDay = useCallback((dateStr: string) => {
    setSelectedDay(dateStr);
    setIsDayDetailOpen(true);
  }, [setSelectedDay, setIsDayDetailOpen]);
  const selectMonthDay = useCallback((dateStr: string) => {
    setSelectedDay(dateStr);
  }, [setSelectedDay]);

  const closeDayDetail = useCallback(() => {
    setIsDayDetailOpen(false);
  }, [setIsDayDetailOpen]);

  const previousRange = useCallback(() => {
    setRangeOffset((offset) => offset - 1);
  }, [setRangeOffset]);
  const nextRange = useCallback(() => {
    setRangeOffset((offset) => Math.min(0, offset + 1));
  }, [setRangeOffset]);

  const viewOptions = useMemo(
    () => [
      { value: "month" as const, label: t("calendar.view.month") },
      { value: "week" as const, label: t("calendar.view.week") },
      { value: "range" as const, label: t("calendar.view.range") },
      { value: "agenda" as const, label: t("calendar.view.agenda") },
    ] as const,
    [t],
  );

  const weekdayHeaders = useMemo(
    () => formatWeekdayLabels(i18n.language, weekStartsOn).map((label, index) => ({ key: String(index), label })),
    [i18n.language, weekStartsOn],
  );

  const { gridDays, monthStats } = useMemo(
    () => buildCalendarMonthModel(currentMonth, displayMonthDayMap, weekStartsOn, todayKey),
    [currentMonth, displayMonthDayMap, weekStartsOn, todayKey],
  );
  const monthDisplayState = resolveCalendarMonthDisplayState({
    currentMonth,
    today: todayKey,
    hasEntries: monthStats.hasEntries,
    isLoading,
  });

  const rangeModel = useMemo(
    () => buildCalendarRangeModel(rangeEnd, displayRangeDayMap, weekStartsOn, todayKey),
    [rangeEnd, displayRangeDayMap, weekStartsOn, todayKey],
  );

  const rangeLabel = t('calendar.range.label', formatCalendarSpanEnds(rangeModel.start, rangeModel.end, i18n.language));

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
        };

  useLayoutEffect(() => {
    setCalendarHasError(Boolean(activeError));
    return () => setCalendarHasError(false);
  }, [activeError, setCalendarHasError]);

  const selectedEntries = useMemo(() => {
    if (!selectedDay) return [];
    return orderCalendarDayEntries(activeDayMap.get(selectedDay) ?? []);
  }, [selectedDay, activeDayMap]);

  const selectedCalendarEvents = useMemo(
    () =>
      hasProAccess && calendarEventsResult?.status === "connected"
        ? filterCalendarSyncEventsByDate(calendarEventsResult.events, selectedDay)
        : [],
    [calendarEventsResult, hasProAccess, selectedDay],
  );

  const filteredEntries = useMemo(
    () => filterRecurringEntries(selectedEntries, showRecurring),
    [selectedEntries, showRecurring],
  );

  const formattedSelectedDate = useMemo(() => {
    if (!selectedDay) return "";
    return formatCalendarDayTitle(selectedDay, i18n.language, todayKey, (date) => t('dates.todayWithDate', { date }));
  }, [i18n.language, selectedDay, todayKey, t]);

  const completedCount = filteredEntries.filter(
    (entry: CalendarDayEntry) => entry.status === "completed",
  ).length;

  const selectedDayLoggable = isCalendarDayLoggable(selectedDay, todayKey);

  const selectedEntrySourceStates = useMemo(() => {
    const sourceStates = new Map<string, boolean>();
    if (!selectedDay) return sourceStates;
    for (const entry of selectedEntries) {
      sourceStates.set(
        getCalendarEntryMutationKey(selectedDay, entry.habitId),
        entry.status === "completed",
      );
    }
    return sourceStates;
  }, [selectedDay, selectedEntries]);
  const { pendingEntryStates, startEntryMutation } = useCalendarEntryMutationLock(
    selectedEntrySourceStates,
  );

  const changeSelectedEntry = (entry: CalendarDayEntry, checked: boolean) => {
    if (!selectedDay) return null;
    const entryKey = getCalendarEntryMutationKey(selectedDay, entry.habitId);
    return startEntryMutation(entryKey, checked, () => logHabit.mutateAsync({
      habitId: entry.habitId,
      date: selectedDay,
      intent: checked ? "log" : "unlog",
    }));
  };

  const goToSelectedDay = () => {
    if (!selectedDay) return;
    closeSheet(() => {
      setIsDayDetailOpen(false);
      router.push(`/?date=${selectedDay}`);
    });
  };

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
  );

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
  );

  const monthEntering = resolveMonthEntering(monthSlide);

  const openHabitCreation = useCallback(() => {
    router.push(buildHabitCreateHref({ from: '/calendar' }));
  }, [router]);

  const openGoogleCalendar = () => {
    if (hasProAccess) openImport(null);
    else router.push('/upgrade');
  };

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
        tokens={tokens}
        period={{ month: undefined, week: {
          view: 'week' as const, label: weekLabel, previousLabel: t('common.previousWeek'), nextLabel: t('common.nextWeek'),
          onPrevious: prevWeek, onNext: nextWeek, onCurrent: goToCurrentWeek,
        }, range: {
          view: 'range' as const, label: rangeLabel, previousLabel: t('calendar.range.previous'), nextLabel: t('calendar.range.next'),
          onPrevious: previousRange, onNext: nextRange, onCurrent: () => setRangeOffset(0), nextDisabled: rangeOffset === 0,
        }, agenda: {
          view: 'agenda' as const, label: t('calendar.range.label', formatCalendarSpanEnds(agendaStart, agendaEnd, i18n.language)), previousLabel: t('common.previousWeek'), nextLabel: t('common.nextWeek'),
          onPrevious: () => setAgendaOffset((offset) => offset - 1), onNext: () => setAgendaOffset((offset) => offset + 1), onCurrent: () => setAgendaOffset(0),
        } }[view]}
        viewSelector={<SegmentedControl<CalendarView> fullWidth options={viewOptions} value={view} onChange={(nextView) => {
          listRef.current?.scrollToOffset({ offset: 0, animated: false });
          setView(nextView);
        }} label={t('calendar.view.switchLabel')} />}
      />
  );

  const monthBody = (
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

      <CalendarInlineDaySlot loading={monthDisplayState === 'loading'} selected={Boolean(selectedDay)} label={t('calendar.loading')} tokens={tokens}>
          <CalendarDayDetail
            selectedDate={selectedDay}
            title={formattedSelectedDate}
            filteredEntries={filteredEntries}
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
  );

  const listFooter = (
    <View style={styles.listFooter}>
      <CalendarStats
        stats={monthStatTiles}
        state={calendarStatState(monthDisplayState)}
        loadingLabel={t('calendar.loading')}
        emptyLabel={t('calendar.emptyStat')}
      />

    </View>
  );

  const viewBody = {
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
    month: monthBody,
  }[view];

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.safeArea, { backgroundColor: tokens.bg }]}>
      <ScreenReaderHeading title={t('nav.calendar')} />
      <CalendarOptions tokens={tokens} onGoogleCalendar={profile ? openGoogleCalendar : undefined} />

      <FlatList
        ref={listRef}
        style={styles.container}
        data={EMPTY_LIST}
        keyExtractor={(_item, index) => String(index)}
        renderItem={null}
        ListHeaderComponent={<>
          {calendarHeader}
          <CalendarBody profileReady={Boolean(profile)} profileError={profileError} onRetryProfile={onRetryProfile} error={activeError} onRetry={() => void activeRefresh()} tokens={tokens}>
            {viewBody}
          </CalendarBody>
        </>}
        ListHeaderComponentStyle={view === 'week' ? styles.container : undefined}
        ListFooterComponent={view === 'month' ? calendarMonthFooter(Boolean(profile), profileError, activeError, listFooter) : undefined}
        contentContainerStyle={{ paddingBottom: clearance, ...(view === 'week' ? { flex: 1 } : {}) }}
        scrollEnabled={view !== 'week'}
        showsVerticalScrollIndicator={false}
      />

      {isDayDetailOpen && view === 'week' && selectedDay ? (<Sheet
        ref={sheetRef}
        open
        onClose={closeDayDetail}
        title={formattedSelectedDate}
        key={selectedDay}
      >
        <View style={styles.sheetContent}>
          <CalendarDayDetail
            selectedDate={selectedDay}
            title={formattedSelectedDate}
            showTitle={false}
            filteredEntries={filteredEntries}
            calendarEvents={selectedCalendarEvents}
            showEventSource={showEventSource}
            calendarEventsState={calendarEventsState}
            onRetryCalendarEvents={() => void refetchCalendarEvents()}
            onReconnectCalendarEvents={() => openImport(null)}
            onOpenCalendarImport={openImport}
            onOpenEvents={() => openDayDisclosure(() => setIsEventsOpen(true))}
            onOpenHabitTitle={(title) => openDayDisclosure(() => setExpandedHabitTitle(title))}
            onViewPro={openOrbitPro}
            completedCount={completedCount}
            loggable={selectedDayLoggable}
            pendingEntryStates={pendingEntryStates}
            onEntryChange={changeSelectedEntry}
            onGoToDay={goToSelectedDay}
            displayTime={displayTime}
            t={t}
            tokens={tokens}
          />
        </View>
      </Sheet>) : null}
      {disclosedWeekDay ? <CalendarDayEvents key={disclosedWeekDay} sheetOnly open={isEventsOpen} onClose={() => setIsEventsOpen(false)} calendarEvents={selectedCalendarEvents} showEventSource={showEventSource} onOpenImport={openImport} t={t} displayTime={displayTime} /> : null}
      <ExpandedHabitTitleSheet title={expandedHabitTitle} onClose={() => setExpandedHabitTitle(null)} tokens={tokens} />
      {showImportSheet ? (<Sheet
        ref={importSheetRef}
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
            setIsImportOpen(false);
            router.push('/(tabs)');
          })}
        />
      </Sheet>) : null}
    </SafeAreaView>
  );
}

function createStyles() {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    container: { flex: 1 },

    listFooter: {
      paddingTop: 24,
    },

    errorWrap: {
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    emptyMonth: {
      alignItems: 'flex-start',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    emptyMonthText: {
      fontFamily: 'Geist_400Regular',
      fontSize: 16,
      lineHeight: 24,
    },
    errorCard: {
      alignItems: "center",
      gap: 12,
      paddingVertical: 24,
      paddingHorizontal: 16,
      borderRadius: 18,
      borderWidth: 1,
    },
    errorText: {
      fontFamily: "Geist_400Regular",
      fontSize: 14,
      textAlign: "center",
    },

    sheetScroll: {
      flex: 1,
    },
    sheetContent: {
      gap: 12,
    },
  });
}

function ExpandedHabitTitleSheet({ title, onClose, tokens }: Readonly<{ title: string | null; onClose: () => void; tokens: ReturnType<typeof createTokensV2> }>) {
  const { t } = useTranslation()
  if (!title) return null
  return <Sheet open title={t('habits.form.title')} onClose={onClose}>
    <Text style={{ fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 23.8, color: tokens.fg1 }}>{title}</Text>
  </Sheet>
}
