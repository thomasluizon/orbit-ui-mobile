import type { TFunction } from "i18next";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";
import { createTokensV2 } from "@/lib/theme";
import { CalendarSlide } from "./calendar-slide";
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
  return (
    <CalendarSlide
      direction={slideDirection}
      stepKey={columns[0]?.dateStr ?? "week"}
      style={{ flex: 1, minHeight: 0 }}
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
    </CalendarSlide>
  );
}
