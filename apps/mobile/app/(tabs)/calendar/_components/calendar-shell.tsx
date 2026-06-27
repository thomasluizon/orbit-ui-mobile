import { useMemo, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react-native";
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
  previousMonthLabel: string;
  nextMonthLabel: string;
  previousYearLabel: string;
  nextYearLabel: string;
  currentMonthLabel: string;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onPreviousYear: () => void;
  onNextYear: () => void;
  onCurrentMonth: () => void;
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
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 4,
    },
    monthNavGroup: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
    monthNavButton: {
      width: 36,
      height: 36,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    monthNavButtonPressed: {
      backgroundColor: tokens.bgElev,
      transform: [{ scale: 0.92 }],
    },
    monthLabelButton: {
      flex: 1,
      height: 36,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    monthLabelButtonPressed: {
      backgroundColor: tokens.bgElev,
    },
    monthTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 17,
      letterSpacing: -0.17,
      color: tokens.fg1,
      textTransform: "capitalize",
      textAlign: "center",
    },
    legend: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
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
      opacity: 0.6,
    },
    legendDotDone: {
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: tokens.primary,
      opacity: 0.6,
    },
    legendDotPartial: {
      width: 6,
      height: 6,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: tokens.fg4,
      opacity: 0.6,
    },
    legendDotMissed: {
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: tokens.statusOverdue,
      opacity: 0.6,
    },
    legendLabel: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
    },
  });
}

export function CalendarHeader({
  monthLabel,
  previousMonthLabel,
  nextMonthLabel,
  previousYearLabel,
  nextYearLabel,
  currentMonthLabel,
  onPreviousMonth,
  onNextMonth,
  onPreviousYear,
  onNextYear,
  onCurrentMonth,
  tokens,
}: CalendarHeaderProps) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const monthNavRef = useRef<View>(null);
  useTourTarget("tour-calendar-month-nav", monthNavRef);

  return (
    <View ref={monthNavRef} collapsable={false} style={styles.headerWrap}>
      <View style={styles.monthNavGroup}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={previousYearLabel}
          onPress={onPreviousYear}
          hitSlop={4}
          style={({ pressed }) => [
            styles.monthNavButton,
            pressed && styles.monthNavButtonPressed,
          ]}
        >
          <ChevronsLeft size={18} color={tokens.fg3} strokeWidth={1.8} />
        </Pressable>
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
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={currentMonthLabel}
        onPress={onCurrentMonth}
        hitSlop={4}
        style={({ pressed }) => [
          styles.monthLabelButton,
          pressed && styles.monthLabelButtonPressed,
        ]}
      >
        <Text style={styles.monthTitle} numberOfLines={1}>
          {monthLabel}
        </Text>
      </Pressable>
      <View style={styles.monthNavGroup}>
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={nextYearLabel}
          onPress={onNextYear}
          hitSlop={4}
          style={({ pressed }) => [
            styles.monthNavButton,
            pressed && styles.monthNavButtonPressed,
          ]}
        >
          <ChevronsRight size={18} color={tokens.fg3} strokeWidth={1.8} />
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
