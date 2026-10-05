import { useCalendars } from '@/hooks/use-calendars';
import { CalendarOptions } from './calendar/_components/calendar-options';
import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef, type Dispatch, type SetStateAction, type ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  useWindowDimensions,
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
import { enUS, ptBR } from "date-fns/locale";
import {
  capitalizeFirstLetter,
  formatCalendarWeekLabel,
  buildHabitCreateHref,
  formatCalendarDayTitle,
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
  formatLocaleDate,
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
import { ListRow } from "@/components/ui/list-row";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CalendarHeader,
  CalendarWeekNav,
} from "./calendar/_components/calendar-shell";
import { CalendarGrid } from "./calendar/_components/calendar-grid";
import { CalendarDayDetail } from "./calendar/_components/calendar-day-detail";
import { CalendarDayEvents } from './calendar/_components/calendar-day-events';
import { CalendarImportContent, type CalendarImportActionHandle, type CalendarImportActionState } from '@/components/calendar-sync/calendar-import-content';
import { plural } from '@/lib/plural';
import { CalendarStats } from "./calendar/_components/calendar-stats";
import { CalendarEntryDetails } from './calendar/_components/calendar-entry-details';
import { CalendarWeekView } from "./calendar/_components/calendar-week-view";
import { CalendarRangeView } from "./calendar/_components/calendar-range-view";
import type { TimeGridColumn } from "./calendar/_components/calendar-time-grid";
import { useCurrentDate } from "./use-today-date";
import { useUIStore } from "@/stores/ui-store";

type MonthSlide = "left" | "right" | null;
type CalendarView = "month" | "week" | "range" | "agenda";

function calendarDateFnsLocale(locale: string) {
  return locale === "pt-BR" ? ptBR : enUS;
}

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
  if (loading) return <View style={calendarLayoutStyles.inlineDay}><View testID="calendar-day-skeleton" style={[calendarLayoutStyles.daySkeleton, { backgroundColor: tokens.bgCard, borderColor: tokens.hairlineGhost }]}><Skeleton variant="settings" rows={5} label={label} /></View></View>;
  if (!selected) return null;
  return <View style={calendarLayoutStyles.inlineDay}>{children}</View>;
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

interface CalendarAgendaViewProps {
  startDate: Date;
  dayMap: ReadonlyMap<string, CalendarDayEntry[]>;
  displayTime: (time: string) => string;
  language: string;
  todayKey: string;
  isLoading: boolean;
  loadingLabel: string;
  todayLabel: string;
  emptyLabel: string;
  styles: ReturnType<typeof createStyles>;
  tokens: ReturnType<typeof createTokensV2>;
}

function CalendarAgendaView({
  startDate,
  dayMap,
  displayTime,
  language,
  todayKey,
  isLoading,
  loadingLabel,
  todayLabel,
  emptyLabel,
  styles,
  tokens,
}: Readonly<CalendarAgendaViewProps>) {
  const { t } = useTranslation();
  const [selectedEntry, setSelectedEntry] = useState<CalendarDayEntry | null>(null);
  const dates = eachDayOfInterval({ start: startDate, end: addDays(startDate, 6) });

  return (
    <View
      testID="calendar-agenda-view"
      accessibilityState={{ busy: isLoading }}
      style={styles.agendaView}
    >
      {isLoading ? dates.map((date, index) => (
        <View key={formatAPIDate(date)} testID="calendar-agenda-loading-day">
          {index === 0 ? (
            <Skeleton variant="habit-row" label={loadingLabel} />
          ) : (
            <Skeleton variant="habit-row" grouped />
          )}
        </View>
      )) : dates.map((date) => {
        const entries = dayMap.get(formatAPIDate(date)) ?? [];
        const dateLabel = capitalizeFirstLetter(
          formatLocaleDate(date, language, {
            weekday: "long",
            month: "long",
            day: "numeric",
          }),
        );
        const heading = formatAPIDate(date) === todayKey ? `${todayLabel}, ${dateLabel}` : dateLabel;

        return (
          <View
            key={formatAPIDate(date)}
            testID="calendar-agenda-day"
            style={styles.agendaDay}
          >
            <Text
              accessibilityRole="header"
              style={[styles.agendaHeading, { color: tokens.fg2 }]}
            >
              {heading}
            </Text>
            {entries.length === 0 ? (
              <Text style={[styles.agendaEmpty, { color: tokens.fg3 }]}>
                {emptyLabel}
              </Text>
            ) : (
              <View>
                {entries.map((entry) => (
                  <ListRow
                    compact
                    key={entry.habitId}
                    title={entry.title}
                    description={entry.dueTime ? displayTime(entry.dueTime) : undefined}
                    textMode="personal"
                    chevron={false}
                    accessibilityLabel={entry.dueTime
                      ? t('calendar.agenda.timedEntryLabel', { title: entry.title, time: displayTime(entry.dueTime) })
                      : entry.title}
                    onClick={() => setSelectedEntry(entry)}
                  />
                ))}
              </View>
            )}
          </View>
        );
      })}
      {selectedEntry ? <CalendarEntryDetails entries={[selectedEntry]} title={t('calendar.entryDetails')} displayTime={displayTime} onClose={() => setSelectedEntry(null)} /> : null}
    </View>
  );
}

