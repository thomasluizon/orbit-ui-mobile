import { useState, useMemo, useCallback } from "react"
import { View, Text, TouchableOpacity, StyleSheet } from "react-native"
import { addMonths, subMonths, parseISO } from "date-fns"
import { ChevronLeft, ChevronRight, X } from "lucide-react-native"
import { useTranslation } from "react-i18next"
import {
  buildHabitCalendarDayCells,
  buildHabitCalendarWeekdayKeys,
  buildHabitLogDateSet,
} from "@orbit/shared/utils"
import type { HabitLog } from "@orbit/shared/types/calendar"
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from "@/lib/use-app-theme"
import { useProfile } from "@/hooks/use-profile"
import { useHabitLogs } from "@/hooks/use-habits"
import { useDateFormat } from "@/hooks/use-date-format"
import { useTimeFormat } from "@/hooks/use-time-format"

interface HabitCalendarProps {
  habitId: string
  logs?: HabitLog[] | null
}

type AppTokens = ReturnType<typeof createTokensV2>

export function HabitCalendar({
  habitId,
  logs: externalLogs,
}: Readonly<HabitCalendarProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const { displayMonthYear, displayDate } = useDateFormat()
  const { displayTime } = useTimeFormat()

  const { data: fetchedLogs } = useHabitLogs(externalLogs ? null : habitId)
  const logs = useMemo(
    () => externalLogs ?? fetchedLogs ?? [],
    [externalLogs, fetchedLogs],
  )
  const { profile } = useProfile()
  const weekStartsOn = (profile?.weekStartDay ?? 1) as 0 | 1

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const logDates = useMemo(() => buildHabitLogDateSet(logs), [logs])

  const monthLabel = useMemo(
    () => displayMonthYear(currentMonth),
    [currentMonth, displayMonthYear],
  )

  const weekdays = useMemo(
    () =>
      buildHabitCalendarWeekdayKeys(weekStartsOn).map((key) => ({
        key,
        label: t(`dates.daysShort.${key}`).charAt(0),
      })),
    [t, weekStartsOn],
  )

  const calendarDays = useMemo(
    () => buildHabitCalendarDayCells(currentMonth, weekStartsOn, logDates),
    [currentMonth, logDates, weekStartsOn],
  )

  const totalInMonth = useMemo(
    () =>
      calendarDays.filter((day) => day.isCurrentMonth && day.isCompleted).length,
    [calendarDays],
  )

  const selectedDayLogs = useMemo(() => {
    if (!selectedDate) return []
    return logs.filter((log) => log.date === selectedDate)
  }, [logs, selectedDate])

  const prevMonth = useCallback(() => {
    setCurrentMonth((value) => subMonths(value, 1))
    setSelectedDate(null)
  }, [])

  const nextMonth = useCallback(() => {
    setCurrentMonth((value) => addMonths(value, 1))
    setSelectedDate(null)
  }, [])

  const goToToday = useCallback(() => {
    setCurrentMonth(new Date())
    setSelectedDate(null)
  }, [])

  const toggleDay = useCallback((dateStr: string) => {
    setSelectedDate((current) => (current === dateStr ? null : dateStr))
  }, [])

  function formatLogTime(createdAtUtc: string): string {
    const date = parseISO(createdAtUtc)
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    return displayTime(`${hh}:${mm}`)
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="habit-calendar-prev-month"
          style={styles.iconButton}
          onPress={prevMonth}
          activeOpacity={0.7}
          hitSlop={4}
        >
          <ChevronLeft size={20} color={tokens.fg2} strokeWidth={1.8} />
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
          hitSlop={4}
        >
          <ChevronRight size={20} color={tokens.fg2} strokeWidth={1.8} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekdayRow}>
        {weekdays.map((day, index) => (
          <View key={`${day.key}-${index}`} style={styles.weekdayCell}>
            <Text style={styles.weekdayText}>{day.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {calendarDays.map((day) => (
          <View key={day.dateStr} style={styles.dayCell}>
            {day.isCurrentMonth && day.isCompleted ? (
              <TouchableOpacity
                testID={`habit-calendar-day-${day.dateStr}`}
                style={[
                  styles.completedDay,
                  selectedDate === day.dateStr && styles.completedDaySelected,
                ]}
                hitSlop={5}
                onPress={() => toggleDay(day.dateStr)}
                activeOpacity={0.8}
              >
                <Text style={styles.completedDayText}>{day.dayNum}</Text>
              </TouchableOpacity>
            ) : (
              <View
                style={[
                  styles.dayPlaceholder,
                  day.isCurrentMonth ? styles.dayVisible : styles.dayHidden,
                  day.isCurrentMonth && day.isToday && styles.todayPlaceholder,
                ]}
              >
                <Text
                  style={[
                    styles.dayPlaceholderText,
                    day.isCurrentMonth && day.isToday && styles.todayPlaceholderText,
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
              {displayDate(parseISO(selectedDate))}
            </Text>
            <TouchableOpacity
              style={styles.closeSelectionButton}
              onPress={() => setSelectedDate(null)}
              activeOpacity={0.7}
              hitSlop={8}
            >
              <X size={16} color={tokens.fg3} strokeWidth={1.8} />
            </TouchableOpacity>
          </View>

          <View style={styles.selectedLogsList}>
            {selectedDayLogs.map((log) => (
              <View key={log.id} style={styles.logEntry}>
                <Text style={styles.logMeta}>
                  {t("habits.detail.loggedAt", {
                    time: formatLogTime(log.createdAtUtc),
                  })}
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
  )
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    container: {
      backgroundColor: tokens.bgCard,
      borderWidth: 1,
      borderColor: tokens.hairline,
      borderRadius: 18,
      paddingVertical: 16,
      paddingHorizontal: 14,
      gap: 10,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    monthButton: {
      flex: 1,
      alignItems: "center",
      paddingHorizontal: 8,
    },
    monthLabel: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 16,
      color: tokens.fg1,
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
      fontFamily: 'Roboto_500Medium',
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 0.44,
      color: tokens.fg4,
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
      width: 36,
      height: 36,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.statusDone,
    },
    completedDaySelected: {
      borderWidth: 2,
      borderColor: tokens.primary,
      transform: [{ scale: 1.04 }],
    },
    completedDayText: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 13,
      fontVariant: ["tabular-nums"],
      color: tokens.fgOnPrimary,
    },
    dayPlaceholder: {
      width: 36,
      height: 36,
      borderRadius: 999,
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
      borderWidth: 1.5,
      borderColor: tokens.primary,
    },
    dayPlaceholderText: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 13,
      fontVariant: ["tabular-nums"],
      color: tokens.fg3,
    },
    todayPlaceholderText: {
      color: tokens.fg1,
    },
    selectedLogs: {
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: tokens.hairline,
      borderRadius: 14,
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
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg1,
    },
    closeSelectionButton: {
      width: 34,
      height: 34,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    selectedLogsList: {
      gap: 8,
    },
    logEntry: {
      gap: 2,
    },
    logMeta: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      letterSpacing: 0.24,
      fontVariant: ["tabular-nums"],
      color: tokens.fg3,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: tokens.hairline,
    },
    footerLabel: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0.96,
      color: tokens.fg3,
    },
    footerValue: {
      flex: 1,
      textAlign: "right",
      fontFamily: 'Roboto_500Medium',
      fontSize: 13,
      fontVariant: ["tabular-nums"],
      color: tokens.statusDone,
    },
  })
}
