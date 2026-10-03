import { useEffect, useMemo, useRef, useState } from "react";
import { InsetFocusPressable } from "@/components/ui/inset-focus-pressable";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { format } from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import type { TFunction } from "i18next";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";
import { calendarEntryOutcome, getAccountDateTime, nowDate } from "@orbit/shared/utils";
import { createTokensV2 } from "@/lib/theme";

import { X } from '@/components/ui/icons';
import { StatusRing } from '@/components/ui/status-ring';
import { CalendarEntryDetails } from './calendar-entry-details';

type Tokens = ReturnType<typeof createTokensV2>;

const HOUR_HEIGHT = 48;
const DAY_HEIGHT = HOUR_HEIGHT * 24;
const BLOCK_HEIGHT = 48;
const BLOCK_MIN_WIDTH = 48;
const BLOCK_HORIZONTAL_INSET = 4;
const BODY_MAX_HEIGHT = 520;
const MIN_LANE_WIDTH = BLOCK_MIN_WIDTH + BLOCK_HORIZONTAL_INSET;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export interface TimeGridColumn {
  date: Date;
  dateStr: string;
  isToday: boolean;
  isFuture: boolean;
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
  timeZone: string | null;
  isLoading?: boolean;
  t: TFunction;
  tokens: Tokens;
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
      laneEnds[lane] = top + BLOCK_HEIGHT + 4;
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
    clusterEnd = Math.max(clusterEnd, top + BLOCK_HEIGHT + 4);
  }
  if (cluster.length > 0) flush();

  return placed;
}

function TimedBlock({
  block,
  colWidth,
  displayTime,
  onSelect,
  isFuture,
  tokens,
  t,
}: Readonly<{
  t: TFunction;
  block: PlacedEntry;
  colWidth: number;
  displayTime: (time: string) => string;
  onSelect: () => void;
  isFuture: boolean;
  tokens: Tokens;
}>) {
  const outcome = calendarEntryOutcome(block.entry);
  return (
    <InsetFocusPressable
      testID="time-grid-event"
      accessibilityRole="button"
      onPress={onSelect}
      accessibilityLabel={t('calendar.entryLabel', { title: block.entry.title, time: displayTime(block.entry.dueTime!), status: t(outcome.labelKey) })}
      style={({ pressed }) => ({
        position: "absolute",
        top: block.top,
        minHeight: BLOCK_HEIGHT,
        left:
          (block.lane / block.laneCount) * colWidth +
          BLOCK_HORIZONTAL_INSET / 2,
        width: colWidth / block.laneCount - BLOCK_HORIZONTAL_INSET,
        minWidth: BLOCK_MIN_WIDTH,
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 8,
        overflow: "hidden",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: pressed
          ? tokens.bgHoverOpaque
          : isFuture
            ? "transparent"
            : tokens.bgWell,
        borderWidth: 1,
        borderColor: isFuture ? tokens.hairlineGhost : tokens.hairline,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      <View importantForAccessibility="no-hide-descendants">
        <StatusRing status={outcome.status} size={24} label={t(outcome.labelKey)} />
        {outcome.status === 'bad' ? <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}><X size={16} color={tokens.statusBad} strokeWidth={1.5} /></View> : null}
      </View>
    </InsetFocusPressable>
  );
}

function AllDaySummary({ count, accessibilityLabel, onPress, tokens }: Readonly<{
  count: number;
  accessibilityLabel: string;
  onPress: () => void;
  tokens: Tokens;
}>) {
  return <InsetFocusPressable testID="time-grid-all-day-summary" accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 48, minWidth: 48, padding: 8, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: tokens.hairline, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? tokens.bgHover : 'transparent' })}>
    <Text style={{ fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16.8, color: tokens.fg1 }}>{count}</Text>
  </InsetFocusPressable>;
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
    <InsetFocusPressable
      testID="time-grid-col-header"
      focusOffset={-6}
      accessibilityRole="button"
      onPress={() => onSelectDay(column.dateStr)}
      style={({ pressed }) => [
        styles.colHeader,
        { width: colWidth },
        pressed && {
          backgroundColor: tokens.bgHover,
          transform: [{ scale: 0.96 }],
        },
      ]}
    >
      <Text
        style={[
          styles.colHeaderWeekday,
          { color: column.isToday ? tokens.primaryText : tokens.fg2 },
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
          testID="time-grid-col-date"
          style={[
            styles.colHeaderDate,
            {
              color: column.isToday
                ? tokens.fgOnPrimary
                : column.isFuture
                  ? tokens.fg2
                  : tokens.fg1,
              fontFamily: "GeistMono_500Medium",
            },
          ]}
        >
          {format(column.date, "d", { locale })}
        </Text>
      </View>
    </InsetFocusPressable>
  );
}

