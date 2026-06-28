import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { format } from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";
import { createTokensV2 } from "@/lib/theme";

type Tokens = ReturnType<typeof createTokensV2>;

const HOUR_HEIGHT = 48;
const DAY_HEIGHT = HOUR_HEIGHT * 24;
const BLOCK_HEIGHT = 38;
const GUTTER = 56;
const BODY_MAX_HEIGHT = 520;
const MIN_COL_WIDTH = 80;
const COL_HEADER_HEIGHT = 52;
const ALL_DAY_MIN_HEIGHT = 34;
const ALL_DAY_CHIP_HEIGHT = 22;
const ALL_DAY_GAP = 3;
const ALL_DAY_PADDING = 12;
const ALL_DAY_MAX_VISIBLE = 5;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** Caps the all-day stack so a heavy day cannot push the timed grid off-screen:
 *  the first chips show, the rest collapse into a single tappable "+N". */
function splitAllDay(allDay: CalendarDayEntry[]): {
  visible: CalendarDayEntry[];
  overflow: number;
} {
  if (allDay.length <= ALL_DAY_MAX_VISIBLE) return { visible: allDay, overflow: 0 };
  return {
    visible: allDay.slice(0, ALL_DAY_MAX_VISIBLE - 1),
    overflow: allDay.length - (ALL_DAY_MAX_VISIBLE - 1),
  };
}

export interface TimeGridColumn {
  date: Date;
  dateStr: string;
  isToday: boolean;
}

interface PlacedEntry {
  entry: CalendarDayEntry;
  hour: number;
  top: number;
  lane: number;
  laneCount: number;
}

