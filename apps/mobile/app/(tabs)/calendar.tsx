import { useState, useMemo, useCallback, useRef } from "react";
import { useTourTarget } from "@/hooks/use-tour-target";
import { useTourScrollContainer } from "@/hooks/use-tour-scroll-container";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  Switch,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  ReduceMotion,
} from "react-native-reanimated";
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
import { GestureDetector } from "react-native-gesture-handler";
import { createTokensV2 } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { GradientTop } from "@/components/ui/gradient-top";
import { PillButton } from "@/components/ui/pill-button";
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
type DayStatus = "empty" | "full" | "partial" | "missed";
type MonthSlide = "left" | "right" | null;

function dayStatus(cell: GridDay): DayStatus {
  if (!cell.isCurrentMonth || cell.totalCount === 0) return "empty";
  if (cell.completedCount === cell.totalCount) return "full";
  const hasMissed = cell.entries.some(
    (entry: CalendarDayEntry) => entry.status === "missed",
  );
  if (hasMissed) return "missed";
  return "partial";
}

function entryDotState(entry: CalendarDayEntry): StatusDotState {
  if (entry.status === "completed") return "done";
  if (entry.status === "missed") return "overdue";
  if (entry.isBadHabit) return "bad";
  return "empty";
}

function dayStatusLabel(
  status: DayStatus,
  t: (key: string) => string,
): string | null {
  if (status === "full") return t("calendar.legend.done");
  if (status === "partial") return t("calendar.legend.partial");
  if (status === "missed") return t("calendar.legend.missed");
  return null;
}

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

