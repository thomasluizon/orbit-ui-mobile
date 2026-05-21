import { useMemo, useRef } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react-native";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTourTarget } from "@/hooks/use-tour-target";
import { AppBar } from "@/components/ui/app-bar";
import { createTokensV2 } from "@/lib/theme";

interface CalendarHeaderProps {
  title: string;
  monthLabel: string;
  goToTodayLabel: string;
  previousMonthLabel: string;
  nextMonthLabel: string;
  onGoToToday: () => void;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  tokens: ReturnType<typeof createTokensV2>;
}

interface CalendarLoadingSkeletonProps {
  tokens: ReturnType<typeof createTokensV2>;
}

interface CalendarLegendProps {
  fullLabel: string;
  partialLabel: string;
  noneLabel: string;
  tokens: ReturnType<typeof createTokensV2>;
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    headerWrap: {
      // The AppBar handles its own padding; this wrapper is here so the
      // tour engine can anchor the month nav to a stable parent.
    },
    monthNavRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    monthNavButton: {
      width: 36,
      height: 36,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    loadingContainer: {
      paddingVertical: 16,
    },
    loadingGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    loadingCell: {
      width: "13.28%",
      aspectRatio: 1,
      borderRadius: 6,
      backgroundColor: tokens.bgSunk,
    },
    legend: {
      paddingHorizontal: 20,
    },
    legendRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.hairline,
    },
    legendDotWrap: {
      width: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    legendDotFull: {
      width: 5,
      height: 5,
      borderRadius: 999,
      backgroundColor: tokens.fg1,
    },
    legendDotPartial: {
      width: 5,
      height: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: tokens.fg3,
    },
    legendDotNone: {
      width: 9,
      height: 1,
      backgroundColor: tokens.fg3,
    },
    legendLabel: {
      fontFamily: "Geist",
      fontSize: 14,
      color: tokens.fg1,
    },
    legendDesc: {
      fontFamily: "Geist",
      fontSize: 13,
      color: tokens.fg3,
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
  tokens,
}: CalendarHeaderProps) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const monthNavRef = useRef<View>(null);
  useTourTarget("tour-calendar-month-nav", monthNavRef);

  return (
    <View style={styles.headerWrap}>
      <AppBar
        LeadingIcon={CalendarDays}
        title={title}
        subtitle={monthLabel}
        trailing={
          <View ref={monthNavRef} collapsable={false} style={styles.monthNavRow}>
            <TouchableOpacity
              accessibilityLabel={previousMonthLabel}
              style={styles.monthNavButton}
              onPress={onPreviousMonth}
              activeOpacity={0.7}
            >
              <ChevronLeft size={17} color={tokens.fg2} strokeWidth={1.6} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel={goToTodayLabel}
              style={styles.monthNavButton}
              onPress={onGoToToday}
              activeOpacity={0.7}
            >
              <ChevronRight size={17} color={tokens.fg2} strokeWidth={1.6} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel={nextMonthLabel}
              style={styles.monthNavButton}
              onPress={onNextMonth}
              activeOpacity={0.7}
            >
              <ChevronRight size={17} color={tokens.fg2} strokeWidth={1.6} />
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

export function CalendarLoadingSkeleton({
  tokens,
}: CalendarLoadingSkeletonProps) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);

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
  fullLabel,
  partialLabel,
  noneLabel,
  tokens,
}: CalendarLegendProps) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const legendRef = useRef<View>(null);
  useTourTarget("tour-calendar-legend", legendRef);

  return (
    <View ref={legendRef} collapsable={false} style={styles.legend}>
      <View style={styles.legendRow}>
        <View style={styles.legendDotWrap}>
          <View style={styles.legendDotFull} />
        </View>
        <Text style={styles.legendLabel}>{fullLabel}</Text>
      </View>
      <View style={styles.legendRow}>
        <View style={styles.legendDotWrap}>
          <View style={styles.legendDotPartial} />
        </View>
        <Text style={styles.legendLabel}>{partialLabel}</Text>
      </View>
      <View style={[styles.legendRow, { borderBottomWidth: 0 }]}>
        <View style={styles.legendDotWrap}>
          <View style={styles.legendDotNone} />
        </View>
        <Text style={styles.legendLabel}>{noneLabel}</Text>
      </View>
    </View>
  );
}
