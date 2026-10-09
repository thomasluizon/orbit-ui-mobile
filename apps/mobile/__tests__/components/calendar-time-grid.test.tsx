import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { StyleSheet } from "react-native";
import * as ReactNative from "react-native";
import { __setScrollToImpl } from "../../test-mocks/react-native";
import { CalendarEntryDetails } from "@/app/(tabs)/calendar/_components/calendar-entry-details";
import { sheetTestControls } from "@/__tests__/support/sheet-double";
import type { TFunction } from "i18next";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";

import { contrastOnSurface } from '@orbit/shared/__tests__/contrast';
import { createTokensV2, setRuntimeTheme, getRuntimeTheme, createSurfaces, radius, shadows } from "@/lib/theme";
import {
  CalendarTimeGrid,
  type TimeGridColumn,
} from "@/app/(tabs)/calendar/_components/calendar-time-grid";

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => {
  const { scheme, themeMode } = getRuntimeTheme();
  return { currentScheme: scheme, currentTheme: themeMode, surfaces: createSurfaces(scheme, themeMode), radius, shadows, applyTheme: vi.fn(), toggleTheme: vi.fn() };
} }));

const TestRenderer = require("react-test-renderer");

type TestNode = {
  type: unknown;
  props: Record<string, any>;
  parent?: TestNode | null;
};
type Tree = {
  update: (element: React.ReactNode) => void;
  root: { findAll: (predicate: (node: TestNode) => boolean) => TestNode[] };
};

function makeEntry(overrides: Partial<CalendarDayEntry> = {}): CalendarDayEntry {
  return {
    habitId: "1",
    title: "Meditate",
    status: "upcoming",
    isBadHabit: false,
    dueTime: null,
    isOneTime: false,
    ...overrides,
  };
}

function column(dateStr: string, isFuture = false): TimeGridColumn {
  return {
    date: new Date(`${dateStr}T00:00:00`),
    dateStr,
    isToday: false,
    isFuture,
  };
}

const mounted: Tree[] = [];
afterEach(() => { TestRenderer.act(() => { for (const tree of mounted) tree.update(<></>); }); mounted.length = 0; setRuntimeTheme({ themeMode: 'dark' }); vi.restoreAllMocks(); sheetTestControls.defer(false); });

const displayTime = (time: string) => time;
const tokens = createTokensV2("purple", "dark");
const translate = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as unknown as TFunction;

function renderGrid(
  columns: TimeGridColumn[],
  dayMap: Map<string, CalendarDayEntry[]>,
  onSelectDay = vi.fn(),
  isLoading = false,
  formatTime = displayTime,
  timeZone: string | null = "UTC",
  gridTokens = tokens,
): Tree {
  let tree: Tree;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <CalendarTimeGrid
        columns={columns}
        dayMap={dayMap}
        onSelectDay={onSelectDay}
        displayTime={formatTime}
        language="en"
        allDayLabel="No set time"
        nowLabel="Now"
        isLoading={isLoading}
        t={translate}
        tokens={gridTokens}
        timeZone={timeZone}
      />,
    );
  });
  mounted.push(tree!);
  return tree!;
}

function hostsByTestID(tree: Tree, testID: string): TestNode[] {
  return tree.root.findAll(
    (node) => typeof node.type === "string" && node.props.testID === testID,
  );
}

function textValuesWithin(tree: Tree, testID: string): unknown[] {
  return hostsByTestID(tree, testID).flatMap((node) =>
    collectText(node as unknown as { props: { children?: unknown } }),
  );
}

function collectText(node: { props?: { children?: unknown } }): unknown[] {
  const children = node.props?.children;
  if (children == null) return [];
  const list = Array.isArray(children) ? children : [children];
  return list.flatMap((child) => {
    if (typeof child === "string" || typeof child === "number") return [child];
    if (Array.isArray(child)) return collectText({ props: { children: child } });
    if (child && typeof child === "object" && "props" in child) {
      return collectText(child as { props: { children?: unknown } });
    }
    return [];
  });
}

function resolveStyle(style: unknown): Record<string, unknown> {
  const value = typeof style === "function" ? style({ pressed: false }) : style;
  return (StyleSheet.flatten(value) ?? {}) as Record<string, unknown>;
}

function renderedAncestorHeight(node: TestNode): number | undefined {
  let ancestor = node.parent;
  while (ancestor) {
    const style = resolveStyle(ancestor.props.style);
    const height = style.minHeight ?? style.height;
    if (typeof height === "number") return height;
    ancestor = ancestor.parent;
  }
  return undefined;
}

