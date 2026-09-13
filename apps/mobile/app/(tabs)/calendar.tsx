import { useState, useMemo, useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { useTourTarget } from "@/hooks/use-tour-target";
import { useTourScrollContainer } from "@/hooks/use-tour-scroll-container";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import {
  FadeInLeft,
  FadeInRight,
  ReduceMotion,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
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
} from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import {
  capitalizeFirstLetter,
  buildCalendarRangeModel,
  CALENDAR_MONTH_SWIPE_THRESHOLD,
  filterRecurringDayMap,
  filterRecurringEntries,
  filterCalendarSyncEventsByDate,
  formatAPIDate,
  parseAPIDate,
  MAX_RANGE_DAYS,
  buildCalendarMonthModel,
  formatLocaleDate,
  resolveCalendarRangeEnd,
  CALENDAR_MONTH_GRID_GEOMETRY,
  resolveCalendarMonthDisplayState,
  type CalendarMonthDisplayState,
  getFriendlyErrorMessage,
} from "@orbit/shared/utils";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";
import type { Profile } from "@orbit/shared/types/profile";
import { useCalendarData, useCalendarRange } from "@/hooks/use-habits";
import { useProfile } from "@/hooks/use-profile";
import { useCalendarEvents } from "@/hooks/use-calendar-events";
import {
  useCalendarAutoSyncState,
  useSetCalendarAutoSync,
} from "@/hooks/use-calendar-auto-sync";
import { useAppToast } from "@/hooks/use-app-toast";
import { useTimeFormat } from "@/hooks/use-time-format";
import { useHorizontalSwipe } from "@/hooks/use-horizontal-swipe";
import { createTokensV2 } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { Sheet, useSheetHost } from '@/components/ui/sheet';
import { PillButton } from "@/components/ui/pill-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ListRow } from "@/components/ui/list-row";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CalendarHeader,
  CalendarLegend,
} from "./calendar/_components/calendar-shell";
import { CalendarLoadingBar } from "./calendar/_components/calendar-loading-bar";
import { CalendarGrid } from "./calendar/_components/calendar-grid";
import { CalendarDayDetail } from "./calendar/_components/calendar-day-detail";
import { CalendarStats } from "./calendar/_components/calendar-stats";
import { CalendarWeekView } from "./calendar/_components/calendar-week-view";
import { CalendarRangeView } from "./calendar/_components/calendar-range-view";
import { ShowRecurringToggle } from "./calendar/_components/show-recurring-toggle";
import type { TimeGridColumn } from "./calendar/_components/calendar-time-grid";
import { useCurrentDate } from "./use-today-date";
import { useUIStore } from "@/stores/ui-store";

type MonthSlide = "left" | "right" | null;
type CalendarView = "month" | "week" | "range" | "agenda";

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
                    key={entry.habitId}
                    title={entry.title}
                    value={entry.dueTime ? displayTime(entry.dueTime) : undefined}
                    readOnly
                    wrapTitle
                  />
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

export default function CalendarScreen() {
  const { profile, error: profileError, refetch: refetchProfile } = useProfile();
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const monthQuery = useCalendarData(currentMonth);
  if (!profile) {
    return (
      <CalendarProfileState
        failed={Boolean(profileError)}
        onRetry={() => void refetchProfile()}
      />
    );
  }

  return (
    <CalendarScreenContent
      profile={profile}
      currentMonth={currentMonth}
      setCurrentMonth={setCurrentMonth}
      monthQuery={monthQuery}
    />
  );
}

