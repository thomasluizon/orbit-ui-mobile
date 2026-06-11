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
    },
    monthNavRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    monthNavButton: {
      width: 40,
      height: 40,
      borderRadius: 999,
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
  title,
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
      <AppBar
        LeadingIcon={CalendarDays}
        title={title}
        subtitle={subtitle ? `${monthLabel} · ${subtitle}` : monthLabel}
        trailing={
          <View ref={monthNavRef} collapsable={false} style={styles.monthNavRow}>
            <TouchableOpacity
              accessibilityLabel={previousMonthLabel}
              style={styles.monthNavButton}
              onPress={onPreviousMonth}
              activeOpacity={0.7}
              hitSlop={4}
            >
              <ChevronLeft size={22} color={tokens.fg2} strokeWidth={1.8} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel={nextMonthLabel}
              style={styles.monthNavButton}
              onPress={onNextMonth}
              activeOpacity={0.7}
              hitSlop={4}
            >
              <ChevronRight size={22} color={tokens.fg2} strokeWidth={1.8} />
            </TouchableOpacity>
          </View>
        }
      />
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
