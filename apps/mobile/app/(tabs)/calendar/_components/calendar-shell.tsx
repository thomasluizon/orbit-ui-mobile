import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
} from "@/components/ui/icons";
import {
  useWindowDimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { createTokensV2 } from "@/lib/theme";
import { YearPicker } from "@/components/ui/year-picker";
import { Sheet, useSheetHost } from "@/components/ui/sheet";

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
  viewSelector?: ReactNode;
  showMonthNavigation?: boolean;
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
  loggableLabel: string;
  fullLabel: string;
  partialLabel: string;
  noneLabel: string;
  tokens: ReturnType<typeof createTokensV2>;
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    headerWrap: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 16,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
    },
    monthLabelGroup: {
      flexDirection: "row",
      alignItems: "center",
      gap: 0,
    },
    titleLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    hiddenNavigation: { opacity: 0 },
    monthNavButton: {
      width: 36,
      height: 36,
      borderRadius: 999,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    monthNavButtonPressed: {
      backgroundColor: tokens.bgHover,
      transform: [{ scale: 0.96 }],
    },
    monthLabelButton: {
      height: 36,
      borderRadius: 999,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    weekLabelButton: {
      height: 36,
      borderRadius: 999,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    monthLabelButtonPressed: {
      backgroundColor: tokens.bgHover,
      transform: [{ scale: 0.96 }],
    },
    monthTitle: {
      fontFamily: 'SpaceGrotesk_500Medium',
      fontSize: 28,
      letterSpacing: -0.17,
      color: tokens.fg1,
      textAlign: "center",
    },
    yearButton: {
      height: 36,
      borderRadius: 999,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    yearTitle: {
      fontFamily: 'GeistMono_500Medium',
      fontSize: 12,
      color: tokens.fg1,
      fontVariant: ['tabular-nums'],
    },
    yearTitleWide: { fontSize: 14 },
    legend: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      flexWrap: "wrap",
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 16,
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    legendWellLoggable: {
      width: 12,
      height: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgWell,
    },
    legendDotFull: {
      width: 12,
      height: 12,
      borderRadius: 999,
      backgroundColor: tokens.fg1,
    },
    legendDotNone: {
      width: 12,
      height: 12,
      borderRadius: 999,
      borderWidth: 2,
      borderColor: tokens.statusEmpty,
    },
    legendLabel: {
      fontFamily: 'Geist_400Regular',
      fontSize: 12,
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
  viewSelector,
  showMonthNavigation = true,
  tokens,
}: Readonly<CalendarHeaderProps>) {
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const monthNavRef = useRef<View>(null);
  const [isYearOpen, setIsYearOpen] = useState(false);
  const { sheetRef, closeSheet } = useSheetHost();

  const handleSelectYear = (nextYear: number) => {
    closeSheet(() => {
      setIsYearOpen(false);
      onSelectYear(nextYear);
    });
  };

  return (
    <View ref={monthNavRef} collapsable={false} testID="calendar-header-group" style={styles.headerWrap}>
      {showMonthNavigation ? <View style={styles.titleLine}>
      <View style={styles.monthLabelGroup}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={currentMonthLabel}
          onPress={onCurrentMonth}
          hitSlop={4}
          style={({ pressed }) => [styles.monthLabelButton, pressed && styles.monthLabelButtonPressed]}
        >
          <Text style={styles.monthTitle} numberOfLines={1}>{monthLabel}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={selectYearLabel}
          onPress={() => setIsYearOpen(true)}
          hitSlop={4}
          style={({ pressed }) => [styles.yearButton, pressed && styles.monthLabelButtonPressed]}
        >
          <Text style={[styles.yearTitle, width >= 1024 && styles.yearTitleWide]}>{year}</Text>
        </Pressable>
      </View>
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
        <ChevronLeft size={20} color={tokens.fg2} strokeWidth={1.8} />
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
        <ChevronRight size={20} color={tokens.fg2} strokeWidth={1.8} />
      </Pressable>
      </View> : <View style={[styles.titleLine, styles.hiddenNavigation]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.monthLabelGroup}>
          <View style={styles.monthLabelButton}><Text style={styles.monthTitle} numberOfLines={1}>{monthLabel}</Text></View>
          <View style={styles.yearButton}><Text style={[styles.yearTitle, width >= 1024 && styles.yearTitleWide]}>{year}</Text></View>
        </View>
        <View style={styles.monthNavButton} />
        <View style={styles.monthNavButton} />
      </View>}
      {viewSelector}

      {isYearOpen ? (
        <Sheet
          ref={sheetRef}
          open
          title={selectYearLabel}
          onClose={() => setIsYearOpen(false)}
          virtualizedBody
        >
          <YearPicker
            selectedYear={year}
            onSelectYear={handleSelectYear}
            tokens={tokens}
          />
        </Sheet>
      ) : null}
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
}: Readonly<CalendarWeekNavProps>) {
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
        <ChevronLeft size={20} color={tokens.fg2} strokeWidth={1.8} />
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
        <ChevronRight size={20} color={tokens.fg2} strokeWidth={1.8} />
      </Pressable>
    </View>
  );
}

export function CalendarLegend({
  loggableLabel,
  fullLabel,
  partialLabel,
  noneLabel,
  tokens,
}: Readonly<CalendarLegendProps>) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const legendRef = useRef<View>(null);

  return (
    <View ref={legendRef} collapsable={false} style={styles.legend}>
      <View style={styles.legendItem}>
        <View testID="calendar-legend-full" style={styles.legendDotFull} />
        <Text style={styles.legendLabel}>{fullLabel}</Text>
      </View>
      <View style={styles.legendItem}>
        <Svg testID="calendar-legend-partial" width={12} height={12}>
          <Circle cx={6} cy={6} r={5} fill="none" stroke={tokens.statusEmpty} strokeWidth={1.5} />
          <Circle cx={6} cy={6} r={5} fill="none" stroke={tokens.primary} strokeDasharray={[Math.PI * 5, Math.PI * 10]} strokeWidth={1.5} rotation={-135} origin="6, 6" />
        </Svg>
        <Text style={styles.legendLabel}>{partialLabel}</Text>
      </View>
      <View style={styles.legendItem}>
        <View testID="calendar-legend-none" style={styles.legendDotNone} />
        <Text style={styles.legendLabel}>{noneLabel}</Text>
      </View>
      <View style={styles.legendItem}>
        <View testID="calendar-legend-loggable" style={styles.legendWellLoggable} />
        <Text style={styles.legendLabel}>{loggableLabel}</Text>
      </View>
    </View>
  );
}
