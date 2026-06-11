import { useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTourTarget } from "@/hooks/use-tour-target";
import { createTokensV2 } from "@/lib/theme";

interface CalendarHeaderProps {
  monthLabel: string;
  subtitle?: string | null;
  previousMonthLabel: string;
  nextMonthLabel: string;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  tokens: ReturnType<typeof createTokensV2>;
}

interface CalendarLegendProps {
  todayLabel: string;
  doneLabel: string;
  partialLabel: string;
  missedLabel: string;
  tokens: ReturnType<typeof createTokensV2>;
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    headerWrap: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingHorizontal: 20,
      paddingTop: 20,
    },
    headerTitleCol: {
      flex: 1,
      minWidth: 0,
    },
    monthTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 24,
      letterSpacing: -0.24,
      color: tokens.fg1,
      textTransform: "capitalize",
    },
    monthSubtitle: {
      marginTop: 6,
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      color: tokens.fg3,
      fontVariant: ["tabular-nums"],
    },
    monthNavRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      flexShrink: 0,
    },
    monthNavButton: {
      width: 40,
      height: 40,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    monthNavButtonPressed: {
      backgroundColor: tokens.bgElev,
      transform: [{ scale: 0.92 }],
    },
    legend: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      paddingHorizontal: 20,
      paddingVertical: 14,
      gap: 16,
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    legendDotToday: {
      width: 6,
      height: 6,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: tokens.primary,
    },
    legendDotDone: {
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: tokens.primary,
    },
    legendDotPartial: {
      width: 6,
      height: 6,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: tokens.fg4,
    },
    legendDotMissed: {
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: tokens.statusOverdue,
    },
    legendLabel: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg2,
    },
  });
}

export function CalendarHeader({
  monthLabel,
  subtitle,
  previousMonthLabel,
  nextMonthLabel,
  onPreviousMonth,
  onNextMonth,
  tokens,
}: CalendarHeaderProps) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const monthNavRef = useRef<View>(null);
  useTourTarget("tour-calendar-month-nav", monthNavRef);

  return (
    <View style={styles.headerWrap}>
      <View style={styles.headerTitleCol}>
        <Text
          style={styles.monthTitle}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {monthLabel}
        </Text>
        {subtitle ? (
          <Text style={styles.monthSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View ref={monthNavRef} collapsable={false} style={styles.monthNavRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={previousMonthLabel}
          onPress={onPreviousMonth}
          hitSlop={4}
          style={({ pressed }) => [
            styles.monthNavButton,
            pressed && styles.monthNavButtonPressed,
          ]}
        >
          <ChevronLeft size={22} color={tokens.fg2} strokeWidth={1.8} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={nextMonthLabel}
          onPress={onNextMonth}
          hitSlop={4}
          style={({ pressed }) => [
            styles.monthNavButton,
            pressed && styles.monthNavButtonPressed,
          ]}
        >
          <ChevronRight size={22} color={tokens.fg2} strokeWidth={1.8} />
        </Pressable>
      </View>
    </View>
  );
}

export function CalendarLegend({
  todayLabel,
  doneLabel,
  partialLabel,
  missedLabel,
  tokens,
}: CalendarLegendProps) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const legendRef = useRef<View>(null);
  useTourTarget("tour-calendar-legend", legendRef);

  return (
    <View ref={legendRef} collapsable={false} style={styles.legend}>
      <View style={styles.legendItem}>
        <View style={styles.legendDotToday} />
        <Text style={styles.legendLabel}>{todayLabel}</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={styles.legendDotDone} />
        <Text style={styles.legendLabel}>{doneLabel}</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={styles.legendDotPartial} />
        <Text style={styles.legendLabel}>{partialLabel}</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={styles.legendDotMissed} />
        <Text style={styles.legendLabel}>{missedLabel}</Text>
      </View>
    </View>
  );
}