function scrollViewToY(scrollView: ScrollView | null, y: number): void {
  const scrollable: { scrollTo?: ScrollView["scrollTo"] } | null = scrollView;
  scrollable?.scrollTo?.({ y, animated: false });
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
  timeZone,
  isLoading = false,
  t,
  tokens,
}: Readonly<CalendarTimeGridProps>) {
  const { fontScale } = useWindowDimensions();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const headerHeight = Math.max(52, 16 + 4 + 12 * 1.4 * fontScale + 24 * fontScale);
  const allDayBandHeight = Math.max(48, 16 + 2 + 12 * 1.4 * fontScale) + 16 + 1;
  const gutterWidth = Math.max(...HOURS.map((hour) => displayTime(`${String(hour).padStart(2, "0")}:00`).length)) * 12 * 0.7 * fontScale + 16;
  const [disclosure, setDisclosure] = useState<{ entries: CalendarDayEntry[]; title: string } | null>(null);
  const bodyScrollRef = useRef<ScrollView>(null);
  const gutterScrollRef = useRef<ScrollView>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [now, setNow] = useState<Date>(() => nowDate());
  const nowMinutes = getAccountDateTime(now, timeZone).minutes;

  useEffect(() => {
    const interval = setInterval(() => setNow(nowDate()), 60_000);
    return () => clearInterval(interval);
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

  const maxLaneCount = Math.max(
    1,
    ...perColumn.flatMap(({ timed }) =>
      timed.map(({ laneCount }) => laneCount),
    ),
  );
  const minColumnWidth = Math.max(60, maxLaneCount * MIN_LANE_WIDTH, 52 * fontScale);

  const colWidth =
    viewportWidth > 0 && columns.length > 0
      ? Math.max(minColumnWidth, viewportWidth / columns.length)
      : minColumnWidth;

  const isEmpty =
    !isLoading &&
    perColumn.every(
      ({ allDay, timed }) => allDay.length === 0 && timed.length === 0,
    );

  useEffect(() => {
    const offset = 7 * HOUR_HEIGHT;
    scrollViewToY(bodyScrollRef.current, offset);
    scrollViewToY(gutterScrollRef.current, offset);
  }, []);

  const syncGutter = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollViewToY(gutterScrollRef.current, event.nativeEvent.contentOffset.y);
  };

  const onColumnsLayout = (event: LayoutChangeEvent) => {
    setViewportWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={styles.wrap}>
      <Text testID="time-grid-any-time-label" style={styles.anyTimeLabel}>
        {allDayLabel}
      </Text>
      <View testID="calendar-time-grid" style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.gutter, { width: gutterWidth }]}>
            <View style={[styles.gutterCorner, { height: headerHeight }]} />
            <View style={[styles.gutterAllDay, { height: allDayBandHeight }]} />
            <ScrollView
              ref={gutterScrollRef}
              style={{ height: BODY_MAX_HEIGHT }}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View style={{ height: DAY_HEIGHT + BLOCK_HEIGHT }}>
                {HOURS.map((hour) => (
                  <Text
                    key={hour}
                    testID="time-grid-hour-label"
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
              <View style={[styles.headerRow, { minHeight: headerHeight }]}>
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

              <View style={[styles.allDayRow, { minHeight: allDayBandHeight }]}>
                {perColumn.map(({ column, allDay }) => {
                  return (
                    <View
                      key={column.dateStr}
                      testID="time-grid-all-day"
                      style={[
                        styles.allDayCell,
                        {
                          width: colWidth,
                          borderLeftColor: column.isFuture
                            ? tokens.hairlineGhost
                            : tokens.hairline,
                          borderBottomColor: column.isFuture
                            ? tokens.hairlineGhost
                            : tokens.hairline,
                        },
                      ]}
                    >
                      {allDay.length > 0 ? <AllDaySummary
                        count={allDay.length}
                        accessibilityLabel={t('calendar.timeGrid.untimedCount', { count: allDay.length })}
                        onPress={() => setDisclosure({ entries: allDay, title: allDayLabel })}
                        tokens={tokens}
                      /> : null}
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
                <View style={{ flexDirection: "row", height: DAY_HEIGHT + BLOCK_HEIGHT }}>
                  {perColumn.map(({ column, timed }) => (
                    <View
                      key={column.dateStr}
                      testID="time-grid-day-column"
                      style={[
                        styles.dayColumn,
                        {
                          width: colWidth,
                          borderLeftColor: column.isFuture
                            ? tokens.hairlineGhost
                            : tokens.hairline,
                        },
                      ]}
                    >
                      {HOURS.map((hour) => (
                        <View
                          key={hour}
                          style={[
                            styles.hourLine,
                            {
                              top: hour * HOUR_HEIGHT,
                              backgroundColor: column.isFuture
                                ? tokens.hairlineGhost
                                : tokens.hairline,
                            },
                          ]}
                        />
                      ))}
                      {timed.map((block) => (
                        <TimedBlock
                          key={block.entry.habitId}
                          block={block}
                          colWidth={colWidth}
                          displayTime={displayTime}
                          onSelect={() => setDisclosure({ entries: [block.entry], title: t('calendar.entryDetails') })}
                          t={t}
                          isFuture={column.isFuture}
                          tokens={tokens}
                        />
                      ))}
                      {column.isToday ? (
                        <View
                          accessible
                          accessibilityRole="image"
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

        {isEmpty ? (
          <View pointerEvents="none" testID="time-grid-empty" style={styles.emptyOverlay}>
            <Text style={styles.emptyText}>{t("calendar.timeGrid.empty")}</Text>
          </View>
        ) : null}
      </View>
      {disclosure ? <CalendarEntryDetails entries={disclosure.entries} title={disclosure.title} displayTime={displayTime} onClose={() => setDisclosure(null)} /> : null}
    </View>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    wrap: {
      gap: 4,
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 16,
    },
    anyTimeLabel: {
      fontFamily: "Geist_400Regular",
      fontSize: 12,
      color: tokens.fg2,
    },
    card: {
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: tokens.bgCard,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    row: {
      flexDirection: "row",
    },
    gutter: {
    },
    gutterCorner: {
      borderBottomWidth: 1,
      borderBottomColor: tokens.hairline,
    },
    gutterAllDay: {
      borderBottomWidth: 1,
      borderBottomColor: tokens.hairline,
    },
    hourLabel: {
      position: "absolute",
      right: 8,
      fontFamily: "GeistMono_400Regular",
      fontSize: 12,
      lineHeight: 16.8,
      color: tokens.fg2,
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
      gap: 4,
      paddingVertical: 8,
      borderLeftWidth: 1,
      borderLeftColor: tokens.hairline,
      borderBottomWidth: 1,
      borderBottomColor: tokens.hairline,
    },
    colHeaderWeekday: {
      fontFamily: "GeistMono_500Medium",
      fontSize: 12,
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    colHeaderDatePill: {
      minWidth: 24,
      minHeight: 24,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    colHeaderDate: {
      fontSize: 12,
      fontVariant: ["tabular-nums"],
    },
    allDayRow: {
      flexDirection: "row",
    },
    allDayCell: {
      justifyContent: "center",
      paddingVertical: 8,
      paddingHorizontal: 4,
      borderLeftWidth: 1,
      borderLeftColor: tokens.hairline,
      borderBottomWidth: 1,
      borderBottomColor: tokens.hairline,
    },
    dayColumn: {
      position: "relative",
      height: DAY_HEIGHT + BLOCK_HEIGHT,
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
      marginLeft: -4,
      backgroundColor: tokens.primary,
    },
    nowBar: {
      flex: 1,
      height: 1.5,
      backgroundColor: tokens.primary,
    },
    emptyOverlay: {
      ...StyleSheet.absoluteFill,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    emptyText: {
      fontFamily: "Geist_400Regular",
      fontSize: 14,
      color: tokens.fg2,
    },
  });
}
