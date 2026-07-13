import { useMemo, type RefObject } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Animated, { type EntryOrExitLayoutType } from "react-native-reanimated";
import { format } from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import type { TFunction } from "i18next";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";
import { GestureDetector, type PanGesture } from "react-native-gesture-handler";
import { createTokensV2, tintFromPrimary } from "@/lib/theme";

type Tokens = ReturnType<typeof createTokensV2>;
type DayStatus = "empty" | "full" | "partial" | "missed";

function isInRange(
  dateStr: string,
  start?: string | null,
  end?: string | null,
): boolean {
  if (!start || !end) return false;
  const lo = start <= end ? start : end;
  const hi = start <= end ? end : start;
  return dateStr >= lo && dateStr <= hi;
}

export interface GridDay {
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

export interface WeekdayHeader {
  key: string;
  label: string;
}

interface CalendarGridProps {
  gridDays: GridDay[];
  weekdayHeaders: WeekdayHeader[];
  selectedDay: string | null;
  isLoading: boolean;
  /** Inclusive range endpoints (yyyy-MM-dd) for range-pick mode. When set, the
   *  grid renders an in-range band with highlighted endpoints. */
  rangeStart?: string | null;
  rangeEnd?: string | null;
  monthKey?: string;
  monthEntering?: EntryOrExitLayoutType | undefined;
  swipeGesture?: PanGesture;
  gridRef?: RefObject<View | null>;
  todayRef?: RefObject<View | null>;
  onSelectDay: (dateStr: string) => void;
  language: string;
  t: TFunction;
  tokens: Tokens;
}

function dayStatus(cell: GridDay): DayStatus {
  if (!cell.isCurrentMonth || cell.totalCount === 0) return "empty";
  if (cell.completedCount === cell.totalCount) return "full";
  const hasMissed = cell.entries.some(
    (entry: CalendarDayEntry) => entry.status === "missed",
  );
  if (hasMissed) return "missed";
  return "partial";
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

export function CalendarGrid({
  gridDays,
  weekdayHeaders,
  selectedDay,
  isLoading,
  rangeStart = null,
  rangeEnd = null,
  monthKey,
  monthEntering,
  swipeGesture,
  gridRef,
  todayRef,
  onSelectDay,
  language,
  t,
  tokens,
}: Readonly<CalendarGridProps>) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const grid = (
    <View ref={gridRef} collapsable={false} style={styles.calendarGrid}>
      <Animated.View key={monthKey} entering={monthEntering} style={styles.gridCard}>
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
            const inRange = canSelect && isInRange(cell.dateStr, rangeStart, rangeEnd);
            const isEndpoint =
              canSelect &&
              (cell.dateStr === rangeStart || cell.dateStr === rangeEnd);
            const highlighted = selected || isEndpoint;
            const statusLabel = dayStatusLabel(status, t);
            const dayDateLabel = format(cell.date, "EEEE, MMM d", {
              locale: language === "pt-BR" ? ptBR : enUS,
            });
            const labelParts = [dayDateLabel];
            if (cell.isToday) labelParts.push(t("calendar.legend.today"));
            if (statusLabel) labelParts.push(statusLabel);
            const dayAccessibilityLabel = labelParts.join(", ");

            return (
              <Pressable
                key={cell.dateStr}
                ref={cell.isToday ? todayRef : undefined}
                onPress={() => canSelect && onSelectDay(cell.dateStr)}
                disabled={!canSelect}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={dayAccessibilityLabel}
                accessibilityState={{ selected: highlighted, disabled: !canSelect }}
                style={({ pressed }) => [
                  styles.dayCell,
                  !cell.isCurrentMonth && { opacity: 0.5 },
                  inRange && { backgroundColor: tintFromPrimary(tokens, 0.12) },
                  pressed && canSelect && styles.dayCellPressed,
                ]}
              >
                <View
                  style={[
                    styles.dayNumPill,
                    cell.isToday && !highlighted && {
                      borderWidth: 1.5,
                      borderColor: tokens.primary,
                    },
                    highlighted && {
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
                          highlighted || cell.isToday
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
  );

  if (!swipeGesture) return grid;
  return <GestureDetector gesture={swipeGesture}>{grid}</GestureDetector>;
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
      transform: [{ scale: 0.96 }],
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
  });
}
