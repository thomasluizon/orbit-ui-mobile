import { StyleSheet, View } from "react-native";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";
import { createTokensV2 } from "@/lib/theme";
import { CalendarWeekNav } from "./calendar-shell";
import { ShowRecurringToggle } from "./show-recurring-toggle";
import { CalendarTimeGrid, type TimeGridColumn } from "./calendar-time-grid";

type Tokens = ReturnType<typeof createTokensV2>;

interface CalendarWeekViewProps {
  columns: readonly TimeGridColumn[];
  dayMap: Map<string, CalendarDayEntry[]>;
  weekLabel: string;
  previousWeekLabel: string;
  nextWeekLabel: string;
  currentWeekLabel: string;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onCurrentWeek: () => void;
  onSelectDay: (dateStr: string) => void;
  displayTime: (time: string) => string;
  language: string;
  allDayLabel: string;
  nowLabel: string;
  showRecurring: boolean;
  onShowRecurringChange: (value: boolean) => void;
  showRecurringLabel: string;
  tokens: Tokens;
}

/** Week view: a 7-day time grid with week-granularity navigation and the
 *  show-recurring toggle. */
export function CalendarWeekView({
  columns,
  dayMap,
  weekLabel,
  previousWeekLabel,
  nextWeekLabel,
  currentWeekLabel,
  onPreviousWeek,
  onNextWeek,
  onCurrentWeek,
  onSelectDay,
  displayTime,
  language,
  allDayLabel,
  nowLabel,
  showRecurring,
  onShowRecurringChange,
  showRecurringLabel,
  tokens,
}: Readonly<CalendarWeekViewProps>) {
  return (
    <>
      <CalendarWeekNav
        weekLabel={weekLabel}
        previousWeekLabel={previousWeekLabel}
        nextWeekLabel={nextWeekLabel}
        currentWeekLabel={currentWeekLabel}
        onPreviousWeek={onPreviousWeek}
        onNextWeek={onNextWeek}
        onCurrentWeek={onCurrentWeek}
        tokens={tokens}
      />
      <View style={styles.toggleRowEnd}>
        <ShowRecurringToggle
          checked={showRecurring}
          onChange={onShowRecurringChange}
          label={showRecurringLabel}
          tokens={tokens}
        />
      </View>
      <CalendarTimeGrid
        columns={columns}
        dayMap={dayMap}
        onSelectDay={onSelectDay}
        displayTime={displayTime}
        language={language}
        allDayLabel={allDayLabel}
        nowLabel={nowLabel}
        tokens={tokens}
      />
    </>
  );
}

const styles = StyleSheet.create({
  toggleRowEnd: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
});
