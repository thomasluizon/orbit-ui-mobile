import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";
import {
  StatusDot,
  type StatusDotState,
} from "@/components/ui/status-dot";
import { createTokensV2 } from "@/lib/theme";

interface CalendarDayEntryRowProps {
  entry: CalendarDayEntry;
  tokens: ReturnType<typeof createTokensV2>;
  dotState: StatusDotState;
  /** Visible outcome badge; null for upcoming habits (no badge shown). */
  statusText: string | null;
  /** Always-present label for the status dot's screen-reader announcement. */
  statusAccessibilityLabel: string;
  displayTime: (time: string) => string;
  isLast: boolean;
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 13,
      gap: 12,
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
    statusText: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 10.5,
      letterSpacing: 0.4,
      color: tokens.fg3,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: tokens.hairline,
      marginLeft: 20,
    },
  });
}

export function CalendarDayEntryRow({
  entry,
  tokens,
  dotState,
  statusText,
  statusAccessibilityLabel,
  displayTime,
  isLast,
}: CalendarDayEntryRowProps) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View>
      <View style={styles.row}>
        <StatusDot
          state={dotState}
          size={9}
          accessibilityLabel={statusAccessibilityLabel}
        />
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
          <Text style={styles.statusText}>{statusText}</Text>
        ) : null}
      </View>
      {!isLast ? (
        <View testID="calendar-day-entry-divider" style={styles.divider} />
      ) : null}
    </View>
  );
}
