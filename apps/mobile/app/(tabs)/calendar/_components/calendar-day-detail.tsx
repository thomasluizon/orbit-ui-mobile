import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  FadeInDown,
  ReduceMotion,
} from "react-native-reanimated";
import { ArrowRight } from "lucide-react-native";
import type { TFunction } from "i18next";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";
import { plural } from "@/lib/plural";
import { PillButton } from "@/components/ui/pill-button";
import { createTokensV2 } from "@/lib/theme";
import { CalendarDayEntryRow } from "./calendar-day-entry";
import { ShowRecurringToggle } from "./show-recurring-toggle";

type Tokens = ReturnType<typeof createTokensV2>;

interface CalendarDayDetailProps {
  selectedEntries: CalendarDayEntry[];
  filteredEntries: CalendarDayEntry[];
  completedCount: number;
  showRecurring: boolean;
  onShowRecurringChange: (value: boolean) => void;
  onGoToDay: () => void;
  displayTime: (time: string) => string;
  t: TFunction;
  tokens: Tokens;
}

function statusBadge(
  entry: CalendarDayEntry,
  t: (key: string) => string,
): string | null {
  if (entry.isBadHabit) {
    if (entry.status === "completed") return t("calendar.status.indulged").toUpperCase();
    if (entry.status === "missed") return t("calendar.status.resisted").toUpperCase();
    return null;
  }
  if (entry.status === "completed") return t("calendar.status.completed").toUpperCase();
  if (entry.status === "missed") return t("calendar.status.missed").toUpperCase();
  return null;
}

function statusBadgeColor(entry: CalendarDayEntry, tokens: Tokens): string {
  if (entry.isBadHabit) {
    return entry.status === "completed" ? tokens.statusBadText : tokens.statusDone;
  }
  return entry.status === "completed" ? tokens.statusDone : tokens.statusOverdueText;
}

export function CalendarDayDetail({
  selectedEntries,
  filteredEntries,
  completedCount,
  showRecurring,
  onShowRecurringChange,
  onGoToDay,
  displayTime,
  t,
  tokens,
}: Readonly<CalendarDayDetailProps>) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const renderEntry = (item: CalendarDayEntry, index: number) => {
    const badge = statusBadge(item, t);
    const isFirst = index === 0;
    const isLast = index === filteredEntries.length - 1;
    return (
      <Animated.View
        key={item.habitId}
        style={[
          styles.entryRowFrame,
          {
            backgroundColor: tokens.bgCard,
            borderColor: tokens.hairline,
          },
          isFirst && styles.entryRowFrameFirst,
          isLast && styles.entryRowFrameLast,
        ]}
        entering={
          index < 8
            ? FadeInDown.duration(220)
                .delay(index * 30)
                .reduceMotion(ReduceMotion.System)
            : undefined
        }
      >
        <CalendarDayEntryRow
          entry={item}
          tokens={tokens}
          statusText={badge}
          statusColor={statusBadgeColor(item, tokens)}
          statusAccessibilityLabel={badge ?? t("calendar.status.upcoming")}
          displayTime={displayTime}
          isLast={isLast}
        />
      </Animated.View>
    );
  };

  return (
    <>
      {selectedEntries.length > 0 ? (
        <View style={styles.recurringToggleRow}>
          <ShowRecurringToggle
            checked={showRecurring}
            onChange={onShowRecurringChange}
            label={t("calendar.showRecurring")}
            tokens={tokens}
          />
        </View>
      ) : null}

      {selectedEntries.length === 0 || filteredEntries.length === 0 ? (
        <View style={styles.emptyDayCard}>
          <Text style={[styles.emptyDayText, { color: tokens.fg3 }]}>
            {t("calendar.noHabitsScheduled")}
          </Text>
        </View>
      ) : (
        <>
          <Text style={[styles.summaryText, { color: tokens.fg3 }]}>
            {plural(
              t("calendar.dayDetail.completionSummary", {
                done: completedCount,
                total: filteredEntries.length,
              }),
              filteredEntries.length,
            )}
          </Text>
          <View>
            {filteredEntries.map((entry, index) => renderEntry(entry, index))}
          </View>
        </>
      )}

      <PillButton
        variant="ghost"
        style={styles.goToDayButton}
        onPress={onGoToDay}
        leading={<ArrowRight size={18} strokeWidth={1.8} color={tokens.fg1} />}
      >
        {t("calendar.goToDay")}
      </PillButton>
    </>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    recurringToggleRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
    },
    summaryText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
    },
    emptyDayCard: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 24,
      paddingHorizontal: 18,
      borderRadius: 18,
      backgroundColor: tokens.bgCard,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    emptyDayText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      textAlign: "center",
    },
    entryRowFrame: {
      borderLeftWidth: 1,
      borderRightWidth: 1,
    },
    entryRowFrameFirst: {
      borderTopWidth: 1,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
    },
    entryRowFrameLast: {
      borderBottomWidth: 1,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 18,
    },
    goToDayButton: {
      marginTop: 4,
      alignSelf: "stretch",
    },
  });
}
