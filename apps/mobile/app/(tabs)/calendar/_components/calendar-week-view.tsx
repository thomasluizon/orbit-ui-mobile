import { StyleSheet, View } from "react-native";
import Animated, {
  FadeInLeft,
  FadeInRight,
  ReduceMotion,
} from "react-native-reanimated";
import type { TFunction } from "i18next";
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
  /** Direction of the last week-nav step, driving the grid's slide-in motion. */
  slideDirection: "left" | "right" | null;
  isLoading?: boolean;
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
  t: TFunction;
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
  slideDirection,
  isLoading = false,
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
  t,
  tokens,
}: Readonly<CalendarWeekViewProps>) {
  const leftWeekEntering =
    slideDirection === "left"
      ? FadeInLeft.duration(220).reduceMotion(ReduceMotion.System)
      : undefined;
  const weekEntering =
    slideDirection === "right"
      ? FadeInRight.duration(220).reduceMotion(ReduceMotion.System)
      : leftWeekEntering;

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
      <Animated.View
        key={columns[0]?.dateStr ?? "week"}
        entering={weekEntering}
      >
        <CalendarTimeGrid
          columns={columns}
          dayMap={dayMap}
          onSelectDay={onSelectDay}
          displayTime={displayTime}
          language={language}
          allDayLabel={allDayLabel}
          nowLabel={nowLabel}
          isLoading={isLoading}
          t={t}
          tokens={tokens}
        />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  toggleRowEnd: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
});
