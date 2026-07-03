import { StyleSheet, Text, View } from "react-native";
import type { TFunction } from "i18next";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";
import { createTokensV2 } from "@/lib/theme";
import {
  CalendarGrid,
  type GridDay,
  type WeekdayHeader,
} from "./calendar-grid";
import { ShowRecurringToggle } from "./show-recurring-toggle";
import { CalendarTimeGrid, type TimeGridColumn } from "./calendar-time-grid";

type Tokens = ReturnType<typeof createTokensV2>;

interface CalendarRangeViewProps {
  gridDays: GridDay[];
  weekdayHeaders: WeekdayHeader[];
  isLoading: boolean;
  rangeStart: string;
  rangeEnd: string;
  onPickDay: (dateStr: string) => void;
  columns: readonly TimeGridColumn[];
  rangeDayMap: Map<string, CalendarDayEntry[]>;
  hint: string;
  /** Notice shown in place of the hint when the picked range was clamped to the
   *  maximum number of days. */
  clampedNotice: string;
  isClamped: boolean;
  /** True between the first and second taps of a range pick. */
  isAwaitingEnd: boolean;
  isRangeLoading?: boolean;
  onSelectDay: (dateStr: string) => void;
  displayTime: (time: string) => string;
  language: string;
  allDayLabel: string;
  nowLabel: string;
  showRecurring: boolean;
  onShowRecurringChange: (value: boolean) => void;
  showRecurringLabel: string;
  t: TFunction;
  tokens: Tokens;
}

/** Interval view: a mini-calendar to pick a contiguous range (capped at the
 *  shared MAX_RANGE_DAYS), then the same time grid rendered with one column per
 *  day in that range. */
export function CalendarRangeView({
  gridDays,
  weekdayHeaders,
  isLoading,
  rangeStart,
  rangeEnd,
  onPickDay,
  columns,
  rangeDayMap,
  hint,
  clampedNotice,
  isClamped,
  isAwaitingEnd,
  isRangeLoading = false,
  onSelectDay,
  displayTime,
  language,
  allDayLabel,
  nowLabel,
  showRecurring,
  onShowRecurringChange,
  showRecurringLabel,
  t,
  tokens,
}: Readonly<CalendarRangeViewProps>) {
  const hintText = isAwaitingEnd
    ? t("calendar.timeGrid.pickEndHint")
    : isClamped
      ? clampedNotice
      : hint;

  return (
    <>
      <CalendarGrid
        gridDays={gridDays}
        weekdayHeaders={weekdayHeaders}
        selectedDay={null}
        isLoading={isLoading}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        onSelectDay={onPickDay}
        language={language}
        t={t}
        tokens={tokens}
      />
      <View style={styles.hintRow}>
        <Text
          style={[
            styles.hintText,
            {
              color:
                isClamped && !isAwaitingEnd
                  ? tokens.statusOverdueText
                  : tokens.fg3,
            },
          ]}
        >
          {hintText}
        </Text>
        <ShowRecurringToggle
          checked={showRecurring}
          onChange={onShowRecurringChange}
          label={showRecurringLabel}
          tokens={tokens}
        />
      </View>
      <CalendarTimeGrid
        columns={columns}
        dayMap={rangeDayMap}
        onSelectDay={onSelectDay}
        displayTime={displayTime}
        language={language}
        allDayLabel={allDayLabel}
        nowLabel={nowLabel}
        isLoading={isRangeLoading}
        t={t}
        tokens={tokens}
      />
    </>
  );
}

const styles = StyleSheet.create({
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  hintText: {
    flexShrink: 1,
    fontFamily: "Rubik_400Regular",
    fontSize: 13,
  },
});
