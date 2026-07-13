import { useState, useMemo, useCallback, useRef } from "react";
import { useTourTarget } from "@/hooks/use-tour-target";
import { useTourScrollContainer } from "@/hooks/use-tour-scroll-container";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
} from "react-native";
import {
  FadeInLeft,
  FadeInRight,
  ReduceMotion,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import {
  addMonths,
  subMonths,
  setYear,
  addWeeks,
  subWeeks,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  format,
} from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import {
  capitalizeFirstLetter,
  clampRangeToMaxDays,
  filterRecurringEntries,
  formatAPIDate,
  parseAPIDate,
  MAX_RANGE_DAYS,
} from "@orbit/shared/utils";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";
import { useCalendarData, useCalendarRange } from "@/hooks/use-habits";
import { useProfile } from "@/hooks/use-profile";
import { useTimeFormat } from "@/hooks/use-time-format";
import { useHorizontalSwipe } from "@/hooks/use-horizontal-swipe";
import { createTokensV2 } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";
import { buildCalendarMonthModel } from "@/lib/calendar-month-model";
import { SafeAreaView } from "react-native-safe-area-context";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { GradientTop } from "@/components/ui/gradient-top";
import { PillButton } from "@/components/ui/pill-button";
import { SectionLabel } from "@/components/ui/section-label";
import { SectionHeadTabs } from "@/components/ui/section-head-tabs";
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
import type { TimeGridColumn } from "./calendar/_components/calendar-time-grid";

type MonthSlide = "left" | "right" | null;
type CalendarView = "month" | "week" | "range";

const EMPTY_LIST: readonly CalendarDayEntry[] = [];

function resolveMonthEntering(monthSlide: MonthSlide) {
  if (monthSlide === "right")
    return FadeInRight.duration(220).reduceMotion(ReduceMotion.System);
  if (monthSlide === "left")
    return FadeInLeft.duration(220).reduceMotion(ReduceMotion.System);
  return undefined;
}

// react-doctor-disable-next-line no-giant-component -- Screen orchestration is already decomposed into ./calendar/_components/*; the remaining hook wiring + JSX tree is inherently long, and further splitting is a regression-prone refactor with cross-platform parity cost. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export default function CalendarScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { profile } = useProfile();
  const { displayTime } = useTimeFormat();
  const { currentScheme, currentTheme } = useAppTheme();
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const dateFnsLocale = i18n.language === "pt-BR" ? ptBR : enUS;
  const weekStartsOn = useMemo<0 | 1>(
    () => profile?.weekStartDay ?? 1,
    [profile?.weekStartDay],
  );
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

  const [view, setView] = useState<CalendarView>("month");
  const [currentMonth, setCurrentMonth] = useState(() =>
    startOfMonth(new Date()),
  );
  const [monthSlide, setMonthSlide] = useState<MonthSlide>(null);
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [weekSlide, setWeekSlide] = useState<MonthSlide>(null);
  const [rangeStart, setRangeStart] = useState(() => formatAPIDate(new Date()));
  const [rangeEnd, setRangeEnd] = useState(() => formatAPIDate(new Date()));
  const [awaitingEnd, setAwaitingEnd] = useState(false);
  const [rangeClamped, setRangeClamped] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(() =>
    formatAPIDate(new Date()),
  );
  const [isDayDetailOpen, setIsDayDetailOpen] = useState(false);
  const [showRecurring, setShowRecurring] = useState(true);

  const { dayMap, isLoading, isFetching, error, refresh } =
    useCalendarData(currentMonth);

  const weekStart = useMemo(
    () => startOfWeek(weekAnchor, { weekStartsOn }),
    [weekAnchor, weekStartsOn],
  );
  const weekEnd = useMemo(
    () => endOfWeek(weekAnchor, { weekStartsOn }),
    [weekAnchor, weekStartsOn],
  );
  const rangeBounds = useMemo(() => {
    const a = parseAPIDate(rangeStart);
    const b = parseAPIDate(rangeEnd);
    return rangeStart <= rangeEnd ? { lo: a, hi: b } : { lo: b, hi: a };
  }, [rangeStart, rangeEnd]);

  const [gridStartDate, gridEndDate] =
    view === "week" ? [weekStart, weekEnd] : [rangeBounds.lo, rangeBounds.hi];

  const {
    dayMap: rangeDayMap,
    isLoading: rangeLoading,
    isFetching: rangeFetching,
    error: rangeError,
    refresh: rangeRefresh,
  } = useCalendarRange(gridStartDate, gridEndDate, view !== "month");

  const gridColumns = useMemo<TimeGridColumn[]>(() => {
    const days =
      view === "week"
        ? eachDayOfInterval({ start: weekStart, end: weekEnd })
        : eachDayOfInterval({ start: rangeBounds.lo, end: rangeBounds.hi });
    return days.map((date) => ({
      date,
      dateStr: formatAPIDate(date),
      isToday: isToday(date),
    }));
  }, [view, weekStart, weekEnd, rangeBounds]);

  const displayRangeDayMap = useMemo(() => {
    if (showRecurring) return rangeDayMap;
    const filtered = new Map<string, CalendarDayEntry[]>();
    for (const [key, entries] of rangeDayMap) {
      filtered.set(key, filterRecurringEntries(entries, false));
    }
    return filtered;
  }, [rangeDayMap, showRecurring]);

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
  }, []);

  const nextMonth = useCallback(() => {
    setMonthSlide("right");
    setCurrentMonth((m) => addMonths(m, 1));
  }, []);

  const selectYear = useCallback((year: number) => {
    setMonthSlide(null);
    setCurrentMonth((m) => startOfMonth(setYear(m, year)));
  }, []);

  const goToCurrentMonth = useCallback(() => {
    setMonthSlide(null);
    setCurrentMonth(startOfMonth(new Date()));
  }, []);

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
  });

  const onSelectDay = useCallback((dateStr: string) => {
    setSelectedDay(dateStr);
    setIsDayDetailOpen(true);
  }, []);

  const closeDayDetail = useCallback(() => {
    setIsDayDetailOpen(false);
  }, []);

  const handleRangePick = useCallback(
    (dateStr: string) => {
      if (!awaitingEnd) {
        setRangeStart(dateStr);
        setRangeEnd(dateStr);
        setAwaitingEnd(true);
        setRangeClamped(false);
        return;
      }
      const { start, end, clamped } = clampRangeToMaxDays(rangeStart, dateStr);
      setRangeStart(start);
      setRangeEnd(end);
      setRangeClamped(clamped);
      setAwaitingEnd(false);
    },
    [awaitingEnd, rangeStart],
  );

  const viewTabs = useMemo(
    () => [
      { id: "month" as const, label: t("calendar.view.month") },
      { id: "week" as const, label: t("calendar.view.week") },
      { id: "range" as const, label: t("calendar.view.range") },
    ],
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
    () => buildCalendarMonthModel(currentMonth, dayMap, weekStartsOn),
    [currentMonth, dayMap, weekStartsOn],
  );

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
    setIsDayDetailOpen(false);
    router.push(`/?date=${selectedDay}`);
  };

  const monthStatTiles = useMemo(
    () => [
      {
        key: "bestStreak",
        emoji: "🔥",
        value: monthStats.bestStreak,
        label: t("calendar.bestStreak"),
      },
      {
        key: "totalLogs",
        emoji: "✅",
        value: monthStats.totalLogs,
        label: t("calendar.totalLogs"),
      },
      {
        key: "missed",
        emoji: "⚠️",
        value: monthStats.missed,
        label: t("calendar.missedCount"),
      },
    ],
    [monthStats, t],
  );

  const monthEntering = resolveMonthEntering(monthSlide);

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
      />

      <CalendarLegend
        todayLabel={t("calendar.legend.today")}
        doneLabel={t("calendar.legend.done")}
        partialLabel={t("calendar.legend.partial")}
        missedLabel={t("calendar.legend.missed")}
        tokens={tokens}
      />
    </>
  );

  const listFooter = (
    <View style={styles.listFooter}>
      {!isLoading && !monthStats.hasEntries ? (
        <EmptyState description={t("calendar.emptyMonth")} />
      ) : (
        <>
          <SectionLabel>{t("calendar.thisMonth")}</SectionLabel>
          <CalendarStats stats={monthStatTiles} />
        </>
      )}

      <View style={{ height: 24 }} />
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.bg }]}>
      <GradientTop height={180} />
      <SectionHeadTabs tabs={viewTabs} active={view} onChange={setView} />
      {view !== "week" ? (
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
            <PillButton variant="ghost" onPress={() => void activeRefresh()}>
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
          onScroll={onCalendarTourScroll}
          scrollEventThrottle={16}
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
              allDayLabel={t("calendar.timeGrid.allDay")}
              nowLabel={t("calendar.timeGrid.now")}
              showRecurring={showRecurring}
              onShowRecurringChange={setShowRecurring}
              showRecurringLabel={t("calendar.showRecurring")}
              t={t}
              tokens={tokens}
            />
          ) : (
            <CalendarRangeView
              gridDays={gridDays}
              weekdayHeaders={weekdayHeaders}
              isLoading={isLoading}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              onPickDay={handleRangePick}
              columns={gridColumns}
              rangeDayMap={displayRangeDayMap}
              hint={t("calendar.timeGrid.pickRangeHint")}
              clampedNotice={t("calendar.timeGrid.rangeMaxDays", {
                max: MAX_RANGE_DAYS,
              })}
              isClamped={rangeClamped}
              isAwaitingEnd={awaitingEnd}
              isRangeLoading={rangeLoading}
              onSelectDay={onSelectDay}
              displayTime={displayTime}
              language={i18n.language}
              allDayLabel={t("calendar.timeGrid.allDay")}
              nowLabel={t("calendar.timeGrid.now")}
              showRecurring={showRecurring}
              onShowRecurringChange={setShowRecurring}
              showRecurringLabel={t("calendar.showRecurring")}
              t={t}
              tokens={tokens}
            />
          )}
        </ScrollView>
      )}

      <BottomSheetModal
        open={isDayDetailOpen}
        onClose={closeDayDetail}
        title={formattedSelectedDate}
        contentKey={selectedDay ?? undefined}
        contentManagesScroll
      >
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          <CalendarDayDetail
            selectedEntries={selectedEntries}
            filteredEntries={filteredEntries}
            completedCount={completedCount}
            showRecurring={showRecurring}
            onShowRecurringChange={setShowRecurring}
            onGoToDay={goToSelectedDay}
            displayTime={displayTime}
            t={t}
            tokens={tokens}
          />
        </ScrollView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}

function createStyles() {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    container: { flex: 1 },

    viewScrollContent: {
      paddingBottom: 24,
    },

    listFooter: {
      paddingTop: 4,
    },

    errorWrap: {
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    errorCard: {
      alignItems: "center",
      gap: 14,
      paddingVertical: 28,
      paddingHorizontal: 18,
      borderRadius: 18,
      borderWidth: 1,
    },
    errorText: {
      fontFamily: "Rubik_400Regular",
      fontSize: 14,
      textAlign: "center",
    },

    sheetScroll: {
      flex: 1,
    },
    sheetContent: {
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 24,
      gap: 12,
    },
  });
}
