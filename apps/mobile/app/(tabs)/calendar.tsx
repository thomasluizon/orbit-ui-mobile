import { useState, useMemo, useCallback, useRef } from "react";
import { useTourTarget } from "@/hooks/use-tour-target";
import { useTourScrollContainer } from "@/hooks/use-tour-scroll-container";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Switch,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import {
  addMonths,
  subMonths,
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
import { plural } from "@/lib/plural";
import { useCalendarData } from "@/hooks/use-habits";
import { useProfile } from "@/hooks/use-profile";
import { useTimeFormat } from "@/hooks/use-time-format";
import { useHorizontalSwipe } from "@/hooks/use-horizontal-swipe";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { createTokensV2 } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { withDrawerContentInset } from "@/components/ui/drawer-content-inset";
import { SectionLabel } from "@/components/ui/section-label";
import { SettingsRow } from "@/components/ui/settings-row";
import type { StatusDotState } from "@/components/ui/status-dot";
import {
  CalendarHeader,
  CalendarLegend,
} from "./calendar/_components/calendar-shell";
import { CalendarDayEntryRow } from "./calendar/_components/calendar-day-entry";

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
type DayStatus = "none" | "full" | "partial" | "upcoming";

function dayStatus(cell: GridDay): DayStatus {
  if (!cell.isCurrentMonth || cell.totalCount === 0) return "none";
  if (cell.completedCount === cell.totalCount) return "full";
  const hasMissed = cell.entries.some(
    (entry: CalendarDayEntry) => entry.status === "missed",
  );
  if (hasMissed) return "partial";
  return "upcoming";
}

function entryDotState(entry: CalendarDayEntry): StatusDotState {
  if (entry.status === "completed") return "done";
  if (entry.status === "missed") return "overdue";
  if (entry.isBadHabit) return "bad";
  return "empty";
}

// Visible outcome badge for a day-detail row. Only resolved states carry a badge;
// an upcoming (not-yet-resolved) habit shows none — its status dot already conveys
// the state — so the list stays quiet instead of repeating a label on every row.
function statusBadge(
  entry: CalendarDayEntry,
  t: (key: string) => string,
): string | null {
  if (entry.isBadHabit) {
    if (entry.status === "completed") return t("calendar.status.indulged").toUpperCase();
    if (entry.status === "missed") return t("calendar.status.resisted").toUpperCase();
    return null;
  }
  if (entry.status === "completed") return t("calendar.status.completed").toUpperCase();
  if (entry.status === "missed") return t("calendar.status.missed").toUpperCase();
  return null;
}

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
  const weekStartsOn: 0 | 1 = (profile?.weekStartDay as 0 | 1) ?? 1;
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const calendarGridRef = useRef<View>(null);
  const calendarDayRef = useRef<View>(null);
  const calendarScrollRef = useRef<ScrollView>(null);
  useTourTarget("tour-calendar-grid", calendarGridRef);
  useTourTarget("tour-calendar-day", calendarDayRef);
  const calendarScrollTo = useCallback((y: number) => {
    calendarScrollRef.current?.scrollTo({ y, animated: true });
  }, []);
  const { onTourScroll: onCalendarTourScroll } = useTourScrollContainer(
    "/calendar",
    calendarScrollTo,
  );

  const [currentMonth, setCurrentMonth] = useState(() =>
    startOfMonth(new Date()),
  );
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showDayDetail, setShowDayDetail] = useState(false);
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
    setCurrentMonth((m) => subMonths(m, 1));
  }, []);

  const nextMonth = useCallback(() => {
    setCurrentMonth((m) => addMonths(m, 1));
  }, []);

  const swipePanResponder = useHorizontalSwipe({
    onSwipeLeft: nextMonth,
    onSwipeRight: prevMonth,
  });

  const onSelectDay = useCallback((dateStr: string) => {
    setSelectedDay(dateStr);
    setShowDayDetail(true);
  }, []);

  // Weekday headers — short localized labels via shared i18n.
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

  // Selected day entries
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

  // Stats: this month's best streak / total logs / missed (lightweight summary).
  // The previous implementation computed only "current month" granularity; we
  // keep that scope and surface the counts via SettingsRow below the legend.
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

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.bg }]}>
      <CalendarHeader
        title={t("nav.calendar")}
        monthLabel={monthLabel}
        previousMonthLabel={t("common.previousMonth")}
        nextMonthLabel={t("common.nextMonth")}
        onPreviousMonth={prevMonth}
        onNextMonth={nextMonth}
        tokens={tokens}
      />
      <ScrollView
        ref={calendarScrollRef}
        style={styles.container}
        showsVerticalScrollIndicator={false}
        onScroll={onCalendarTourScroll}
        scrollEventThrottle={16}
      >
        <View
          ref={calendarGridRef}
          collapsable={false}
          style={styles.calendarGrid}
          {...swipePanResponder.panHandlers}
        >
          <View style={styles.weekDayRow}>
            {weekdayHeaders.map((d) => (
              <View key={d.key} style={styles.weekDayCell}>
                <Text style={[styles.weekDayText, { color: tokens.fg3 }]}>
                  {d.label}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {gridDays.map((cell) => {
              const status = dayStatus(cell);
              const canSelect = cell.isCurrentMonth;

              return (
                <Pressable
                  key={cell.dateStr}
                  ref={cell.isToday ? calendarDayRef : undefined}
                  onPress={() => canSelect && onSelectDay(cell.dateStr)}
                  disabled={!canSelect}
                  hitSlop={4}
                  style={({ pressed }) => [
                    styles.dayCell,
                    pressed && canSelect && {
                      backgroundColor: tokens.bgElev,
                      borderRadius: 6,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      {
                        color:
                          status === "none" && !cell.isToday
                            ? tokens.fg3
                            : cell.isCurrentMonth
                              ? tokens.fg1
                              : tokens.fg4,
                        fontWeight: cell.isToday ? "600" : "400",
                      },
                    ]}
                  >
                    {cell.day}
                  </Text>
                  {isLoading ? (
                    <View style={styles.dayDotSkeleton} />
                  ) : (
                    <DayDot status={status} isToday={cell.isToday} tokens={tokens} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        <CalendarLegend
          fullLabel={t("calendar.legend.done")}
          partialLabel={t("calendar.legend.upcoming")}
          noneLabel={t("calendar.legend.missed")}
          tokens={tokens}
        />

        <SectionLabel>{t("calendar.thisMonth")}</SectionLabel>
        <SettingsRow
          label={t("calendar.bestStreak")}
          value={String(monthStats.bestStreak)}
          accessory="none"
          mono
        />
        <SettingsRow
          label={t("calendar.totalLogs")}
          value={String(monthStats.totalLogs)}
          accessory="none"
          mono
        />
        <SettingsRow
          label={t("calendar.missedCount")}
          value={String(monthStats.missed)}
          accessory="none"
          mono
        />

        <View style={{ height: 24 }} />
      </ScrollView>

      <BottomSheetModal
        open={showDayDetail}
        onClose={() => setShowDayDetail(false)}
        title={formattedSelectedDate}
        snapPoints={["45%", "75%"]}
      >
        {selectedEntries.length === 0 ? (
          <View style={styles.emptyDay}>
            <Text style={[styles.emptyDayText, { color: tokens.fg3 }]}>
              {t("calendar.noHabitsScheduled")}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.dayDetailScroll}
            contentContainerStyle={withDrawerContentInset(styles.dayDetailContent)}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryText, { color: tokens.fg3 }]}>
                {plural(
                  t("calendar.dayDetail.completionSummary", {
                    done: completedCount,
                    total: filteredEntries.length,
                  }),
                  filteredEntries.length,
                )}
              </Text>
              <View style={styles.recurringToggleRow}>
                <Switch
                  value={showRecurring}
                  onValueChange={setShowRecurring}
                  trackColor={{
                    false: tokens.bgSunk,
                    true: tokens.primary,
                  }}
                  thumbColor={tokens.fgOnPrimary}
                />
                <Text style={[styles.recurringToggleText, { color: tokens.fg2 }]}>
                  {t("calendar.showRecurring")}
                </Text>
              </View>
            </View>

            {filteredEntries.length === 0 ? (
              <View style={styles.emptyDay}>
                <Text style={[styles.emptyDayText, { color: tokens.fg3 }]}>
                  {t("calendar.noHabitsScheduled")}
                </Text>
              </View>
            ) : null}

            {filteredEntries.map((entry: CalendarDayEntry, idx: number) => {
              const badge = statusBadge(entry, t);
              return (
                <CalendarDayEntryRow
                  key={`${entry.habitId}-${idx}`}
                  entry={entry}
                  tokens={tokens}
                  dotState={entryDotState(entry)}
                  statusText={badge}
                  statusAccessibilityLabel={badge ?? t("calendar.status.upcoming")}
                  displayTime={displayTime}
                  isLast={idx === filteredEntries.length - 1}
                />
              );
            })}

            <Pressable
              onPress={() => {
                if (!selectedDay) return;
                setShowDayDetail(false);
                router.push(`/?date=${selectedDay}`);
              }}
              style={({ pressed }) => [
                styles.goToDayButton,
                {
                  backgroundColor: pressed ? tokens.primaryPressed : tokens.primary,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t("calendar.goToDay")}
            >
              <Text style={[styles.goToDayButtonText, { color: tokens.fgOnPrimary }]}>
                {t("calendar.goToDay")}
              </Text>
            </Pressable>
          </ScrollView>
        )}
      </BottomSheetModal>
    </SafeAreaView>
  );
}

function DayDot({
  status,
  isToday,
  tokens,
}: Readonly<{
  status: DayStatus;
  isToday: boolean;
  tokens: Tokens;
}>) {
  if (isToday) {
    return (
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 999,
          backgroundColor: tokens.primary,
        }}
      />
    );
  }
  if (status === "full") {
    return (
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 999,
          backgroundColor: tokens.fg1,
        }}
      />
    );
  }
  if (status === "partial") {
    return (
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 999,
          backgroundColor: tokens.statusOverdue,
        }}
      />
    );
  }
  if (status === "upcoming") {
    return (
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: tokens.fg3,
        }}
      />
    );
  }
  return <View style={{ width: 5, height: 5 }} />;
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    container: { flex: 1 },

    calendarGrid: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
    },

    weekDayRow: {
      flexDirection: "row",
      marginBottom: 12,
    },
    weekDayCell: {
      flex: 1,
      alignItems: "center",
    },
    weekDayText: {
      fontFamily: "GeistMono",
      fontSize: 11,
      fontWeight: "500",
      letterSpacing: 0.44,
    },

    daysGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      rowGap: 6,
    },
    dayCell: {
      width: "14.2857%",
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
    },
    dayText: {
      fontFamily: "GeistMono",
      fontSize: 13,
      fontVariant: ["tabular-nums"],
    },
    dayDotSkeleton: {
      width: 5,
      height: 5,
      borderRadius: 999,
      backgroundColor: tokens.hairline,
      opacity: 0.5,
    },

    emptyDay: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 32,
      paddingHorizontal: 20,
    },
    emptyDayText: {
      fontFamily: "Geist",
      fontSize: 14,
      fontStyle: "italic",
      textAlign: "center",
    },

    dayDetailScroll: { flex: 1 },
    dayDetailContent: {
      paddingBottom: 32,
    },

    summaryText: {
      fontFamily: "Geist",
      fontSize: 14,
      flex: 1,
    },
    summaryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.hairline,
    },
    recurringToggleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    recurringToggleText: {
      fontFamily: "Geist",
      fontSize: 12,
    },

    goToDayButton: {
      marginHorizontal: 20,
      marginTop: 16,
      borderRadius: 8,
      paddingVertical: 12,
      alignItems: "center",
    },
    goToDayButtonText: {
      fontFamily: "Geist",
      fontSize: 14,
      fontWeight: "500",
    },
  });
}
