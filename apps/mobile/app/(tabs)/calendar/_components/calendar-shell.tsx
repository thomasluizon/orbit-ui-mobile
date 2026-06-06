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
  previousMonthLabel: string;
  nextMonthLabel: string;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
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
    legend: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      paddingHorizontal: 20,
      paddingVertical: 12,
      gap: 16,
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    legendDotFull: {
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: tokens.fg1,
    },
    legendDotUpcoming: {
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: tokens.primary,
    },
    legendDotMissed: {
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: tokens.statusOverdue,
    },
    legendLabel: {
      fontFamily: "Geist",
      fontSize: 13,
      color: tokens.fg2,
    },
  });
}

export function CalendarHeader({
  title,
  monthLabel,
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
      <View style={styles.legendItem}>
        <View style={styles.legendDotFull} />
        <Text style={styles.legendLabel}>{fullLabel}</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={styles.legendDotUpcoming} />
        <Text style={styles.legendLabel}>{partialLabel}</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={styles.legendDotMissed} />
        <Text style={styles.legendLabel}>{noneLabel}</Text>
      </View>
    </View>
  );
}