interface CalendarTimeGridProps {
  columns: readonly TimeGridColumn[];
  dayMap: Map<string, CalendarDayEntry[]>;
  onSelectDay: (dateStr: string) => void;
  displayTime: (time: string) => string;
  language: string;
  allDayLabel: string;
  nowLabel: string;
  tokens: Tokens;
}

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const match = /rgba?\(([^)]+)\)/.exec(color);
  if (match) {
    const parts = match[1]!.split(",").map((value) => value.trim());
    const existing = parts[3] !== undefined ? Number(parts[3]) : 1;
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${existing * alpha})`;
  }
  return color;
}

function parseMinutes(time: string | null): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return Math.min(hours * 60 + minutes, 24 * 60 - 1);
}

function entryAccent(entry: CalendarDayEntry, tokens: Tokens): string {
  if (entry.status === "completed") {
    return entry.isBadHabit ? tokens.statusBad : tokens.statusDone;
  }
  if (entry.status === "missed") {
    return entry.isBadHabit ? tokens.statusDone : tokens.statusOverdue;
  }
  return tokens.fg4;
}

/** Lays out timed entries into non-overlapping lanes so concurrent blocks sit
 *  side by side instead of stacking on top of each other. */
function layoutTimed(entries: CalendarDayEntry[]): PlacedEntry[] {
  const timed = entries
    .map((entry) => ({ entry, minutes: parseMinutes(entry.dueTime) }))
    .filter(
      (item): item is { entry: CalendarDayEntry; minutes: number } =>
        item.minutes !== null,
    )
    .sort((a, b) => a.minutes - b.minutes);

  const placed: PlacedEntry[] = [];
  let cluster: { entry: CalendarDayEntry; minutes: number }[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const laneEnds: number[] = [];
    const local: PlacedEntry[] = [];
    for (const item of cluster) {
      const top = (item.minutes / 60) * HOUR_HEIGHT;
      let lane = laneEnds.findIndex((end) => end <= top);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = top + BLOCK_HEIGHT;
      local.push({
        entry: item.entry,
        hour: Math.floor(item.minutes / 60),
        top,
        lane,
        laneCount: 0,
      });
    }
    for (const block of local) {
      block.laneCount = laneEnds.length;
      placed.push(block);
    }
  };

  for (const item of timed) {
    const top = (item.minutes / 60) * HOUR_HEIGHT;
    if (cluster.length > 0 && top >= clusterEnd) {
      flush();
      cluster = [];
      clusterEnd = -Infinity;
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, top + BLOCK_HEIGHT);
  }
  if (cluster.length > 0) flush();

  return placed;
}

function TimedBlock({
  block,
  colWidth,
  displayTime,
  tokens,
}: Readonly<{
  block: PlacedEntry;
  colWidth: number;
  displayTime: (time: string) => string;
  tokens: Tokens;
}>) {
  const accent = entryAccent(block.entry, tokens);
  const completed = block.entry.status === "completed";
  return (
    <View
      testID="time-grid-event"
      style={{
        position: "absolute",
        top: block.top,
        height: BLOCK_HEIGHT,
        left: (block.lane / block.laneCount) * colWidth + 2,
        width: colWidth / block.laneCount - 4,
        paddingVertical: 4,
        paddingHorizontal: 6,
        borderRadius: 8,
        overflow: "hidden",
        justifyContent: "center",
        backgroundColor: withAlpha(accent, 0.16),
        borderWidth: 1,
        borderColor: withAlpha(accent, 0.3),
        borderLeftWidth: 3,
        borderLeftColor: accent,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontFamily: "Rubik_500Medium",
          fontSize: 11,
          lineHeight: 13,
          color: completed ? tokens.fg3 : tokens.fg1,
          textDecorationLine: completed ? "line-through" : "none",
        }}
      >
        {block.entry.title}
      </Text>
      {block.entry.dueTime ? (
        <Text
          numberOfLines={1}
          style={{
            fontFamily: "Roboto_400Regular",
            fontSize: 10,
            color: tokens.fg3,
            fontVariant: ["tabular-nums"],
          }}
        >
          {displayTime(block.entry.dueTime)}
        </Text>
      ) : null}
    </View>
  );
}

function AllDayChip({
  entry,
  tokens,
}: Readonly<{ entry: CalendarDayEntry; tokens: Tokens }>) {
  const accent = entryAccent(entry, tokens);
  const completed = entry.status === "completed";
  return (
    <View
      testID="time-grid-all-day-event"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        height: ALL_DAY_CHIP_HEIGHT - ALL_DAY_GAP,
        paddingHorizontal: 6,
        borderRadius: 6,
        overflow: "hidden",
        backgroundColor: withAlpha(accent, 0.14),
        borderWidth: 1,
        borderColor: withAlpha(accent, 0.28),
      }}
    >
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 999,
          backgroundColor: accent,
        }}
      />
      <Text
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontFamily: "Rubik_500Medium",
          fontSize: 11,
          color: completed ? tokens.fg3 : tokens.fg1,
          textDecorationLine: completed ? "line-through" : "none",
        }}
      >
        {entry.title}
      </Text>
    </View>
  );
}

function AllDayMoreChip({
  count,
  onPress,
  tokens,
}: Readonly<{ count: number; onPress: () => void; tokens: Tokens }>) {
  return (
    <Pressable
      testID="time-grid-all-day-more"
      accessibilityRole="button"
      accessibilityLabel={`+${count}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        height: ALL_DAY_CHIP_HEIGHT - ALL_DAY_GAP,
        paddingHorizontal: 6,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: tokens.hairline,
        backgroundColor: pressed ? tokens.bgElev : "transparent",
      })}
    >
      <Text
        style={{
          fontFamily: "Roboto_500Medium",
          fontSize: 11,
          color: tokens.fg3,
          fontVariant: ["tabular-nums"],
        }}
      >
        +{count}
      </Text>
    </Pressable>
  );
}

function ColumnHeader({
  column,
  colWidth,
  language,
  onSelectDay,
  tokens,
  styles,
}: Readonly<{
  column: TimeGridColumn;
  colWidth: number;
  language: string;
  onSelectDay: (dateStr: string) => void;
  tokens: Tokens;
  styles: ReturnType<typeof createStyles>;
}>) {
  const locale = language === "pt-BR" ? ptBR : enUS;
  return (
    <Pressable
      testID="time-grid-col-header"
      accessibilityRole="button"
      onPress={() => onSelectDay(column.dateStr)}
      style={({ pressed }) => [
        styles.colHeader,
        { width: colWidth },
        pressed && { backgroundColor: tokens.bgElev },
      ]}
    >
      <Text
        style={[
          styles.colHeaderWeekday,
          { color: column.isToday ? tokens.primary : tokens.fg3 },
        ]}
      >
        {format(column.date, "EEE", { locale }).toUpperCase()}
      </Text>
      <View
        style={[
          styles.colHeaderDatePill,
          column.isToday && { backgroundColor: tokens.primary },
        ]}
      >
        <Text
          style={[
            styles.colHeaderDate,
            {
              color: column.isToday ? tokens.fgOnPrimary : tokens.fg1,
              fontFamily: column.isToday ? "Roboto_700Bold" : "Roboto_500Medium",
            },
          ]}
        >
          {format(column.date, "d", { locale })}
        </Text>
      </View>
    </Pressable>
  );
}