function CalendarProfileState({
  failed,
  onRetry,
}: Readonly<{ failed: boolean; onRetry: () => void }>) {
  const { t } = useTranslation();
  const { currentScheme, currentTheme } = useAppTheme();
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const styles = useMemo(() => createStyles(), []);

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.safeArea, { backgroundColor: tokens.bg }]}>
      <View style={styles.profileStateWrap}>
        {failed ? (
          <View style={[styles.errorCard, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
            <Text style={[styles.errorText, { color: tokens.fg2 }]}>{t('calendar.loadError')}</Text>
            <PillButton variant="ghost" onClick={onRetry}>{t('common.retry')}</PillButton>
          </View>
        ) : (
          <View style={styles.profileLoading}>
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
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

interface CalendarScreenContentProps {
  profile: Pick<Profile, 'weekStartDay' | 'timeZone' | 'hasProAccess'>;
  currentMonth: Date;
  setCurrentMonth: Dispatch<SetStateAction<Date>>;
  monthQuery: ReturnType<typeof useCalendarData>;
}

// react-doctor-disable-next-line no-giant-component -- Screen orchestration is already decomposed into ./calendar/_components/*; the remaining hook wiring + JSX tree is inherently long, and further splitting is a regression-prone refactor with cross-platform parity cost. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
function CalendarScreenContent({
  profile,
  currentMonth,
  setCurrentMonth,
  monthQuery,
}: Readonly<CalendarScreenContentProps>) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { sheetRef, closeSheet } = useSheetHost();
  const { showError } = useAppToast();
  const { displayTime } = useTimeFormat();
  const todayKey = useCurrentDate(profile.timeZone);
  const setShowCreateModal = useUIStore((state) => state.setShowCreateModal);
  const { currentScheme, currentTheme } = useAppTheme();
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const dateFnsLocale = i18n.language === "pt-BR" ? ptBR : enUS;
  const weekStartsOn = profile.weekStartDay;
  const styles = useMemo(() => createStyles(), []);
  const calendarGridRef = useRef<View>(null);
  const calendarDayRef = useRef<View>(null);
  const calendarScrollRef = useRef<FlatList<CalendarDayEntry>>(null);
  useTourTarget("tour-calendar-grid", calendarGridRef);
  useTourTarget("tour-calendar-day", calendarDayRef);
  const calendarScrollTo = useCallback((y: number) => {
    calendarScrollRef.current?.scrollToOffset({ offset: y, animated: true });
  }, []);
  const { onTourScroll: onCalendarTourScroll } = useTourScrollContainer(
    "/calendar",
    calendarScrollTo,
  );
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollCalendarToTop = useCallback(() => {
    calendarScrollTo(0);
  }, [calendarScrollTo]);
  const handleCalendarScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      onCalendarTourScroll(event);
      setShowScrollTop(event.nativeEvent.contentOffset.y > 600);
    },
    [onCalendarTourScroll],
  );

  const [view, setView] = useState<CalendarView>("month");
  const [scrollTopResetView, setScrollTopResetView] = useState(view);
  if (view !== scrollTopResetView) {
    setScrollTopResetView(view);
    setShowScrollTop(false);
  }
  const [monthSlide, setMonthSlide] = useState<MonthSlide>(null);
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [weekSlide, setWeekSlide] = useState<MonthSlide>(null);
  const [rangeOffset, setRangeOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(() =>
    formatAPIDate(new Date()),
  );
  const [isDayDetailOpen, setIsDayDetailOpen] = useState(false);
  const [showRecurring, setShowRecurring] = useState(true);
  const { data: calendarEventsResult } = useCalendarEvents({
    enabled: profile.hasProAccess,
  });
  const { data: autoSyncState } = useCalendarAutoSyncState({
    enabled: profile.hasProAccess,
  });
  const setCalendarAutoSync = useSetCalendarAutoSync();

  const handleCalendarAutoSyncChange = useCallback(async (enabled: boolean) => {
    try {
      await setCalendarAutoSync.mutateAsync({ enabled });
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(
        error,
        t,
        'calendar.autoSync.syncFailed',
        'generic',
      ));
    }
  }, [setCalendarAutoSync, showError, t]);

  const openOrbitPro = useCallback(() => {
    closeSheet(() => {
      setIsDayDetailOpen(false);
      router.push('/upgrade');
    });
  }, [closeSheet, router]);

  const { dayMap, isLoading, isFetching, error, refresh } = monthQuery;

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

  const [gridStartDate, gridEndDate] =
    view === "week"
      ? [weekStart, weekEnd]
      : view === "agenda"
        ? [agendaStart, agendaEnd]
        : [rangeBounds.lo, rangeBounds.hi];

  const {
    dayMap: rangeDayMap,
    isLoading: rangeLoading,
    isFetching: rangeFetching,
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

  const monthLabel = useMemo(
    () =>
      capitalizeFirstLetter(
        format(currentMonth, "MMMM", { locale: dateFnsLocale }),
      ),
    [currentMonth, dateFnsLocale],
  );
  const currentYear = currentMonth.getFullYear();

  const weekLabel = useMemo(() => {
    const startLabel = format(weekStart, "MMM d", { locale: dateFnsLocale });
    const endLabel = isSameMonth(weekStart, weekEnd)
      ? format(weekEnd, "d", { locale: dateFnsLocale })
      : format(weekEnd, "MMM d", { locale: dateFnsLocale });
    return `${startLabel} - ${endLabel}`;
  }, [weekStart, weekEnd, dateFnsLocale]);

  const prevMonth = useCallback(() => {
    setMonthSlide("left");
    setCurrentMonth((m) => subMonths(m, 1));
  }, [setCurrentMonth]);

  const nextMonth = useCallback(() => {
    setMonthSlide("right");
    setCurrentMonth((m) => addMonths(m, 1));
  }, [setCurrentMonth]);

  const selectYear = useCallback((year: number) => {
    setMonthSlide(null);
    setCurrentMonth((m) => startOfMonth(setYear(m, year)));
  }, [setCurrentMonth]);

  const goToCurrentMonth = useCallback(() => {
    setMonthSlide(null);
    setCurrentMonth(startOfMonth(new Date()));
  }, [setCurrentMonth]);

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
  }, []);

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

  const weekdayHeaders = useMemo(() => {
    const mondayFirst = [
      { key: "monday", label: t("dates.daysShort.monday") },
      { key: "tuesday", label: t("dates.daysShort.tuesday") },
      { key: "wednesday", label: t("dates.daysShort.wednesday") },
      { key: "thursday", label: t("dates.daysShort.thursday") },
      { key: "friday", label: t("dates.daysShort.friday") },
      { key: "saturday", label: t("dates.daysShort.saturday") },
      { key: "sunday", label: t("dates.daysShort.sunday") },
    ];
    if (weekStartsOn === 0) {
      return [mondayFirst[6]!, ...mondayFirst.slice(0, 6)];
    }
    return mondayFirst;
  }, [t, weekStartsOn]);

  const { gridDays, monthStats } = useMemo(
    () => buildCalendarMonthModel(currentMonth, displayMonthDayMap, weekStartsOn, todayKey),
    [currentMonth, displayMonthDayMap, weekStartsOn, todayKey],
  );
  const { monthStats: sourceMonthStats } = useMemo(
    () => buildCalendarMonthModel(currentMonth, dayMap, weekStartsOn, todayKey),
    [currentMonth, dayMap, weekStartsOn, todayKey],
  );
  const showMonthRecurringToggle =
    !isLoading && currentMonth <= startOfMonth(parseAPIDate(todayKey)) && sourceMonthStats.hasEntries;
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
    isFetching: activeFetching,
    error: activeError,
    refresh: activeRefresh,
  } =
    view === "month"
      ? { dayMap, isFetching, error, refresh }
      : {
          dayMap: rangeDayMap,
          isFetching: rangeFetching,
          error: rangeError,
          refresh: rangeRefresh,
        };

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
    const date = parseAPIDate(selectedDay);
    return capitalizeFirstLetter(
      format(date, "EEEE, MMM d", { locale: dateFnsLocale }),
    );
  }, [dateFnsLocale, selectedDay]);

  const completedCount = filteredEntries.filter(
    (entry: CalendarDayEntry) => entry.status === "completed",
  ).length;

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
    setShowCreateModal(true);
    router.push('/');
  }, [router, setShowCreateModal]);

  const listHeader = (
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
        onSelectDay={onSelectDay}
        language={i18n.language}
        t={t}
        tokens={tokens}
        todayKey={todayKey}
      />

      {monthDisplayState === 'ready' ? (
        <CalendarLegend
          loggableLabel={t("calendar.legend.loggable")}
          fullLabel={t("calendar.dayCell.full")}
          partialLabel={t("calendar.dayCell.partial")}
          noneLabel={t("calendar.dayCell.none")}
          tokens={tokens}
        />
      ) : null}

      <CalendarMonthFeedback
        state={monthDisplayState}
        emptyText={t('calendar.emptyMonth')}
        futureText={t('calendar.futureMonth')}
        createLabel={t('habits.createHabit')}
        onCreate={openHabitCreation}
        tokens={tokens}
      />

      {showMonthRecurringToggle ? (
        <View style={styles.monthRecurringToggle}>
          <ShowRecurringToggle
            checked={showRecurring}
            onChange={setShowRecurring}
            label={t("calendar.showRecurring")}
            tokens={tokens}
          />
        </View>
      ) : null}
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

      <View style={{ height: 24 }} />
    </View>
  );

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.safeArea, { backgroundColor: tokens.bg }]}>
      <View style={styles.viewSwitcher}>
        <SegmentedControl<CalendarView>
          options={viewOptions}
          value={view}
          onChange={setView}
          label={t("calendar.view.switchLabel")}
        />
      </View>
      {view === "month" ? (
        <CalendarHeader
          monthLabel={monthLabel}
          year={currentYear}
          previousMonthLabel={t("common.previousMonth")}
          nextMonthLabel={t("common.nextMonth")}
          currentMonthLabel={t("calendar.goToCurrentMonth")}
          selectYearLabel={t("common.selectYear")}
          onPreviousMonth={prevMonth}
          onNextMonth={nextMonth}
          onCurrentMonth={goToCurrentMonth}
          onSelectYear={selectYear}
          tokens={tokens}
        />
      ) : null}

      <CalendarLoadingBar active={activeFetching} tokens={tokens} />

      {activeError && (
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
      )}
      {!activeError && view === "month" && (
        <FlatList
          ref={calendarScrollRef}
          style={styles.container}
          data={EMPTY_LIST}
          keyExtractor={(_item, index) => String(index)}
          renderItem={null}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          showsVerticalScrollIndicator={false}
          onScroll={handleCalendarScroll}
          scrollEventThrottle={16}
        />
      )}
      {!activeError && view === "month" && (
        <ScrollToTopButton
          visible={showScrollTop}
          onPress={scrollCalendarToTop}
          bottom={24}
        />
      )}
      {!activeError && view !== "month" && (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.viewScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {view === "week" ? (
            <CalendarWeekView
              columns={gridColumns}
              dayMap={displayRangeDayMap}
              weekLabel={weekLabel}
              previousWeekLabel={t("common.previousWeek")}
              nextWeekLabel={t("common.nextWeek")}
              currentWeekLabel={t("calendar.goToCurrentWeek")}
              slideDirection={weekSlide}
              isLoading={rangeLoading}
              onPreviousWeek={prevWeek}
              onNextWeek={nextWeek}
              onCurrentWeek={goToCurrentWeek}
              onSelectDay={onSelectDay}
              displayTime={displayTime}
              language={i18n.language}
              allDayLabel={t("calendar.timeGrid.noSetTime")}
              nowLabel={t("calendar.timeGrid.now")}
              timeZone={profile.timeZone}
              showRecurring={showRecurring}
              onShowRecurringChange={setShowRecurring}
              showRecurringLabel={t("calendar.showRecurring")}
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
              showRecurring={showRecurring}
              onShowRecurringChange={setShowRecurring}
              showRecurringLabel={t("calendar.showRecurring")}
              language={i18n.language}
              t={t}
              tokens={tokens}
            />
          ) : (
            <CalendarAgendaView
              startDate={agendaStart}
              dayMap={rangeDayMap}
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

      {isDayDetailOpen ? (<Sheet
        ref={sheetRef}
        open
        onClose={closeDayDetail}
        title={formattedSelectedDate}
        key={selectedDay ?? undefined}
      >
        <View style={styles.sheetContent}>
          <CalendarDayDetail
            selectedEntries={selectedEntries}
            filteredEntries={filteredEntries}
            calendarEvents={selectedCalendarEvents}
            hasProAccess={profile.hasProAccess}
            autoSyncState={autoSyncState}
            completedCount={completedCount}
            showRecurring={showRecurring}
            onShowRecurringChange={setShowRecurring}
            onCalendarAutoSyncChange={handleCalendarAutoSyncChange}
            onOpenPro={openOrbitPro}
            onGoToDay={goToSelectedDay}
            displayTime={displayTime}
            t={t}
            tokens={tokens}
          />
        </View>
      </Sheet>) : null}
    </SafeAreaView>
  );
}

function createStyles() {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    container: { flex: 1 },

    viewSwitcher: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 16,
    },

    viewScrollContent: {
      paddingBottom: 24,
    },

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
      paddingTop: 4,
    },

    monthRecurringToggle: {
      paddingHorizontal: 16,
      paddingVertical: 4,
    },

    errorWrap: {
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    profileStateWrap: {
      paddingHorizontal: 4,
      paddingVertical: 12,
    },
    profileLoading: {
      gap: 24,
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
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 24,
      gap: 12,
    },
  });
}
