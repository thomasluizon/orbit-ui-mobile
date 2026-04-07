import { useState, useMemo, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  isBefore,
  addMonths,
  subMonths,
  format,
  parseISO,
} from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useHabitLogs } from "@/hooks/use-habits";
import { useProfile } from "@/hooks/use-profile";
import { radius } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";
import type { HabitLog } from "@orbit/shared/types/calendar";

interface HabitCalendarProps {
  habitId: string;
  logs?: HabitLog[] | null;
}

export function HabitCalendar({
  habitId,
  logs: externalLogs,
}: Readonly<HabitCalendarProps>) {
  const { t, i18n } = useTranslation();
  const { colors, shadows } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, shadows),
    [colors, shadows],
  );
  const locale = i18n.language;
  const dateFnsLocale = locale === "pt-BR" ? ptBR : enUS;

  const { data: fetchedLogs } = useHabitLogs(externalLogs ? null : habitId);
  const logs = externalLogs ?? fetchedLogs ?? [];
  const { profile } = useProfile();
  const weekStartsOn = (profile?.weekStartDay ?? 1) as 0 | 1;

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const logDates = useMemo(() => {
    const set = new Set<string>();
    for (const log of logs) {
      set.add(log.date);
    }
    return set;
  }, [logs]);

  const monthLabel = useMemo(
    () =>
      format(
        currentMonth,
        locale === "pt-BR" ? "MMMM 'de' yyyy" : "MMMM yyyy",
        { locale: dateFnsLocale },
      ),
    [currentMonth, dateFnsLocale, locale],
  );

  const weekdays = useMemo(() => {
    const sundayFirst = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    const orderedKeys =
      weekStartsOn === 1
        ? [...sundayFirst.slice(1), sundayFirst[0]]
        : sundayFirst;

    return orderedKeys.map((day) =>
      t(
        `dates.daysShort.${day}` as
          | "dates.daysShort.sunday"
          | "dates.daysShort.monday"
          | "dates.daysShort.tuesday"
          | "dates.daysShort.wednesday"
          | "dates.daysShort.thursday"
          | "dates.daysShort.friday"
          | "dates.daysShort.saturday",
      ).charAt(0),
    );
  }, [t, weekStartsOn]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn });

    return eachDayOfInterval({
      start: calendarStart,
      end: calendarEnd,
    }).map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      return {
        date: day,
        dateStr,
        dayNum: day.getDate(),
        inMonth: isSameMonth(day, currentMonth),
        isToday: isToday(day),
        isPast: isBefore(day, new Date()) && !isToday(day),
        isCompleted: logDates.has(dateStr),
      };
    });
  }, [currentMonth, logDates, weekStartsOn]);

  const totalInMonth = useMemo(
    () =>
      calendarDays.filter((day) => day.inMonth && day.isCompleted).length,
    [calendarDays],
  );

  const selectedDayLogs = useMemo(() => {
    if (!selectedDate) return [];
    return logs.filter((log) => log.date === selectedDate);
  }, [logs, selectedDate]);

  const prevMonth = useCallback(() => {
    setCurrentMonth((value) => subMonths(value, 1));
    setSelectedDate(null);
  }, []);

  const nextMonth = useCallback(() => {
    setCurrentMonth((value) => addMonths(value, 1));
    setSelectedDate(null);
  }, []);

  const goToToday = useCallback(() => {
    setCurrentMonth(new Date());
    setSelectedDate(null);
  }, []);

  const toggleDay = useCallback((dateStr: string) => {
    setSelectedDate((current) => (current === dateStr ? null : dateStr));
  }, []);

  function formatLogTime(createdAtUtc: string): string {
    return format(parseISO(createdAtUtc), "HH:mm");
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="habit-calendar-prev-month"
          style={styles.iconButton}
          onPress={prevMonth}
          activeOpacity={0.7}
        >
          <ChevronLeft size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="habit-calendar-month-label"
          style={styles.monthButton}
          onPress={goToToday}
          activeOpacity={0.7}
        >
          <Text style={styles.monthLabel}>{monthLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="habit-calendar-next-month"
          style={styles.iconButton}
          onPress={nextMonth}
          activeOpacity={0.7}
        >
          <ChevronRight size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekdayRow}>
        {weekdays.map((day, index) => (
          <View key={`${day}-${index}`} style={styles.weekdayCell}>
            <Text style={styles.weekdayText}>{day}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {calendarDays.map((day) => (
          <View key={day.dateStr} style={styles.dayCell}>
            {day.inMonth && day.isCompleted ? (
              <TouchableOpacity
                testID={`habit-calendar-day-${day.dateStr}`}
                style={[
                  styles.completedDay,
                  selectedDate === day.dateStr && styles.completedDaySelected,
                ]}
                onPress={() => toggleDay(day.dateStr)}
                activeOpacity={0.8}
              >
                <Text style={styles.completedDayText}>{day.dayNum}</Text>
              </TouchableOpacity>
            ) : (
              <View
                style={[
                  styles.dayPlaceholder,
                  day.inMonth ? styles.dayVisible : styles.dayHidden,
                  day.inMonth && day.isToday && styles.todayPlaceholder,
                ]}
              >
                <Text
                  style={[
                    styles.dayPlaceholderText,
                    day.isPast && styles.dayPastText,
                  ]}
                >
                  {day.dayNum}
                </Text>
              </View>
            )}
          </View>
        ))}
      </View>

      {selectedDate && selectedDayLogs.length > 0 && (
        <View style={styles.selectedLogs}>
          <View style={styles.selectedLogsHeader}>
            <Text style={styles.selectedLogsDate}>
              {format(parseISO(selectedDate), "PPP", {
                locale: dateFnsLocale,
              })}
            </Text>
            <TouchableOpacity
              style={styles.closeSelectionButton}
              onPress={() => setSelectedDate(null)}
              activeOpacity={0.7}
            >
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.selectedLogsList}>
            {selectedDayLogs.map((log) => (
              <View key={log.id} style={styles.logEntry}>
                {log.note ? (
                  <Text style={styles.logNote}>{log.note}</Text>
                ) : null}
                <Text style={styles.logMeta}>
                  {log.note
                    ? t("habits.detail.loggedAt", {
                        time: formatLogTime(log.createdAtUtc),
                      })
                    : t("habits.detail.completed")}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerLabel}>{t("calendar.completionHistory")}</Text>
        <Text style={styles.footerValue}>
          {`${totalInMonth} ${
            totalInMonth === 1
              ? t("habits.detail.day")
              : t("habits.detail.days")
          }`}
        </Text>
      </View>
    </View>
  );
}

function createStyles(
  colors: ReturnType<typeof useAppTheme>["colors"],
  shadows: ReturnType<typeof useAppTheme>["shadows"],
) {
  return StyleSheet.create({
    container: {
      backgroundColor: colors.surfaceGround,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      borderRadius: radius.xl,
      padding: 16,
      gap: 12,
      ...shadows.sm,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    iconButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceElevated,
    },
    monthButton: {
      flex: 1,
      alignItems: "center",
      paddingHorizontal: 8,
    },
    monthLabel: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
      textTransform: "capitalize",
    },
    weekdayRow: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    weekdayCell: {
      width: "14.2857%",
      alignItems: "center",
      paddingBottom: 4,
    },
    weekdayText: {
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.8,
      color: colors.textMuted,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    dayCell: {
      width: "14.2857%",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 4,
    },
    completedDay: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    completedDaySelected: {
      borderWidth: 2,
      borderColor: colors.primary,
      transform: [{ scale: 1.04 }],
    },
    completedDayText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.white,
    },
    dayPlaceholder: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
    },
    dayVisible: {
      opacity: 1,
    },
    dayHidden: {
      opacity: 0,
    },
    todayPlaceholder: {
      borderWidth: 1,
      borderColor: colors.primary,
    },
    dayPlaceholderText: {
      fontSize: 12,
      fontWeight: "500",
      color: colors.textMuted,
    },
    dayPastText: {
      color: colors.textFaded,
    },
    selectedLogs: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      borderRadius: radius.lg,
      padding: 12,
      gap: 10,
    },
    selectedLogsHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    selectedLogsDate: {
      flex: 1,
      fontSize: 12,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    closeSelectionButton: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceElevated,
    },
    selectedLogsList: {
      gap: 8,
    },
    logEntry: {
      gap: 2,
    },
    logNote: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textPrimary,
    },
    logMeta: {
      fontSize: 11,
      color: colors.textMuted,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.borderMuted,
    },
    footerLabel: {
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.8,
      color: colors.textMuted,
    },
    footerValue: {
      flex: 1,
      textAlign: "right",
      fontSize: 12,
      fontWeight: "700",
      color: colors.primary,
    },
  });
}