/** Google-Calendar-style time grid: a day column per entry in `columns`, an
 *  untimed all-day band on top, and timed habits placed by dueTime. Day columns
 *  keep a readable minimum width and scroll horizontally (the left time gutter
 *  stays pinned) so labels never compress. Shared by the week view (7 columns)
 *  and the interval view (N columns). */
export function CalendarTimeGrid({
  columns,
  dayMap,
  onSelectDay,
  displayTime,
  language,
  allDayLabel,
  nowLabel,
  tokens,
}: Readonly<CalendarTimeGridProps>) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const bodyScrollRef = useRef<ScrollView>(null);
  const gutterScrollRef = useRef<ScrollView>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  const nowMinutes = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, []);

  const perColumn = useMemo(
    () =>
      columns.map((column) => {
        const entries = dayMap.get(column.dateStr) ?? [];
        return {
          column,
          allDay: entries.filter((entry) => !entry.dueTime),
          timed: layoutTimed(entries),
        };
      }),
    [columns, dayMap],
  );

  const allDayBandHeight = useMemo(() => {
    const maxChips = perColumn.reduce(
      (max, item) => Math.max(max, item.allDay.length),
      0,
    );
    if (maxChips === 0) return ALL_DAY_MIN_HEIGHT;
    const rows = Math.min(maxChips, ALL_DAY_MAX_VISIBLE);
    return Math.max(
      ALL_DAY_MIN_HEIGHT,
      ALL_DAY_PADDING + rows * ALL_DAY_CHIP_HEIGHT,
    );
  }, [perColumn]);

  const colWidth =
    viewportWidth > 0 && columns.length > 0
      ? Math.max(MIN_COL_WIDTH, viewportWidth / columns.length)
      : MIN_COL_WIDTH;

  useEffect(() => {
    const offset = 7 * HOUR_HEIGHT;
    bodyScrollRef.current?.scrollTo?.({ y: offset, animated: false });
    gutterScrollRef.current?.scrollTo?.({ y: offset, animated: false });
  }, []);

  const syncGutter = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    gutterScrollRef.current?.scrollTo?.({
      y: event.nativeEvent.contentOffset.y,
      animated: false,
    });
  };

  const onColumnsLayout = (event: LayoutChangeEvent) => {
    setViewportWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={styles.wrap}>
      <View testID="calendar-time-grid" style={styles.card}>
        <View style={styles.row}>
          <View style={styles.gutter}>
            <View style={styles.gutterCorner} />
            <View style={[styles.gutterAllDay, { height: allDayBandHeight }]}>
              <Text style={styles.allDayLabel}>{allDayLabel}</Text>
            </View>
            <ScrollView
              ref={gutterScrollRef}
              style={{ height: BODY_MAX_HEIGHT }}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
            >
              <View style={{ height: DAY_HEIGHT }}>
                {HOURS.map((hour) => (
                  <Text
                    key={hour}
                    style={[styles.hourLabel, { top: hour * HOUR_HEIGHT + 2 }]}
                  >
                    {displayTime(`${String(hour).padStart(2, "0")}:00`)}
                  </Text>
                ))}
              </View>
            </ScrollView>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            style={styles.columnsScroll}
            onLayout={onColumnsLayout}
          >
            <View style={styles.columnsContent}>
              <View style={[styles.headerRow, { height: COL_HEADER_HEIGHT }]}>
                {columns.map((column) => (
                  <ColumnHeader
                    key={column.dateStr}
                    column={column}
                    colWidth={colWidth}
                    language={language}
                    onSelectDay={onSelectDay}
                    tokens={tokens}
                    styles={styles}
                  />
                ))}
              </View>

              <View style={[styles.allDayRow, { height: allDayBandHeight }]}>
                {perColumn.map(({ column, allDay }) => {
                  const { visible, overflow } = splitAllDay(allDay);
                  return (
                    <View
                      key={column.dateStr}
                      testID="time-grid-all-day"
                      style={[styles.allDayCell, { width: colWidth }]}
                    >
                      {visible.map((entry) => (
                        <AllDayChip
                          key={entry.habitId}
                          entry={entry}
                          tokens={tokens}
                        />
                      ))}
                      {overflow > 0 ? (
                        <AllDayMoreChip
                          count={overflow}
                          onPress={() => onSelectDay(column.dateStr)}
                          tokens={tokens}
                        />
                      ) : null}
                    </View>
                  );
                })}
              </View>

              <ScrollView
                ref={bodyScrollRef}
                style={{ height: BODY_MAX_HEIGHT }}
                nestedScrollEnabled
                onScroll={syncGutter}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator
              >
                <View style={{ flexDirection: "row", height: DAY_HEIGHT }}>
                  {perColumn.map(({ column, timed }) => (
                    <View
                      key={column.dateStr}
                      style={[styles.dayColumn, { width: colWidth }]}
                    >
                      {HOURS.map((hour) => (
                        <View
                          key={hour}
                          style={[styles.hourLine, { top: hour * HOUR_HEIGHT }]}
                        />
                      ))}
                      {timed.map((block) => (
                        <TimedBlock
                          key={block.entry.habitId}
                          block={block}
                          colWidth={colWidth}
                          displayTime={displayTime}
                          tokens={tokens}
                        />
                      ))}
                      {column.isToday ? (
                        <View
                          pointerEvents="none"
                          accessibilityLabel={nowLabel}
                          style={[
                            styles.nowLine,
                            { top: (nowMinutes / 60) * HOUR_HEIGHT },
                          ]}
                        >
                          <View style={styles.nowDot} />
                          <View style={styles.nowBar} />
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 16,
    },
    card: {
      borderRadius: 18,
      overflow: "hidden",
      backgroundColor: tokens.bgCard,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    row: {
      flexDirection: "row",
    },
    gutter: {
      width: GUTTER,
    },
    gutterCorner: {
      height: COL_HEADER_HEIGHT,
      borderBottomWidth: 1,
      borderBottomColor: tokens.hairline,
    },
    gutterAllDay: {
      alignItems: "flex-end",
      paddingTop: 6,
      paddingRight: 6,
      borderBottomWidth: 1,
      borderBottomColor: tokens.hairline,
    },
    allDayLabel: {
      fontFamily: "Roboto_500Medium",
      fontSize: 9,
      letterSpacing: 0.36,
      textTransform: "uppercase",
      color: tokens.fg4,
    },
    hourLabel: {
      position: "absolute",
      right: 8,
      fontFamily: "Roboto_400Regular",
      fontSize: 10,
      color: tokens.fg4,
      fontVariant: ["tabular-nums"],
    },
    columnsScroll: {
      flex: 1,
    },
    columnsContent: {
      flexDirection: "column",
    },
    headerRow: {
      flexDirection: "row",
    },
    colHeader: {
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      paddingVertical: 8,
      borderLeftWidth: 1,
      borderLeftColor: tokens.hairline,
      borderBottomWidth: 1,
      borderBottomColor: tokens.hairline,
    },
    colHeaderWeekday: {
      fontFamily: "Roboto_500Medium",
      fontSize: 10,
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    colHeaderDatePill: {
      width: 24,
      height: 24,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    colHeaderDate: {
      fontSize: 13,
      fontVariant: ["tabular-nums"],
    },
    allDayRow: {
      flexDirection: "row",
    },
    allDayCell: {
      gap: ALL_DAY_GAP,
      paddingVertical: 6,
      paddingHorizontal: 3,
      borderLeftWidth: 1,
      borderLeftColor: tokens.hairline,
      borderBottomWidth: 1,
      borderBottomColor: tokens.hairline,
    },
    dayColumn: {
      position: "relative",
      height: DAY_HEIGHT,
      borderLeftWidth: 1,
      borderLeftColor: tokens.hairline,
    },
    hourLine: {
      position: "absolute",
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: tokens.hairline,
    },
    nowLine: {
      position: "absolute",
      left: 0,
      right: 0,
      flexDirection: "row",
      alignItems: "center",
    },
    nowDot: {
      width: 7,
      height: 7,
      borderRadius: 999,
      marginLeft: -3,
      backgroundColor: tokens.primary,
    },
    nowBar: {
      flex: 1,
      height: 1.5,
      backgroundColor: tokens.primary,
    },
  });
}
