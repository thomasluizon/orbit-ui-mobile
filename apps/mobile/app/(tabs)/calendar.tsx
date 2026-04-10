import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTourTarget } from "@/hooks/use-tour-target";
import { useTourScrollContainer } from "@/hooks/use-tour-scroll-container";
import {
  Animated,
  View,
  Text,
  TouchableOpacity,
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
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { formatAPIDate, parseAPIDate } from "@orbit/shared/utils";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";
import { plural } from "@/lib/plural";
import { useCalendarData } from "@/hooks/use-habits";
import { useProfile } from "@/hooks/use-profile";
import { useTimeFormat } from "@/hooks/use-time-format";
import { useHorizontalSwipe } from "@/hooks/use-horizontal-swipe";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { createColors } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CalendarHeader,
  CalendarLegend,
  CalendarLoadingSkeleton,
} from "./calendar/_components/calendar-shell";
import { CalendarDayEntryRow } from "./calendar/_components/calendar-day-entry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

type DayStatus = "empty" | "done" | "missed" | "upcoming";
type AppColors = ReturnType<typeof createColors>;

// ---------------------------------------------------------------------------
// Helpers (matching web CalendarGrid logic exactly)
// ---------------------------------------------------------------------------

function dayStatus(cell: GridDay): DayStatus {
  if (!cell.isCurrentMonth || cell.totalCount === 0) return "empty";
  if (cell.completedCount === cell.totalCount) return "done";
  const hasMissed = cell.entries.some(
    (entry: CalendarDayEntry) => entry.status === "missed",
  );
  if (hasMissed) return "missed";
  return "upcoming";
}

function getDayBgColor(cell: GridDay, colors: AppColors): string {
  const status = dayStatus(cell);
  switch (status) {
    case "done":
      return cell.completionRatio >= 0.9
        ? colors.green500bg
        : colors.green500_60;
    case "missed":
      return colors.orange500_30;
    case "upcoming":
      return colors.primary_20;
    default:
      return cell.isCurrentMonth ? colors.surfaceGround : "transparent";
  }
}

function getDayTextColor(cell: GridDay, colors: AppColors): string {
  if (!cell.isCurrentMonth) return colors.textFaded40;
  const status = dayStatus(cell);
  switch (status) {
    case "done":
      return "#ffffff";
    case "missed":
      return colors.orange300;
    case "upcoming":
      return colors.textPrimary;
    default:
      return colors.textFaded;
  }
}

function getDayFontWeight(cell: GridDay): "400" | "500" | "700" {
  if (!cell.isCurrentMonth) return "400";
  const status = dayStatus(cell);
  switch (status) {
    case "done":
      return "700";
    case "missed":
    case "upcoming":
      return "500";
    default:
      return "400";
  }
}

function getDotColor(cell: GridDay, colors: AppColors): string | null {
  const status = dayStatus(cell);
  switch (status) {
    case "done":
      return colors.green400;
    case "missed":
      return colors.orange400;
    case "upcoming":
      return colors.primary400;
    default:
      return null;
  }
}

function statusBadgeColors(
  entry: CalendarDayEntry,
  colors: AppColors,
): { text: string; bg: string } {
  if (entry.isBadHabit) {
    if (entry.status === "completed")
      return { text: colors.red400, bg: colors.red400_10 };
    if (entry.status === "missed")
      return { text: colors.emerald400, bg: colors.emerald400_10 };
    return { text: colors.primary, bg: colors.primary_10 };
  }
  if (entry.status === "completed")
    return { text: colors.emerald400, bg: colors.emerald400_10 };
  if (entry.status === "missed")
    return { text: colors.orange400, bg: colors.orange400_10 };
  return { text: colors.primary, bg: colors.primary_10 };
}

function statusIconBgColor(
  entry: CalendarDayEntry,
  colors: AppColors,
): {
  bg: string;
  border: string;
  showCheck: boolean;
} {
  if (entry.status === "completed") {
    return {
      bg: colors.emerald500_20,
      border: colors.emerald500_30,
      showCheck: true,
    };
  }
  return { bg: "transparent", border: colors.borderFaded30, showCheck: false };
}

function statusLabel(
  entry: CalendarDayEntry,
  t: (key: string) => string,
): string {
  if (entry.isBadHabit) {
    if (entry.status === "completed")
      return t("calendar.status.indulged").toUpperCase();
    if (entry.status === "missed")
      return t("calendar.status.resisted").toUpperCase();
    return t("calendar.status.scheduled").toUpperCase();
  }
  if (entry.status === "completed")
    return t("calendar.status.completed").toUpperCase();
  if (entry.status === "missed")
    return t("calendar.status.missed").toUpperCase();
  return t("calendar.status.upcoming").toUpperCase();
}

