import Animated, {
  FadeInLeft,
  FadeInRight,
  ReduceMotion,
} from "react-native-reanimated";
import type { TFunction } from "i18next";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";
import { createTokensV2 } from "@/lib/theme";
import { CalendarTimeGrid, type TimeGridColumn } from "./calendar-time-grid";

type Tokens = ReturnType<typeof createTokensV2>;

interface CalendarWeekViewProps {
  columns: readonly TimeGridColumn[];
  dayMap: Map<string, CalendarDayEntry[]>;
  /** Direction of the last week-nav step, driving the grid's slide-in motion. */
  slideDirection: "left" | "right" | null;
  isLoading?: boolean;
  onSelectDay: (dateStr: string) => void;
  displayTime: (time: string) => string;
  language: string;
  allDayLabel: string;
  nowLabel: string;
  timeZone: string | null;
  t: TFunction;
  tokens: Tokens;
}

/** Week view: a seven-day time grid with week-granularity navigation. */
export function CalendarWeekView({
  columns,
  dayMap,
  slideDirection,
  isLoading = false,
  onSelectDay,
  displayTime,
  language,
  allDayLabel,
  nowLabel,
  timeZone,
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
        timeZone={timeZone}
        isLoading={isLoading}
        t={t}
        tokens={tokens}
      />
    </Animated.View>
  );
}