export default function CalendarScreen() {
  const { profile, error: profileError, refetch: refetchProfile } = useProfile();
  const [selectedDay, setSelectedDay] = useState(() => formatAPIDate(new Date()));
  const currentMonth = useMemo(() => calendarMonthForDay(selectedDay), [selectedDay]);
  const [view, setView] = useState<CalendarView>('month');
  const monthQuery = useCalendarData(currentMonth);
  if (!profile) {
    return (
      <CalendarProfileState
        failed={Boolean(profileError)}
        onRetry={() => void refetchProfile()}
        currentMonth={currentMonth}
        setSelectedDay={setSelectedDay}
        view={view}
        setView={setView}
      />
    );
  }

  return (
    <CalendarScreenContent
      profile={profile}
      currentMonth={currentMonth}
      selectedDay={selectedDay}
      setSelectedDay={setSelectedDay}
      monthQuery={monthQuery}
      view={view}
      setView={setView}
    />
  );
}

function CalendarProfileState({
  failed,
  onRetry,
  currentMonth,
  setSelectedDay,
  view,
  setView,
}: Readonly<{ failed: boolean; onRetry: () => void; currentMonth: Date; setSelectedDay: Dispatch<SetStateAction<string>>; view: CalendarView; setView: Dispatch<SetStateAction<CalendarView>> }>) {
  const { t, i18n } = useTranslation();
  const { currentScheme, currentTheme } = useAppTheme();
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const styles = useMemo(() => createStyles(), []);
  const clearance = useShellScrollerClearance();
  const scrollRef = useRef<ScrollView>(null);
  useRootScrollToTop('calendario', useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.safeArea, { backgroundColor: tokens.bg }]}>
      <ScreenReaderHeading title={t('nav.calendar')} />
      <CalendarOptions tokens={tokens} />
      <ScrollView ref={scrollRef} style={styles.profileStateWrap} contentContainerStyle={[styles.profileScrollContent, { paddingBottom: clearance }]}>
        {failed ? (
          <View style={[styles.errorCard, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
            <Text style={[styles.errorText, { color: tokens.fg2 }]}>{t('calendar.loadError')}</Text>
            <PillButton variant="ghost" onClick={onRetry}>{t('common.retry')}</PillButton>
          </View>
        ) : (
          <View style={styles.profileLoading}>
            <CalendarHeader
              currentMonth={currentMonth}
              todayKey={formatAPIDate(new Date())}
              previousMonthLabel={t('common.previousMonth')}
              nextMonthLabel={t('common.nextMonth')}
              onPreviousMonth={() => setSelectedDay(formatAPIDate(subMonths(currentMonth, 1)))}
              onNextMonth={() => setSelectedDay(formatAPIDate(addMonths(currentMonth, 1)))}
              onCurrentMonth={() => setSelectedDay(formatAPIDate(new Date()))}
              onSelectMonth={(month, year) => setSelectedDay(formatAPIDate(new Date(year, month, 1)))}
              tokens={tokens}
              showMonthNavigation={view === 'month'}
              viewSelector={<SegmentedControl<CalendarView> fullWidth options={[
                { value: 'month', label: t('calendar.view.month') },
                { value: 'week', label: t('calendar.view.week') },
                { value: 'range', label: t('calendar.view.range') },
                { value: 'agenda', label: t('calendar.view.agenda') },
              ]} value={view} onChange={setView} label={t('calendar.view.switchLabel')} />}
            />
            <CalendarGrid
              gridDays={buildCalendarMonthModel(currentMonth, new Map(), 1, formatAPIDate(new Date())).gridDays}
              weekdayHeaders={[]}
              selectedDay={null}
              isLoading
              onSelectDay={() => undefined}
              language={i18n.language}
              t={t}
              tokens={tokens}
              todayKey={formatAPIDate(new Date())}
            />
            <CalendarInlineDaySlot loading selected={false} label={t('calendar.loading')} tokens={tokens}>{null}</CalendarInlineDaySlot>
            <View style={styles.listFooter}><CalendarStats
              stats={[
                { key: 'bestStreak', value: 0, label: t('calendar.bestStreak') },
                { key: 'totalLogs', value: 0, label: t('calendar.totalLogs') },
                { key: 'missed', value: 0, label: t('calendar.missedCount') },
              ]}
              state="loading"
              loadingLabel={t('calendar.loading')}
            /></View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
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
  >;
  currentMonth: Date;
  selectedDay: string;
  setSelectedDay: Dispatch<SetStateAction<string>>;
  monthQuery: ReturnType<typeof useCalendarData>;
  view: CalendarView;
  setView: Dispatch<SetStateAction<CalendarView>>;
}

// react-doctor-disable-next-line no-giant-component -- Screen orchestration is already decomposed into ./calendar/_components/*; the remaining hook wiring + JSX tree is inherently long, and further splitting is a regression-prone refactor with cross-platform parity cost. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
function CalendarScreenContent({
  profile,
  currentMonth,
  selectedDay,
  setSelectedDay,
  monthQuery,
  view,
  setView,
}: Readonly<CalendarScreenContentProps>) {
  const { t, i18n } = useTranslation();
  const clearance = useShellScrollerClearance();
  const scrollRef = useRef<ScrollView>(null);
  const listRef = useRef<FlatList<CalendarDayEntry>>(null);
  useRootScrollToTop('calendario', useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; import?: string }>();
  const { sheetRef, closeSheet } = useSheetHost();
  const { sheetRef: importSheetRef, closeSheet: closeImportSheet } = useSheetHost();
  const { displayTime } = useTimeFormat();
  const todayKey = useCurrentDate(profile.timeZone);
  const setCalendarHasError = useUIStore((state) => state.setCalendarHasError);
  const logHabit = useLogHabit();
  const { currentScheme, currentTheme } = useAppTheme();
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const dateFnsLocale = calendarDateFnsLocale(i18n.language);
  const weekStartsOn = profile.weekStartDay;
  const styles = useMemo(() => createStyles(), []);
  const calendarGridRef = useRef<View>(null);
  const calendarDayRef = useRef<View>(null);
  const [monthSlide, setMonthSlide] = useState<MonthSlide>(null);
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [weekSlide, setWeekSlide] = useState<MonthSlide>(null);
  const [rangeOffset, setRangeOffset] = useState(0);
  const [isDayDetailOpen, setIsDayDetailOpen] = useState(false);
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
  const showImportSheet = shouldOpenCalendarImportSheet(profile.hasProAccess, isImportOpen, importRequested);
  const openImport = useCallback((eventId: string | null) => {
    const open = () => {
      setIsDayDetailOpen(false);
      setInitialImportEventId(eventId);
      setIsImportOpen(true);
    };
    if (isDayDetailOpen && view === 'week') closeSheet(open);
    else open();
  }, [closeSheet, isDayDetailOpen, setInitialImportEventId, setIsImportOpen, view]);
  const closeImport = useCallback(() => {
    setIsImportOpen(false);
    setInitialImportEventId(null);
    if (importRequested) router.replace('/calendar');
  }, [importRequested, router, setInitialImportEventId, setIsImportOpen]);
  const { data: connectedCalendars } = useCalendars({ enabled: profile.hasProAccess });
  const showEventSource = (connectedCalendars?.length ?? 0) > 1;
  const showRecurring = useUIStore((state) => state.calendarShowRecurring);
  const {
    data: calendarEventsResult,
    isPending: calendarEventsPending,
    error: calendarEventsError,
    refetch: refetchCalendarEvents,
  } = useCalendarEvents({
    enabled: profile.hasProAccess,
    timeZone: profile.timeZone,
  });
  useCalendarAutoSyncState({
    enabled: profile.hasProAccess,
    initialData: {
      enabled: profile.googleCalendarAutoSyncEnabled,
      status: profile.googleCalendarAutoSyncStatus,
      lastSyncedAt: profile.googleCalendarLastSyncedAt,
      hasGoogleConnection: profile.hasGoogleConnection,
    },
  });
  const openOrbitPro = useCallback(() => {
    closeSheet(() => {
      setIsDayDetailOpen(false);
      router.push('/upgrade');
    });
  }, [closeSheet, router]);
  const calendarEventsState = resolveCalendarEventsDisplayState({
    enabled: profile.hasProAccess,
    isPending: calendarEventsPending,
    error: calendarEventsError,
    resultStatus: calendarEventsResult?.status,
  });

  const { dayMap, isLoading, error, refresh } = monthQuery;

  const weekStart = useMemo(
    () => startOfWeek(weekAnchor, { weekStartsOn }),
    [weekAnchor, weekStartsOn],
  );
  const weekEnd = useMemo(
    () => endOfWeek(weekAnchor, { weekStartsOn }),
    [weekAnchor, weekStartsOn],
  );
  const rangeEnd = useMemo(
    () => resolveCalendarRangeEnd(parseAPIDate(todayKey), rangeOffset),
    [rangeOffset, todayKey],
  );
  const rangeBounds = useMemo(() => {
    return { lo: addDays(rangeEnd, -(MAX_RANGE_DAYS - 1)), hi: rangeEnd };
  }, [rangeEnd]);

  const agendaStart = useMemo(() => parseAPIDate(todayKey), [todayKey]);
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
    isLoading: rangeLoading,
    error: rangeError,
    refresh: rangeRefresh,
  } = useCalendarRange(
    gridStartDate,
    gridEndDate,
    view === "week" || view === "range" || view === "agenda",
  );

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



  const weekLabel = formatCalendarWeekLabel(weekStart, weekEnd, i18n.language);

  const prevMonth = useCallback(() => {
    setMonthSlide("left");
    const month = subMonths(currentMonth, 1);
    setSelectedDay(formatAPIDate(month));
  }, [currentMonth, setSelectedDay]);

  const nextMonth = useCallback(() => {
    setMonthSlide("right");
    const month = addMonths(currentMonth, 1);
    setSelectedDay(formatAPIDate(month));
  }, [currentMonth, setSelectedDay]);

  const selectMonth = useCallback((month: number, year: number) => {
    setMonthSlide(null);
    setSelectedDay(formatAPIDate(new Date(year, month, 1)));
  }, [setSelectedDay]);

  const goToCurrentMonth = useCallback(() => {
    setMonthSlide(null);
    setSelectedDay(todayKey);
  }, [setSelectedDay, todayKey]);

  const prevWeek = useCallback(() => {
    setWeekSlide("left");
    setWeekAnchor((a) => subWeeks(a, 1));
  }, []);
  const nextWeek = useCallback(() => {
    setWeekSlide("right");
    setWeekAnchor((a) => addWeeks(a, 1));
  }, []);
  const goToCurrentWeek = useCallback(() => {
    setWeekSlide(null);
    setWeekAnchor(new Date());
  }, []);

  const swipeGesture = useHorizontalSwipe({
    onSwipeLeft: nextMonth,
    onSwipeRight: prevMonth,
    minDistance: CALENDAR_MONTH_SWIPE_THRESHOLD,
    minVelocity: 0,
  });

  const onSelectDay = useCallback((dateStr: string) => {
    setSelectedDay(dateStr);
    setIsDayDetailOpen(true);
  }, [setSelectedDay]);
  const selectMonthDay = useCallback((dateStr: string) => {
    setSelectedDay(dateStr);
  }, [setSelectedDay]);

  const closeDayDetail = useCallback(() => {
    setIsDayDetailOpen(false);
  }, []);

  const previousRange = useCallback(() => {
    setRangeOffset((offset) => offset - 1);
  }, []);
  const nextRange = useCallback(() => {
    setRangeOffset((offset) => Math.min(0, offset + 1));
  }, []);

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

  const rangeLabel = useMemo(() => {
    const pattern = i18n.language === "pt-BR" ? "d MMM" : "MMM d";
    return t("calendar.range.label", {
      start: format(rangeModel.start, pattern, { locale: dateFnsLocale }),
      end: format(rangeModel.end, pattern, { locale: dateFnsLocale }),
    });
  }, [dateFnsLocale, i18n.language, rangeModel.end, rangeModel.start, t]);

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
    return activeDayMap.get(selectedDay) ?? [];
  }, [selectedDay, activeDayMap]);

  const selectedCalendarEvents = useMemo(
    () =>
      profile.hasProAccess && calendarEventsResult?.status === "connected"
        ? filterCalendarSyncEventsByDate(calendarEventsResult.events, selectedDay)
        : [],
    [calendarEventsResult, profile.hasProAccess, selectedDay],
  );

  const filteredEntries = useMemo(
    () => filterRecurringEntries(selectedEntries, showRecurring),
    [selectedEntries, showRecurring],
  );

  const formattedSelectedDate = useMemo(() => {
    if (!selectedDay) return "";
    return formatCalendarDayTitle(selectedDay, i18n.language, todayKey, t('dates.today'));
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
        showMonthNavigation={view === 'month'}
        periodNavigation={view === 'week' && <CalendarWeekNav
          weekLabel={weekLabel}
          previousWeekLabel={t('common.previousWeek')}
          nextWeekLabel={t('common.nextWeek')}
          currentWeekLabel={t('calendar.goToCurrentWeek')}
          onPreviousWeek={prevWeek}
          onNextWeek={nextWeek}
          onCurrentWeek={goToCurrentWeek}
          tokens={tokens}
        />}
        viewSelector={<SegmentedControl<CalendarView> fullWidth options={viewOptions} value={view} onChange={setView} label={t('calendar.view.switchLabel')} />}
      />
  );

  const listHeader = (
    <>
      {calendarHeader}
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

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.safeArea, { backgroundColor: tokens.bg }]}>
      <ScreenReaderHeading title={t('nav.calendar')} />
      <CalendarOptions tokens={tokens} onGoogleCalendar={() => profile.hasProAccess ? openImport(null) : router.push('/upgrade')} />

      {activeError && (
        <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={{ paddingBottom: clearance }}>
          {calendarHeader}
          <View style={styles.errorWrap}>
            <View
              style={[
                styles.errorCard,
                { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
              ]}
            >
              <Text style={[styles.errorText, { color: tokens.fg2 }]}>
                {t("calendar.loadError")}
              </Text>
              <PillButton variant="ghost" onClick={() => void activeRefresh()}>
                {t("common.retry")}
              </PillButton>
            </View>
          </View>
        </ScrollView>
      )}
      {!activeError && view === "month" && (
        <FlatList
          ref={listRef}
          style={styles.container}
          data={EMPTY_LIST}
          keyExtractor={(_item, index) => String(index)}
          renderItem={null}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          contentContainerStyle={{ paddingBottom: clearance }}
          showsVerticalScrollIndicator={false}
        />
      )}
      {!activeError && view !== "month" && (
        <ScrollView
          ref={scrollRef}
          style={styles.container}
          contentContainerStyle={{ paddingBottom: clearance }}
          showsVerticalScrollIndicator={false}
        >
          {calendarHeader}
          {view === "week" ? (
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
              timeZone={profile.timeZone}
              t={t}
              tokens={tokens}
            />
          ) : view === "range" ? (
            <CalendarRangeView
              model={rangeModel}
              weekdayLabels={weekdayHeaders.map((weekday) => weekday.label)}
              rangeLabel={rangeLabel}
              previousRangeLabel={t("calendar.range.previous")}
              nextRangeLabel={t("calendar.range.next")}
              onPreviousRange={previousRange}
              onNextRange={nextRange}
              nextRangeDisabled={rangeOffset === 0}
              isLoading={rangeLoading}
              loadingLabel={t("common.loading")}
              stats={rangeStatTiles}
              language={i18n.language}
              t={t}
              tokens={tokens}
            />
          ) : (
            <CalendarAgendaView
              startDate={agendaStart}
              dayMap={displayRangeDayMap}
              displayTime={displayTime}
              language={i18n.language}
              todayKey={todayKey}
              isLoading={rangeLoading}
              loadingLabel={t("common.loading")}
              todayLabel={t("calendar.agenda.today")}
              emptyLabel={t("calendar.agenda.empty")}
              styles={styles}
              tokens={tokens}
            />
          )}
        </ScrollView>
      )}

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


    agendaView: {
      alignSelf: "flex-start",
      gap: 16,
      maxWidth: 560,
      paddingHorizontal: 16,
      width: "100%",
    },
    agendaDay: {
      gap: 4,
    },
    agendaHeading: {
      fontFamily: "Geist_500Medium",
      fontSize: 14,
      lineHeight: 22,
    },
    agendaEmpty: {
      fontFamily: "Geist_400Regular",
      fontSize: 14,
      lineHeight: 22,
    },

    listFooter: {
      paddingTop: 24,
    },


    errorWrap: {
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    profileStateWrap: {
      flex: 1,
    },
    profileScrollContent: {
      paddingTop: 12,
    },
    profileLoading: {
      gap: 0,
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
