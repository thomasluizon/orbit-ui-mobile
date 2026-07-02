import { useMemo } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Check } from "lucide-react-native";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";
import { createTokensV2 } from "@/lib/theme";

type Tokens = ReturnType<typeof createTokensV2>;

interface CalendarDayEntryRowProps {
  entry: CalendarDayEntry;
  tokens: Tokens;
  /** Visible outcome badge; null for upcoming habits (no badge shown). */
  statusText: string | null;
  /** Status-token color for the outcome badge text. */
  statusColor: string;
  /** Always-present label for the status circle's screen-reader announcement. */
  statusAccessibilityLabel: string;
  displayTime: (time: string) => string;
  isLast: boolean;
}

function statusCircleStyle(entry: CalendarDayEntry, tokens: Tokens): ViewStyle {
  if (entry.status === "completed") {
    return {
      backgroundColor: entry.isBadHabit ? tokens.statusBad : tokens.statusDone,
    };
  }
  if (entry.status === "missed" && !entry.isBadHabit) {
    return { borderWidth: 2, borderColor: tokens.statusOverdue };
  }
  return { borderWidth: 2, borderColor: tokens.statusEmpty };
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 15,
      gap: 12,
    },
    statusCircle: {
      width: 24,
      height: 24,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    content: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 8,
    },
    title: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      color: tokens.fg1,
      flexShrink: 1,
    },
    titleCompleted: {
      color: tokens.fg3,
      textDecorationLine: "line-through",
      textDecorationColor: tokens.hairlineStrong,
    },
    time: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      color: tokens.fg3,
      fontVariant: ["tabular-nums"],
    },
    statusPill: {
      flexShrink: 0,
      paddingVertical: 3,
      paddingHorizontal: 9,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    statusText: {
      fontFamily: 'Rubik_600SemiBold',
      fontSize: 10.5,
      letterSpacing: 0.63,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: tokens.hairline,
    },
  });
}

export function CalendarDayEntryRow({
  entry,
  tokens,
  statusText,
  statusColor,
  statusAccessibilityLabel,
  displayTime,
  isLast,
}: CalendarDayEntryRowProps) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View>
      <View style={styles.row}>
        <View
          accessibilityLabel={statusAccessibilityLabel}
          style={[styles.statusCircle, statusCircleStyle(entry, tokens)]}
        >
          {entry.status === "completed" ? (
            <Check size={15} strokeWidth={2.5} color={tokens.fgOnPrimary} />
          ) : null}
        </View>
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text
              style={[
                styles.title,
                entry.status === "completed" && styles.titleCompleted,
              ]}
              numberOfLines={1}
            >
              {entry.title}
            </Text>
            {entry.dueTime ? (
              <Text style={styles.time}>{displayTime(entry.dueTime)}</Text>
            ) : null}
          </View>
        </View>
        {statusText ? (
          <View style={styles.statusPill}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusText}
            </Text>
          </View>
        ) : null}
      </View>
      {!isLast ? (
        <View testID="calendar-day-entry-divider" style={styles.divider} />
      ) : null}
    </View>
  );
}
