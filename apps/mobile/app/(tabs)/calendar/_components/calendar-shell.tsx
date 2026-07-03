import { useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react-native";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTourTarget } from "@/hooks/use-tour-target";
import { createTokensV2, radius, shadowsV2 } from "@/lib/theme";
import { YearPicker } from "@/components/ui/year-picker";

interface CalendarHeaderProps {
  monthLabel: string;
  year: number;
  previousMonthLabel: string;
  nextMonthLabel: string;
  currentMonthLabel: string;
  selectYearLabel: string;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onCurrentMonth: () => void;
  onSelectYear: (year: number) => void;
  tokens: ReturnType<typeof createTokensV2>;
}

interface CalendarWeekNavProps {
  weekLabel: string;
  previousWeekLabel: string;
  nextWeekLabel: string;
  currentWeekLabel: string;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onCurrentWeek: () => void;
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
    monthLabelGroup: {
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
      transform: [{ scale: 0.96 }],
    },
    monthLabelButton: {
      height: 36,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 10,
    },
    weekLabelButton: {
      height: 36,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    monthLabelButtonPressed: {
      backgroundColor: tokens.bgElev,
      transform: [{ scale: 0.96 }],
    },
    monthTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 17,
      letterSpacing: -0.17,
      color: tokens.fg1,
      textAlign: "center",
    },
    yearButton: {
      height: 36,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8,
    },
    yearTitle: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 17,
      color: tokens.fg1,
      fontVariant: ['tabular-nums'],
    },
    yearBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    yearDialog: {
      width: '100%',
      maxWidth: 320,
      backgroundColor: tokens.bgSheet,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: tokens.hairline,
      padding: 10,
      ...shadowsV2.shadow2,
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
  year,
  previousMonthLabel,
  nextMonthLabel,
  currentMonthLabel,
  selectYearLabel,
  onPreviousMonth,
  onNextMonth,
  onCurrentMonth,
  onSelectYear,
  tokens,
}: CalendarHeaderProps) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const monthNavRef = useRef<View>(null);
  useTourTarget("tour-calendar-month-nav", monthNavRef);
  const [isYearOpen, setIsYearOpen] = useState(false);

  const handleSelectYear = (nextYear: number) => {
    onSelectYear(nextYear);
    setIsYearOpen(false);
  };

  return (
    <View ref={monthNavRef} collapsable={false} style={styles.headerWrap}>
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
      <View style={styles.monthLabelGroup}>
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={selectYearLabel}
          onPress={() => setIsYearOpen(true)}
          hitSlop={4}
          style={({ pressed }) => [
            styles.yearButton,
            pressed && styles.monthLabelButtonPressed,
          ]}
        >
          <Text
            style={[styles.yearTitle, isYearOpen && { color: tokens.primary }]}
          >
            {year}
          </Text>
        </Pressable>
      </View>
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

      <Modal
        visible={isYearOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsYearOpen(false)}
      >
        <Pressable style={styles.yearBackdrop} onPress={() => setIsYearOpen(false)}>
          <View style={styles.yearDialog} onStartShouldSetResponder={() => true}>
            <YearPicker
              selectedYear={year}
              onSelectYear={handleSelectYear}
              tokens={tokens}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

export function CalendarWeekNav({
  weekLabel,
  previousWeekLabel,
  nextWeekLabel,
  currentWeekLabel,
  onPreviousWeek,
  onNextWeek,
  onCurrentWeek,
  tokens,
}: CalendarWeekNavProps) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={styles.headerWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={previousWeekLabel}
        onPress={onPreviousWeek}
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
        accessibilityLabel={currentWeekLabel}
        onPress={onCurrentWeek}
        hitSlop={4}
        style={({ pressed }) => [
          styles.weekLabelButton,
          pressed && styles.monthLabelButtonPressed,
        ]}
      >
        <Text style={styles.monthTitle} numberOfLines={1}>
          {weekLabel}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nextWeekLabel}
        onPress={onNextWeek}
        hitSlop={4}
        style={({ pressed }) => [
          styles.monthNavButton,
          pressed && styles.monthNavButtonPressed,
        ]}
      >
        <ChevronRight size={22} color={tokens.fg2} strokeWidth={1.8} />
      </Pressable>
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