function PerfectDayDot({ color }: { color: string }) {
  const opacity = useRef(new Animated.Value(0.72)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0.72,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.9,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, scale]);

  return (
    <Animated.View
      style={[
        {
          width: 4,
          height: 4,
          borderRadius: 2,
          marginTop: 4,
        },
        {
          backgroundColor: color,
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Calendar Screen
// ---------------------------------------------------------------------------

export default function CalendarScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { profile } = useProfile();
  const { displayTime } = useTimeFormat();
  const { colors } = useAppTheme();
  const weekStartsOn: 0 | 1 = (profile?.weekStartDay as 0 | 1) ?? 1;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const calendarGridRef = useRef<View>(null);
  const calendarDayRef = useRef<View>(null);
  const calendarScrollRef = useRef<ScrollView>(null);
  useTourTarget("tour-calendar-grid", calendarGridRef);
  useTourTarget("tour-calendar-day", calendarDayRef);
  const calendarScrollTo = useCallback((y: number) => {
    calendarScrollRef.current?.scrollTo({ y, animated: true });
  }, []);
  const { onTourScroll: onCalendarTourScroll } = useTourScrollContainer("/calendar", calendarScrollTo);

  const [currentMonth, setCurrentMonth] = useState(() =>
    startOfMonth(new Date()),
  );
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showDayDetail, setShowDayDetail] = useState(false);
  const [showRecurring, setShowRecurring] = useState(true);

  const { dayMap, isLoading, isFetching } = useCalendarData(currentMonth);

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

  const goToToday = useCallback(() => {
    setCurrentMonth(startOfMonth(new Date()));
  }, []);

  const onSelectDay = useCallback((dateStr: string) => {
    setSelectedDay(dateStr);
    setShowDayDetail(true);
  }, []);

  // Build weekday headers (matching web CalendarGrid: localized, respecting weekStartDay)
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
  }, [weekStartsOn, t]);

  // Build grid days (matching web CalendarGrid exactly)
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

  // Chunk grid days into weeks (rows of 7)
  const calendarWeeks = useMemo(() => {
    const weeks: GridDay[][] = [];
    for (let i = 0; i < gridDays.length; i += 7) {
      weeks.push(gridDays.slice(i, i + 7));
    }
    return weeks;
  }, [gridDays]);

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

  return (
    <SafeAreaView style={styles.safeArea} {...swipePanResponder.panHandlers}>
      <ScrollView
        ref={calendarScrollRef}
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={onCalendarTourScroll}
        scrollEventThrottle={16}
      >
        <CalendarHeader
          title={t("nav.calendar")}
          monthLabel={monthLabel}
          goToTodayLabel={t("dates.goToToday")}
          previousMonthLabel={t("common.previousMonth")}
          nextMonthLabel={t("common.nextMonth")}
          onGoToToday={goToToday}
          onPreviousMonth={prevMonth}
          onNextMonth={nextMonth}
          colors={colors}
        />

        {isLoading && (
          <CalendarLoadingSkeleton colors={colors} />
        )}

        <View
          style={[
            styles.fetchingBar,
            isFetching && !isLoading
              ? styles.fetchingBarVisible
              : styles.fetchingBarHidden,
          ]}
        />

        {!isLoading && (
          <View
            ref={calendarGridRef}
            style={[
              styles.calendarCard,
              isFetching && !isLoading ? styles.calendarCardFetching : null,
            ]}
          >
            <View style={styles.weekDayRow}>
              {weekdayHeaders.map((d) => (
                <View key={d.key} style={styles.weekDayCell}>
                  <Text style={styles.weekDayText}>{d.label}</Text>
                </View>
              ))}
            </View>

            {calendarWeeks.map((week, wi) => (
              <View key={wi} style={styles.weekRow}>
                {week.map((cell) => {
                  const bgColor = getDayBgColor(cell, colors);
                  const textColor = getDayTextColor(cell, colors);
                  const fontWeight = getDayFontWeight(cell);
                  const dotColor = getDotColor(cell, colors);
                  const canSelect = cell.isCurrentMonth;

                  return (
                    <TouchableOpacity
                      key={cell.dateStr}
                      ref={cell.isToday ? calendarDayRef : undefined}
                      style={[
                        styles.dayCell,
                        { backgroundColor: bgColor },
                        cell.isToday && styles.dayCellToday,
                      ]}
                      onPress={() => canSelect && onSelectDay(cell.dateStr)}
                      activeOpacity={canSelect ? 0.6 : 1}
                      disabled={!canSelect}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          { color: textColor, fontWeight },
                        ]}
                      >
                        {cell.day}
                      </Text>
                      {cell.isCurrentMonth &&
                        cell.totalCount > 0 &&
                        dotColor &&
                        (dayStatus(cell) === "done" ? (
                          <PerfectDayDot color={dotColor} />
                        ) : (
                          <View
                            style={[
                              styles.dayDot,
                              { backgroundColor: dotColor },
                            ]}
                          />
                        ))}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        <CalendarLegend
          doneLabel={t("calendar.legend.done")}
          upcomingLabel={t("calendar.legend.upcoming")}
          missedLabel={t("calendar.legend.missed")}
          colors={colors}
        />
      </ScrollView>

      <BottomSheetModal
        open={showDayDetail}
        onClose={() => setShowDayDetail(false)}
        title={formattedSelectedDate}
        snapPoints={["45%", "75%"]}
      >
        {selectedEntries.length === 0 ? (
          <View style={styles.emptyDay}>
            <Text style={styles.emptyDayText}>
              {t("calendar.noHabitsScheduled")}
            </Text>
          </View>
        ) : (
          <BottomSheetScrollView
            style={styles.dayDetailScroll}
            contentContainerStyle={styles.dayDetailContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>
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
                    false: colors.surfaceElevated,
                    true: colors.primary,
                  }}
                  thumbColor={colors.white}
                />
                <Text style={styles.recurringToggleText}>
                  {t("calendar.showRecurring")}
                </Text>
              </View>
            </View>

            {filteredEntries.length === 0 ? (
              <View style={styles.emptyDay}>
                <Text style={styles.emptyDayText}>
                  {t("calendar.noHabitsScheduled")}
                </Text>
              </View>
            ) : null}

            {filteredEntries.map((entry: CalendarDayEntry, idx: number) => {
              const badge = statusBadgeColors(entry, colors);
              const icon = statusIconBgColor(entry, colors);

              return (
                <CalendarDayEntryRow
                  key={`${entry.habitId}-${idx}`}
                  entry={entry}
                  colors={colors}
                  badge={badge}
                  icon={icon}
                  statusText={statusLabel(entry, t)}
                  displayTime={displayTime}
                  isLast={idx === filteredEntries.length - 1}
                />
              );
            })}

            <TouchableOpacity
              style={styles.goToDayButton}
              onPress={() => {
                if (!selectedDay) return;
                setShowDayDetail(false);
                router.push(`/?date=${selectedDay}`);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.goToDayButtonText}>
                {t("calendar.goToDay")}
              </Text>
            </TouchableOpacity>
          </BottomSheetScrollView>
        )}
      </BottomSheetModal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },

    // Header
    header: {
      paddingTop: 32,
      paddingBottom: 8,
      gap: 16,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: "700",
      color: colors.textPrimary,
      letterSpacing: -0.5,
    },
    searchButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },

    // Month navigation pill
    monthNav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      padding: 4,
      // shadow-sm equivalent
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.4,
      shadowRadius: 3,
      elevation: 2,
    },
    monthNavButton: {
      width: 40,
      height: 40,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    monthLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
    },

    // Loading
    loadingContainer: {
      paddingVertical: 16,
    },
    loadingGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    loadingCell: {
      width: "13.28%",
      aspectRatio: 1,
      borderRadius: 20,
      backgroundColor: colors.surfaceElevated,
    },
    fetchingBar: {
      height: 2,
      borderRadius: 999,
      backgroundColor: colors.primary,
      marginTop: 8,
      marginBottom: 8,
    },
    fetchingBarVisible: {
      opacity: 1,
    },
    fetchingBarHidden: {
      opacity: 0,
      height: 0,
      marginTop: 0,
      marginBottom: 0,
    },

    // Calendar card
    calendarCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      padding: 12,
      marginTop: 8,
      // shadow-sm equivalent
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.4,
      shadowRadius: 3,
      elevation: 2,
    },
    calendarCardFetching: {
      opacity: 0.4,
    },

    // Weekday headers
    weekDayRow: {
      flexDirection: "row",
      marginBottom: 8,
    },
    weekDayCell: {
      flex: 1,
      alignItems: "center",
    },
    weekDayText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textFaded,
    },

    // Day rows
    weekRow: {
      flexDirection: "row",
      gap: 4,
      marginBottom: 4,
    },
    dayCell: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      aspectRatio: 1,
      borderRadius: 20,
      gap: 2,
    },
    dayCellToday: {
      borderWidth: 2,
      borderColor: colors.primary,
    },
    dayText: {
      fontSize: 14,
    },
    dayDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
    },

    // Legend
    legend: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 24,
      paddingVertical: 16,
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    legendText: {
      fontSize: 12,
      color: colors.textSecondary,
    },

    // Day detail: empty
    emptyDay: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 32,
      paddingHorizontal: 20,
    },
    emptyDayText: {
      fontSize: 14,
      color: colors.textMuted,
    },
    dayDetailScroll: {
      flex: 1,
    },
    dayDetailContent: {
      paddingHorizontal: 20,
      paddingBottom: 32,
    },

    // Day detail: summary
    summaryText: {
      fontSize: 14,
      color: colors.textFaded,
      flex: 1,
    },
    summaryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 12,
    },
    recurringToggleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    recurringToggleText: {
      fontSize: 12,
      color: colors.textSecondary,
    },

    // Day detail: entries
    dayEntryRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      gap: 12,
    },
    statusCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    dayEntryContent: {
      flex: 1,
      minWidth: 0,
    },
    dayEntryTitleRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 8,
    },
    dayEntryTitle: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.textPrimary,
      flexShrink: 1,
    },
    dayEntryTitleCompleted: {
      opacity: 0.6,
    },
    dayEntryTime: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
    },
    statusBadgeText: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.5,
    },
    divider: {
      height: 1,
      backgroundColor: colors.borderDivider,
    },
    goToDayButton: {
      marginTop: 16,
      borderRadius: 16,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      alignItems: "center",
    },
    goToDayButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.white,
    },
  });
}