function statusBadgeColor(entry: CalendarDayEntry, tokens: Tokens): string {
  if (entry.isBadHabit) {
    return entry.status === "completed" ? tokens.statusBad : tokens.statusDone;
  }
  return entry.status === "completed" ? tokens.statusDone : tokens.statusOverdue;
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

  const swipeGesture = useHorizontalSwipe({
    onSwipeLeft: nextMonth,
    onSwipeRight: prevMonth,
  });

  const onSelectDay = useCallback((dateStr: string) => {
    setSelectedDay(dateStr);
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

  const monthSummary = useMemo(() => {
    if (isLoading || dayMap.size === 0) return null;
    let daysWithActivity = 0;
    let daysCompleted = 0;
    dayMap.forEach((entries: CalendarDayEntry[]) => {
      if (entries.length === 0) return;
      daysWithActivity++;
      const allDone = entries.every(
        (entry: CalendarDayEntry) => entry.status === "completed",
      );
      if (allDone) daysCompleted++;
    });
    if (daysWithActivity === 0) return null;
    const pct = Math.round((daysCompleted / daysWithActivity) * 100);
    return `${daysCompleted}/${daysWithActivity} ${plural(t("calendar.summary.days"), daysCompleted)} (${pct}%)`;
  }, [dayMap, isLoading, t]);

  const goToSelectedDay = () => {
    if (!selectedDay) return;
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

  const monthEntering =
    monthSlide === "right"
      ? FadeInRight.duration(220).reduceMotion(ReduceMotion.System)
      : monthSlide === "left"
        ? FadeInLeft.duration(220).reduceMotion(ReduceMotion.System)
        : undefined;

  const hasDayEntries = Boolean(selectedDay) && filteredEntries.length > 0;

  const listHeader = (
    <>
      <GestureDetector gesture={swipeGesture}>
        <View
          ref={calendarGridRef}
          collapsable={false}
          style={styles.calendarGrid}
        >
          <Animated.View
            key={format(currentMonth, "yyyy-MM")}
            entering={monthEntering}
            style={styles.gridCard}
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
                const selected = canSelect && cell.dateStr === selectedDay;
                const statusLabel = dayStatusLabel(status, t);
                const dayDateLabel = format(cell.date, "EEEE, MMM d", {
                  locale: i18n.language === "pt-BR" ? ptBR : enUS,
                });
                const dayAccessibilityLabel = statusLabel
                  ? `${dayDateLabel}, ${statusLabel}`
                  : dayDateLabel;

                return (
                  <Pressable
                    key={cell.dateStr}
                    ref={cell.isToday ? calendarDayRef : undefined}
                    onPress={() => canSelect && onSelectDay(cell.dateStr)}
                    disabled={!canSelect}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={dayAccessibilityLabel}
                    accessibilityState={{ selected, disabled: !canSelect }}
                    style={({ pressed }) => [
                      styles.dayCell,
                      pressed && canSelect && styles.dayCellPressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.dayNumPill,
                        cell.isToday && !selected && {
                          borderWidth: 1.5,
                          borderColor: tokens.primary,
                        },
                        selected && {
                          backgroundColor: tokens.selectionBg,
                          borderRadius: 14,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          cell.isToday ? styles.dayTextToday : styles.dayText,
                          {
                            color:
                              selected || cell.isToday
                                ? tokens.fg1
                                : cell.isCurrentMonth
                                  ? tokens.fg2
                                  : tokens.fg4,
                          },
                        ]}
                      >
                        {cell.day}
                      </Text>
                    </View>
                    {isLoading ? (
                      <View style={styles.dayDotSkeleton} />
                    ) : (
                      <DayDot status={status} tokens={tokens} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        </View>
      </GestureDetector>

      <CalendarLegend
        todayLabel={t("calendar.legend.today")}
        doneLabel={t("calendar.legend.done")}
        partialLabel={t("calendar.legend.partial")}
        missedLabel={t("calendar.legend.missed")}
        tokens={tokens}
      />

      {selectedDay ? (
        <View style={styles.daySectionHeaderBlock}>
          <View style={styles.daySectionHeader}>
            <Text style={styles.daySectionTitle} numberOfLines={1}>
              {formattedSelectedDate}
            </Text>
            {selectedEntries.length > 0 ? (
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
            ) : null}
          </View>

          {selectedEntries.length === 0 || filteredEntries.length === 0 ? (
            <View style={styles.emptyDayCard}>
              <Text style={[styles.emptyDayText, { color: tokens.fg3 }]}>
                {t("calendar.noHabitsScheduled")}
              </Text>
            </View>
          ) : (
            <Text style={[styles.summaryText, { color: tokens.fg3 }]}>
              {plural(
                t("calendar.dayDetail.completionSummary", {
                  done: completedCount,
                  total: filteredEntries.length,
                }),
                filteredEntries.length,
              )}
            </Text>
          )}
        </View>
      ) : null}
    </>
  );

  const listFooter = (
    <View style={styles.listFooter}>
      {selectedDay ? (
        <PillButton
          variant="ghost"
          style={styles.goToDayButton}
          onPress={goToSelectedDay}
        >
          {t("calendar.goToDay")}
        </PillButton>
      ) : null}

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
    </View>
  );

  const renderEntry = ({
    item,
    index,
  }: {
    item: CalendarDayEntry;
    index: number;
  }) => {
    const badge = statusBadge(item, t);
    const isFirst = index === 0;
    const isLast = index === filteredEntries.length - 1;
    return (
      <View style={styles.entriesCardPad}>
        <Animated.View
          style={[
            styles.entryRowFrame,
            {
              backgroundColor: tokens.bgCard,
              borderColor: tokens.hairline,
            },
            isFirst && styles.entryRowFrameFirst,
            isLast && styles.entryRowFrameLast,
          ]}
          entering={
            index < 8
              ? FadeInDown.duration(220)
                  .delay(index * 30)
                  .reduceMotion(ReduceMotion.System)
              : undefined
          }
        >
          <CalendarDayEntryRow
            entry={item}
            tokens={tokens}
            dotState={entryDotState(item)}
            statusText={badge}
            statusColor={statusBadgeColor(item, tokens)}
            statusAccessibilityLabel={badge ?? t("calendar.status.upcoming")}
            displayTime={displayTime}
            isLast={isLast}
          />
        </Animated.View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.bg }]}>
      <GradientTop height={180} />
      <CalendarHeader
        monthLabel={monthLabel}
        subtitle={monthSummary}
        previousMonthLabel={t("common.previousMonth")}
        nextMonthLabel={t("common.nextMonth")}
        onPreviousMonth={prevMonth}
        onNextMonth={nextMonth}
        tokens={tokens}
      />
      <FlatList
        ref={calendarScrollRef}
        style={styles.container}
        data={hasDayEntries ? filteredEntries : []}
        keyExtractor={(item, index) => `${item.habitId}-${index}`}
        renderItem={renderEntry}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        showsVerticalScrollIndicator={false}
        onScroll={onCalendarTourScroll}
        scrollEventThrottle={16}
      />
    </SafeAreaView>
  );
}

function DayDot({
  status,
  tokens,
}: Readonly<{
  status: DayStatus;
  tokens: Tokens;
}>) {
  if (status === "full") {
    return (
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          backgroundColor: tokens.primary,
        }}
      />
    );
  }
  if (status === "missed") {
    return (
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          backgroundColor: tokens.statusOverdue,
        }}
      />
    );
  }
  if (status === "partial") {
    return (
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          borderWidth: 1.5,
          borderColor: tokens.fg4,
        }}
      />
    );
  }
  return <View style={{ width: 6, height: 6 }} />;
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    container: { flex: 1 },

    calendarGrid: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 10,
    },
    gridCard: {
      borderRadius: 18,
      paddingVertical: 18,
      paddingHorizontal: 14,
      backgroundColor: tokens.bgCard,
      borderWidth: 1,
      borderColor: tokens.hairline,
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
      fontFamily: 'Roboto_500Medium',
      fontSize: 11,
      letterSpacing: 0.44,
      textTransform: "uppercase",
      fontVariant: ["tabular-nums"],
    },

    daysGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      rowGap: 8,
    },
    dayCell: {
      width: "14.2857%",
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      borderRadius: 999,
    },
    dayCellPressed: {
      backgroundColor: tokens.bgElev,
      transform: [{ scale: 0.92 }],
    },
    dayNumPill: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    dayText: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 14,
      fontVariant: ["tabular-nums"],
    },
    dayTextToday: {
      fontFamily: 'Roboto_700Bold',
      fontSize: 14,
      fontVariant: ["tabular-nums"],
    },
    dayDotSkeleton: {
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: tokens.hairline,
      opacity: 0.5,
    },

    daySectionHeaderBlock: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 12,
      gap: 12,
    },
    daySectionHeader: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 12,
    },
    listFooter: {
      paddingTop: 4,
    },
    daySectionTitle: {
      flex: 1,
      minWidth: 0,
      fontFamily: 'Rubik_500Medium',
      fontSize: 20,
      color: tokens.fg1,
      textTransform: "capitalize",
    },
    recurringToggleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexShrink: 0,
    },
    recurringToggleText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
    },
    summaryText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
    },

    emptyDayCard: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 24,
      paddingHorizontal: 18,
      borderRadius: 18,
      backgroundColor: tokens.bgCard,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    emptyDayText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      textAlign: "center",
    },

    entriesCardPad: {
      paddingHorizontal: 20,
    },
    entryRowFrame: {
      borderLeftWidth: 1,
      borderRightWidth: 1,
    },
    entryRowFrameFirst: {
      borderTopWidth: 1,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
    },
    entryRowFrameLast: {
      borderBottomWidth: 1,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 18,
    },

    goToDayButton: {
      marginTop: 6,
      marginHorizontal: 20,
      alignSelf: "stretch",
    },
  });
}
