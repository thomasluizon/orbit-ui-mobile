import { useState, useMemo, useCallback, useRef } from "react";
import { useTourTarget } from "@/hooks/use-tour-target";
import { useTourScrollContainer } from "@/hooks/use-tour-scroll-container";
import {
  View,
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
  addYears,
  subYears,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isToday,
  format,
  getDate,
} from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import { formatAPIDate, parseAPIDate } from "@orbit/shared/utils";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";
import { useCalendarData } from "@/hooks/use-habits";
import { useProfile } from "@/hooks/use-profile";
import { useCoachMark } from "@/hooks/use-coach-mark";
import { useTimeFormat } from "@/hooks/use-time-format";
import { useHorizontalSwipe } from "@/hooks/use-horizontal-swipe";
import { createTokensV2 } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { GradientTop } from "@/components/ui/gradient-top";
import { SectionLabel } from "@/components/ui/section-label";
import {
  CalendarHeader,
  CalendarLegend,
} from "./calendar/_components/calendar-shell";
import { CalendarGrid } from "./calendar/_components/calendar-grid";
import { CalendarDayDetail } from "./calendar/_components/calendar-day-detail";
import { CalendarStats } from "./calendar/_components/calendar-stats";

interface GridDay {
  date: Date;
  dateStr: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  entries: CalendarDayEntry[];
  completedCount: number;
  totalCount: number;
  completionRatio: number;
}

type Tokens = ReturnType<typeof createTokensV2>;
type MonthSlide = "left" | "right" | null;

const EMPTY_LIST: readonly CalendarDayEntry[] = [];

export default function CalendarScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { profile } = useProfile();
  const { displayTime } = useTimeFormat();
  useCoachMark("coach-calendar");
  const { currentScheme, currentTheme } = useAppTheme();
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const weekStartsOn: 0 | 1 = profile?.weekStartDay ?? 1;
  const styles = useMemo(() => createStyles(tokens), [tokens]);
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

  const [currentMonth, setCurrentMonth] = useState(() =>
    startOfMonth(new Date()),
  );
  const [monthSlide, setMonthSlide] = useState<MonthSlide>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(() =>
    formatAPIDate(new Date()),
  );
  const [isDayDetailOpen, setIsDayDetailOpen] = useState(false);
  const [showRecurring, setShowRecurring] = useState(true);

  const { dayMap, isLoading } = useCalendarData(currentMonth);

  const monthLabel = useMemo(
    () =>
      format(currentMonth, "MMMM yyyy", {
        locale: i18n.language === "pt-BR" ? ptBR : enUS,
      }),
    [currentMonth, i18n.language],
  );

  const prevMonth = useCallback(() => {
    setMonthSlide("left");
    setCurrentMonth((m) => subMonths(m, 1));
  }, []);

  const nextMonth = useCallback(() => {
    setMonthSlide("right");
    setCurrentMonth((m) => addMonths(m, 1));
  }, []);

  const prevYear = useCallback(() => {
    setMonthSlide("left");
    setCurrentMonth((m) => subYears(m, 1));
  }, []);

  const nextYear = useCallback(() => {
    setMonthSlide("right");
    setCurrentMonth((m) => addYears(m, 1));
  }, []);

  const goToCurrentMonth = useCallback(() => {
    setMonthSlide(null);
    setCurrentMonth(startOfMonth(new Date()));
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

  const gridDays = useMemo<GridDay[]>(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn });

    const days: GridDay[] = [];
    let day = gridStart;
    while (day <= gridEnd) {
      const dateStr = formatAPIDate(day);
      const entries: CalendarDayEntry[] = dayMap.get(dateStr) ?? [];
      const completedCount = entries.filter(
        (entry: CalendarDayEntry) => entry.status === "completed",
      ).length;
      const totalCount = entries.length;

      days.push({
        date: day,
        dateStr,
        day: getDate(day),
        isCurrentMonth: isSameMonth(day, currentMonth),
        isToday: isToday(day),
        entries,
        completedCount,
        totalCount,
        completionRatio: totalCount > 0 ? completedCount / totalCount : 0,
      });
      day = addDays(day, 1);
    }

    return days;
  }, [currentMonth, dayMap, weekStartsOn]);

  const selectedEntries = useMemo(() => {
    if (!selectedDay) return [];
    return dayMap.get(selectedDay) ?? [];
  }, [selectedDay, dayMap]);

  const filteredEntries = useMemo(() => {
    if (showRecurring) return selectedEntries;
    return selectedEntries.filter((entry: CalendarDayEntry) => entry.isOneTime);
  }, [selectedEntries, showRecurring]);

  const formattedSelectedDate = useMemo(() => {
    if (!selectedDay) return "";
    const date = parseAPIDate(selectedDay);
    return format(date, "EEEE, MMM d", {
      locale: i18n.language === "pt-BR" ? ptBR : enUS,
    });
  }, [i18n.language, selectedDay]);

  const completedCount = filteredEntries.filter(
    (entry: CalendarDayEntry) => entry.status === "completed",
  ).length;

  const goToSelectedDay = () => {
    if (!selectedDay) return;
    setIsDayDetailOpen(false);
    router.push(`/?date=${selectedDay}`);
  };

  const monthStats = useMemo(() => {
    const monthDays = gridDays.filter((d) => d.isCurrentMonth);
    const totalLogs = monthDays.reduce(
      (acc, d) => acc + d.completedCount,
      0,
    );
    const missed = monthDays.reduce(
      (acc, d) =>
        acc +
        d.entries.filter((e: CalendarDayEntry) => e.status === "missed").length,
      0,
    );
    let bestStreak = 0;
    let currentStreak = 0;
    for (const d of monthDays) {
      if (d.totalCount > 0 && d.completedCount === d.totalCount) {
        currentStreak += 1;
        if (currentStreak > bestStreak) bestStreak = currentStreak;
      } else {
        currentStreak = 0;
      }
    }
    return { totalLogs, missed, bestStreak };
  }, [gridDays]);

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

  const monthEntering =
    monthSlide === "right"
      ? FadeInRight.duration(220).reduceMotion(ReduceMotion.System)
      : monthSlide === "left"
        ? FadeInLeft.duration(220).reduceMotion(ReduceMotion.System)
        : undefined;

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
      <SectionLabel>{t("calendar.thisMonth")}</SectionLabel>
      <CalendarStats stats={monthStatTiles} />

      <View style={{ height: 24 }} />
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.bg }]}>
      <GradientTop height={180} />
      <CalendarHeader
        monthLabel={monthLabel}
        previousMonthLabel={t("common.previousMonth")}
        nextMonthLabel={t("common.nextMonth")}
        previousYearLabel={t("common.previousYear")}
        nextYearLabel={t("common.nextYear")}
        currentMonthLabel={t("calendar.goToCurrentMonth")}
        onPreviousMonth={prevMonth}
        onNextMonth={nextMonth}
        onPreviousYear={prevYear}
        onNextYear={nextYear}
        onCurrentMonth={goToCurrentMonth}
        tokens={tokens}
      />
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

      <BottomSheetModal
        open={isDayDetailOpen}
        onClose={closeDayDetail}
        title={formattedSelectedDate}
        contentKey={selectedDay ?? undefined}
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

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    container: { flex: 1 },

    listFooter: {
      paddingTop: 4,
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
