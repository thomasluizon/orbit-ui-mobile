import { useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react-native";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTourTarget } from "@/hooks/use-tour-target";

interface AppColors {
  background: string;
  borderMuted: string;
  surface: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  textFaded: string;
  green500: string;
  primary: string;
  orange500: string;
}

interface CalendarHeaderProps {
  title: string;
  monthLabel: string;
  goToTodayLabel: string;
  previousMonthLabel: string;
  nextMonthLabel: string;
  onGoToToday: () => void;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  colors: AppColors;
}

interface CalendarLoadingSkeletonProps {
  colors: AppColors;
}

interface CalendarLegendProps {
  doneLabel: string;
  upcomingLabel: string;
  missedLabel: string;
  colors: AppColors;
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    header: {
      paddingTop: 24,
      paddingBottom: 10,
      gap: 14,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: "700",
      color: colors.textPrimary,
      letterSpacing: -0.5,
    },
    searchButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderMuted,
    },
    monthNav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surfaceElevated,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      padding: 4,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.18,
      shadowRadius: 8,
      elevation: 3,
    },
    monthNavButton: {
      width: 40,
      height: 40,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    monthLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    loadingContainer: {
      paddingVertical: 16,
    },
    loadingGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    loadingCell: {
      width: "13.28%",
      aspectRatio: 1,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderMuted,
    },
    legend: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 24,
      paddingVertical: 14,
      borderRadius: 20,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.borderMuted,
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    legendText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
  });
}

export function CalendarHeader({
  title,
  monthLabel,
  goToTodayLabel,
  previousMonthLabel,
  nextMonthLabel,
  onGoToToday,
  onPreviousMonth,
  onNextMonth,
  colors,
}: CalendarHeaderProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const monthNavRef = useRef<View>(null);
  useTourTarget("tour-calendar-month-nav", monthNavRef);

  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>{title}</Text>
        <TouchableOpacity
          accessibilityLabel={goToTodayLabel}
          style={styles.searchButton}
          onPress={onGoToToday}
          activeOpacity={0.7}
        >
          <Search size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View ref={monthNavRef} style={styles.monthNav}>
        <TouchableOpacity
          accessibilityLabel={previousMonthLabel}
          style={styles.monthNavButton}
          onPress={onPreviousMonth}
          activeOpacity={0.7}
        >
          <ChevronLeft size={12} color={colors.textFaded} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onGoToToday} activeOpacity={0.7}>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityLabel={nextMonthLabel}
          style={styles.monthNavButton}
          onPress={onNextMonth}
          activeOpacity={0.7}
        >
          <ChevronRight size={12} color={colors.textFaded} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function CalendarLoadingSkeleton({
  colors,
}: CalendarLoadingSkeletonProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.loadingContainer}>
      <View style={styles.loadingGrid}>
        {Array.from({ length: 35 }, (_, index) => (
          <View key={`sk-${index}`} style={styles.loadingCell} />
        ))}
      </View>
    </View>
  );
}

export function CalendarLegend({
  doneLabel,
  upcomingLabel,
  missedLabel,
  colors,
}: CalendarLegendProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const legendRef = useRef<View>(null);
  useTourTarget("tour-calendar-legend", legendRef);

  return (
    <View ref={legendRef} style={styles.legend}>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: colors.green500 }]} />
        <Text style={styles.legendText}>{doneLabel}</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
        <Text style={styles.legendText}>{upcomingLabel}</Text>
      </View>
      <View style={styles.legendItem}>
        <View
          style={[styles.legendDot, { backgroundColor: colors.orange500 }]}
        />
        <Text style={styles.legendText}>{missedLabel}</Text>
      </View>
    </View>
  );
}