describe("CalendarTimeGrid (mobile)", () => {
  it.each(['light', 'dark'] as const)('keeps timed metadata readable on %s press', (mode) => {
    setRuntimeTheme({ themeMode: mode });
    const palette = createTokensV2('purple', mode);
    const col = column('2025-06-16');
    const tree = renderGrid([col], new Map([[col.dateStr, [makeEntry({ dueTime: '08:00' })]]]), vi.fn(), false, displayTime, 'UTC', palette);
    const block = hostsByTestID(tree, 'time-grid-event')[0]!;
    const time = () => tree.root.findAll((node) => {
      if (node.type !== 'Text' || node.props.children !== '08:00') return false;
      for (let parent = node.parent; parent; parent = parent.parent) if (parent === block) return true;
      return false;
    })[0]!;
    expect(resolveStyle(time().props.style).color).toBe(palette.fg3);
    TestRenderer.act(() => block.props.onPressIn());
    const fill = StyleSheet.flatten(block.props.style({ pressed: true })).backgroundColor;
    expect(contrastOnSurface(String(resolveStyle(time().props.style).color), [palette.bg, palette.bgCard, fill])).toBeGreaterThanOrEqual(4.5);
    TestRenderer.act(() => block.props.onPressOut());
    expect(resolveStyle(time().props.style).color).toBe(palette.fg3);
  });

  it.each(['light', 'dark'] as const)('keeps the today weekday readable on %s press', (mode) => {
    setRuntimeTheme({ themeMode: mode });
    const palette = createTokensV2('purple', mode);
    const col = { ...column('2025-06-16'), isToday: true };
    const tree = renderGrid([col], new Map(), vi.fn(), false, displayTime, 'UTC', palette);
    const header = hostsByTestID(tree, 'time-grid-col-header')[0]!;
    const weekday = tree.root.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && resolveStyle(node.props.style).color === palette.fg2)[0]!;
    expect(resolveStyle(weekday.props.style).color).toBe(palette.fg2);
    TestRenderer.act(() => header.props.onPressIn?.());
    const fill = StyleSheet.flatten(header.props.style({ pressed: true })).backgroundColor;
    const color = String(resolveStyle(weekday.props.style).color);
    expect(fill).toBe(palette.bgHover);
    if (mode === 'light') expect(contrastOnSurface(color, [palette.bg, palette.bgCard, fill])).toBeGreaterThanOrEqual(4.5);
    else expect(color).toBe(palette.fg2);
    TestRenderer.act(() => header.props.onPressOut?.());
    expect(resolveStyle(weekday.props.style).color).toBe(palette.fg2);
  });

  it("grows the grid labels and padded column widths at 200% font scale", () => {
    vi.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({ width: 320, height: 915, scale: 1, fontScale: 2 });
    const col = column("2025-06-16");
    const tree = renderGrid([col], new Map([[col.dateStr, [makeEntry({ dueTime: '08:00' }), makeEntry({ habitId: 'untimed' })]]]), vi.fn(), false, (time) => `${time} AM`);
    expect(resolveStyle(hostsByTestID(tree, 'time-grid-col-header')[0]!.props.style).width).toBeGreaterThanOrEqual(104);
    expect(renderedAncestorHeight(hostsByTestID(tree, 'time-grid-col-header')[0]!)).toBeGreaterThanOrEqual(100);
    for (const label of hostsByTestID(tree, 'time-grid-hour-label')) expect(resolveStyle(label.props.style).fontSize).toBeGreaterThanOrEqual(12);
    const summaryStyle = resolveStyle(hostsByTestID(tree, 'time-grid-all-day-event')[0]!.props.style);
    const count = tree.root.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && node.props.children === 'Meditate')[0]!;
    const cell = hostsByTestID(tree, 'time-grid-all-day')[0]!;
    const cellStyle = resolveStyle(cell.props.style);
    const textHeight = Number(resolveStyle(count.props.style).lineHeight) * 2;
    const summaryHeight = Math.max(Number(summaryStyle.minHeight), textHeight + 20);
    const requiredBandHeight = summaryHeight + Number(cellStyle.paddingVertical) * 2 + Number(cellStyle.borderBottomWidth);
    expect(renderedAncestorHeight(cell)).toBeGreaterThanOrEqual(requiredBandHeight);
  });

  it("places a timed habit as a block in its column", () => {
    const col = column("2025-06-16");
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [col.dateStr, [makeEntry({ habitId: "a", title: "Standup", dueTime: "08:00" })]],
    ]);
    const tree = renderGrid([col], dayMap);

    expect(hostsByTestID(tree, "time-grid-event")).toHaveLength(1);
    expect(resolveStyle(hostsByTestID(tree, "time-grid-event")[0]!.props.style)).toMatchObject({
      top: 384,
      width: 92,
      minHeight: 48,
    });
    expect(textValuesWithin(tree, "time-grid-event")).toContain("Standup");
    expect(hostsByTestID(tree, "time-grid-event")[0]!.props.accessibilityLabel).toContain("Standup");
  });

  it("places an untimed habit in the all-day band, not the time body", () => {
    const col = column("2025-06-16");
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [col.dateStr, [makeEntry({ habitId: "b", title: "Read", dueTime: null })]],
    ]);
    const tree = renderGrid([col], dayMap);

    expect(hostsByTestID(tree, "time-grid-event")).toHaveLength(0);
    expect(hostsByTestID(tree, "time-grid-all-day-event")).toHaveLength(1);
    expect(textValuesWithin(tree, "time-grid-all-day-event")).toContain("Read");
    expect(textValuesWithin(tree, "time-grid-any-time-label")).toContain("No set time");
  });

  it("keeps every concurrent timed-event lane at least 48px wide", () => {
    const col = column("2025-06-16");
    const dayMap = new Map<string, CalendarDayEntry[]>([[
      col.dateStr,
      [
        makeEntry({ habitId: "a", dueTime: "08:00" }),
        makeEntry({ habitId: "b", dueTime: "08:00" }),
      ],
    ]]);
    const tree = renderGrid([col], dayMap);

    const widths = hostsByTestID(tree, "time-grid-event").map(
      (event) => resolveStyle(event.props.style).width,
    );
    expect(widths).toEqual([92, 92]);
  });

  it("dims every future day column without lowering text contrast", () => {
    const tree = renderGrid([column("2025-06-18", true)], new Map());

    expect(resolveStyle(hostsByTestID(tree, "time-grid-col-date")[0]!.props.style)).toMatchObject({
      color: tokens.fg2,
    });
    expect(resolveStyle(hostsByTestID(tree, "time-grid-all-day")[0]!.props.style)).toMatchObject({
      borderLeftColor: tokens.hairlineGhost,
    });
    expect(resolveStyle(hostsByTestID(tree, "time-grid-day-column")[0]!.props.style)).toMatchObject({
      borderLeftColor: tokens.hairlineGhost,
    });
  });

  it("renders hour marks through both 24-hour and 12-hour formatters", () => {
    const col = column("2025-06-16");
    const view24 = renderGrid([col], new Map(), vi.fn(), false, (time) => time);
    expect(textValuesWithin(view24, "time-grid-hour-label")).toContain("20:00");

    const view12 = renderGrid([col], new Map(), vi.fn(), false, (time) => {
      const hour = Number(time.slice(0, 2));
      return `${hour % 12 || 12}:00 ${hour >= 12 ? "PM" : "AM"}`;
    });
    expect(textValuesWithin(view12, "time-grid-hour-label")).toContain("8:00 PM");
  });

  it("positions the now line by the account timezone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T10:30:00.000Z"));
    const today = { ...column("2026-09-12"), isToday: true };
    try {
      const tree = renderGrid(
        [today],
        new Map(),
        vi.fn(),
        false,
        displayTime,
        "Pacific/Kiritimati",
      );
      const nowLine = tree.root.findAll(
        (node) =>
          typeof node.type === "string" &&
          node.props.accessibilityLabel === "Now",
      )[0];

      expect(resolveStyle(nowLine!.props.style)).toMatchObject({ top: 24 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders one column header per day in the range", () => {
    const columns = ["2025-06-16", "2025-06-17", "2025-06-18", "2025-06-19"].map(
      (dateStr) => column(dateStr),
    );
    const tree = renderGrid(columns, new Map());

    expect(hostsByTestID(tree, "time-grid-col-header")).toHaveLength(4);
  });

  it("shows one named chip and opens the day for two remaining habits", () => {
    const onSelectDay = vi.fn();
    const col = column("2025-06-16");
    const entries = Array.from({ length: 3 }, (_, index) => makeEntry({ habitId: String(index), title: `All ${index}` }));
    const tree = renderGrid([col], new Map([[col.dateStr, entries]]), onSelectDay);
    expect(textValuesWithin(tree, "time-grid-all-day-event")).toContain("All 0");
    const more = hostsByTestID(tree, "time-grid-all-day-more")[0]!;
    expect(more.props.accessibilityLabel).toBe('calendar.timeGrid.moreCountLabel:{"count":2}');
    expect(resolveStyle(more.props.style)).toMatchObject({ minHeight: 48, minWidth: 48 });
    TestRenderer.act(() => more.props.onPress());
    expect(onSelectDay).toHaveBeenCalledWith(col.dateStr);
    TestRenderer.act(() => hostsByTestID(tree, "time-grid-all-day-event")[0]!.props.onPress());
    expect(tree.root.findAll((node) => node.type === CalendarEntryDetails)[0]!.props.entries[0].title).toBe("All 0");
  });

  it.each([false, true])("opens loaded concurrent lanes once and respects prior dragging (dragged=%s)", (dragged) => {
    const scrollTo = vi.fn();
    __setScrollToImpl(scrollTo);
    try {
      const columns = Array.from({ length: 7 }, (_, index) => ({ ...column(`2026-10-${String(5 + index).padStart(2, '0')}`), isToday: index === 3 }));
      const tree = renderGrid(columns, new Map(), vi.fn(), true);
      const horizontal = () => tree.root.findAll((node) => node.type === 'ScrollView' && node.props.horizontal)[0]!;
      TestRenderer.act(() => {
        horizontal().props.onLayout({ nativeEvent: { layout: { width: 284, height: 400 } } });
        horizontal().props.onContentSizeChange(672, 400);
      });
      expect(scrollTo.mock.calls.filter(([offset]) => 'x' in offset)).toHaveLength(0);
      const crowded = new Map([[columns[3]!.dateStr, [makeEntry({ habitId: 'first', dueTime: '08:00' }), makeEntry({ habitId: 'second', dueTime: '08:00' })]]]);
      const update = (dayMap: Map<string, CalendarDayEntry[]>) => TestRenderer.act(() => tree.update(
        <CalendarTimeGrid columns={columns} dayMap={dayMap} onSelectDay={vi.fn()} displayTime={displayTime} language="en" allDayLabel="No set time" nowLabel="Now" isLoading={false} t={translate} tokens={tokens} timeZone="UTC" />,
      ));
      if (dragged) TestRenderer.act(() => horizontal().props.onScrollBeginDrag());
      update(crowded);
      expect(scrollTo.mock.calls.filter(([offset]) => 'x' in offset)).toHaveLength(0);
      TestRenderer.act(() => horizontal().props.onContentSizeChange(1344, 400));
      expect(scrollTo.mock.calls.filter(([offset]) => 'x' in offset)).toEqual(dragged ? [] : [[{ x: 530, animated: false }]]);
      TestRenderer.act(() => horizontal().props.onScrollBeginDrag());
      update(new Map([[columns[3]!.dateStr, [...crowded.get(columns[3]!.dateStr)!, makeEntry({ habitId: 'third', dueTime: '08:00' })]]]));
      TestRenderer.act(() => horizontal().props.onLayout({ nativeEvent: { layout: { width: 300, height: 400 } } }));
      expect(scrollTo.mock.calls.filter(([offset]) => 'x' in offset)).toHaveLength(dragged ? 0 : 1);
    } finally { __setScrollToImpl(() => {}); }
  });

  it("opens the hour body with now in its upper third", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T21:30:00Z'));
    const scrollTo = vi.fn();
    __setScrollToImpl(scrollTo);
    try {
      const tree = renderGrid([{ ...column('2026-10-08'), isToday: true }], new Map());
      const body = hostsByTestID(tree, 'time-grid-hour-scroller')[0]!;
      TestRenderer.act(() => body.props.onLayout({ nativeEvent: { layout: { width: 800, height: 300 } } }));
      const y = scrollTo.mock.calls[0]![0].y;
      expect(1032 - y).toBeGreaterThanOrEqual(0);
      expect(1032 - y).toBeLessThanOrEqual(100);
    } finally { vi.useRealTimers(); __setScrollToImpl(() => {}); }
  });

  it("uses natural short weekdays and only the date accent", () => {
    const tree = renderGrid([{ ...column("2025-06-16"), isToday: true }], new Map());
    const weekday = tree.root.findAll((node) => node.type === 'Text' && node.props.children === 'Mon')[0]!;
    expect(weekday).toBeDefined();
    expect(resolveStyle(weekday.props.style)).not.toHaveProperty('textTransform');
    expect(resolveStyle(weekday.props.style)).not.toHaveProperty('letterSpacing');
    expect(resolveStyle(weekday.props.style).color).toBe(tokens.fg2);
    const accents = tree.root.findAll((node) => typeof node.type === 'string' && resolveStyle(node.props.style).backgroundColor === tokens.primary);
    expect(accents).toHaveLength(3);
  });

  it("reserves enough band height for a 48px summary and its padding", () => {
    const col = column("2025-06-16");
    const tree = renderGrid([col], new Map([[col.dateStr, [makeEntry({ dueTime: null })]]]));
    expect(renderedAncestorHeight(hostsByTestID(tree, "time-grid-all-day")[0]!)).toBeGreaterThanOrEqual(64);
  });

  it("opens the tapped day from a column header", () => {
    const onSelectDay = vi.fn();
    const col = column("2025-06-16");
    const tree = renderGrid([col], new Map(), onSelectDay);

    const headers = hostsByTestID(tree, "time-grid-col-header");
    TestRenderer.act(() => {
      headers[0]!.props.onPress();
    });
    expect(onSelectDay).toHaveBeenCalledWith("2025-06-16");
  });

  it("discloses the timed name without selecting another day", () => {
    const onSelectDay = vi.fn();
    const col = column("2025-06-16");
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [col.dateStr, [makeEntry({ habitId: "a", title: "Standup", dueTime: "08:00" })]],
    ]);
    const tree = renderGrid([col], dayMap, onSelectDay);

    const blocks = hostsByTestID(tree, "time-grid-event");
    expect(blocks).toHaveLength(1);
    TestRenderer.act(() => {
      blocks[0]!.props.onPress();
    });
    expect(onSelectDay).not.toHaveBeenCalled();
    const details = tree.root.findAll((node) => node.type === CalendarEntryDetails)[0]!;
    expect(details.props.entries[0].title).toBe("Standup");
    sheetTestControls.defer(true);
    TestRenderer.act(() => tree.root.findAll((node) => node.type === "Pressable" && node.props.accessibilityLabel === "attempt-dismiss")[0]!.props.onPress());
    expect(tree.root.findAll((node) => node.type === CalendarEntryDetails)).toHaveLength(1);
    TestRenderer.act(() => sheetTestControls.completeDismissal());
    expect(tree.root.findAll((node) => node.type === CalendarEntryDetails)).toHaveLength(0);
    expect(hostsByTestID(tree, "time-grid-event")).toHaveLength(1);
  });

  it.each(['dark', 'light'] as const)("labels and fills the untimed summary in %s", (mode) => {
    const col = column("2025-06-16");
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry({ habitId: `ad-${i}`, title: `All ${i}`, dueTime: null }),
    );
    const gridTokens = createTokensV2('purple', mode);
    const tree = renderGrid([col], new Map([[col.dateStr, entries]]), vi.fn(), false, displayTime, 'UTC', gridTokens);

    const more = hostsByTestID(tree, "time-grid-all-day-more");
    expect(more[0]!.props.accessibilityLabel).toBe(
      'calendar.timeGrid.moreCountLabel:{"count":7}',
    );
    expect(resolveStyle(more[0]!.props.style)).toMatchObject({ minHeight: 48, minWidth: 48, borderRadius: 8 });
    expect(StyleSheet.flatten(more[0]!.props.style({ pressed: true }))).toMatchObject({
      backgroundColor: gridTokens.bgHover,
      borderRadius: 8,
    });
  });

  it("shows the empty message when no visible day has entries", () => {
    const tree = renderGrid([column("2025-06-16")], new Map());

    expect(hostsByTestID(tree, "time-grid-empty")).toHaveLength(1);
    expect(textValuesWithin(tree, "time-grid-empty")).toContain(
      "calendar.timeGrid.empty",
    );
  });

  it("hides the empty message while the range is loading", () => {
    const tree = renderGrid([column("2025-06-16")], new Map(), vi.fn(), true);

    expect(hostsByTestID(tree, "time-grid-empty")).toHaveLength(0);
  });

  it("hides the empty message when any visible day has an entry", () => {
    const col = column("2025-06-16");
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [col.dateStr, [makeEntry({ habitId: "a", dueTime: "08:00" })]],
    ]);
    const tree = renderGrid([col], dayMap);

    expect(hostsByTestID(tree, "time-grid-empty")).toHaveLength(0);
  });
});
