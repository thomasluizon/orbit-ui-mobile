import { Check } from "lucide-react-native";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";

export interface CalendarDayEntryColors {
  textPrimary: string;
  textSecondary: string;
  borderDivider: string;
  emerald400: string;
}

interface CalendarDayEntryRowProps {
  entry: CalendarDayEntry;
  colors: CalendarDayEntryColors;
  badge: { text: string; bg: string };
  icon: { bg: string; border: string; showCheck: boolean };
  statusText: string;
  displayTime: (time: string) => string;
  isLast: boolean;
}

function createStyles(colors: CalendarDayEntryColors) {
  return StyleSheet.create({
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
  });
}

export function CalendarDayEntryRow({
  entry,
  colors,
  badge,
  icon,
  statusText,
  displayTime,
  isLast,
}: CalendarDayEntryRowProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View>
      <View style={styles.dayEntryRow}>
        <View
          style={[
            styles.statusCircle,
            {
              backgroundColor: icon.bg,
              borderColor: icon.border,
            },
          ]}
        >
          {icon.showCheck && <Check size={12} color={colors.emerald400} />}
        </View>

        <View style={styles.dayEntryContent}>
          <View style={styles.dayEntryTitleRow}>
            <Text
              style={[
                styles.dayEntryTitle,
                entry.status === "completed" && styles.dayEntryTitleCompleted,
              ]}
              numberOfLines={1}
            >
              {entry.title}
            </Text>
            {entry.dueTime && (
              <Text style={styles.dayEntryTime}>{displayTime(entry.dueTime)}</Text>
            )}
          </View>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.statusBadgeText, { color: badge.text }]}>
            {statusText}
          </Text>
        </View>
      </View>

      {!isLast && <View testID="calendar-day-entry-divider" style={styles.divider} />}
    </View>
  );
}
