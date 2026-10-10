import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { StyleSheet } from "react-native";
import * as ReactNative from "react-native";
import { Resvg } from '@resvg/resvg-js';
import en from '@orbit/shared/i18n/en.json';
import ptBR from '@orbit/shared/i18n/pt-BR.json';
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
  language = 'en',
  allDayLabel = en.calendar.timeGrid.noSetTime,
): Tree {
  let tree: Tree;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <CalendarTimeGrid
        columns={columns}
        dayMap={dayMap}
        onSelectDay={onSelectDay}
        displayTime={formatTime}
        language={language}
        allDayLabel={allDayLabel}
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

function hostParent(node: TestNode): TestNode {
  let parent = node.parent!;
  while (typeof parent.type !== 'string') parent = parent.parent!;
  return parent;
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
  for (const [language, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    it.each([320, 360, 384, 412, 1352])(`fits the ${language} any-time label on one line at font scale 1 and %ipx`, (width) => {
      vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width, height: 915, scale: 1, fontScale: 1 });
      const day = column('2026-10-05');
      const entries = [null, null, null, '08:00', '21:00'].map((dueTime, index) => makeEntry({ habitId: `label-fit-${index}`, dueTime, title: `Organizar as anotações e preparar a semana ${index}` }));
      const tree = renderGrid([day], new Map([[day.dateStr, entries]]), vi.fn(), false, displayTime, 'UTC', tokens, language, words.calendar.timeGrid.noSetTime);
      const label = hostsByTestID(tree, 'time-grid-any-time-label')[0]!;
      const labelStyle = resolveStyle(label.props.style);
      const cell = hostParent(label);
      const cellStyle = resolveStyle(cell.props.style);
      const gutterStyle = resolveStyle(hostParent(hostParent(hostParent(cell))).props.style);
      const font = require.resolve('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="64"><text y="32" font-family="Geist" font-size="${Number(labelStyle.fontSize)}">${label.props.children}</text></svg>`;
      const bounds = new Resvg(svg, { font: { fontFiles: [font], loadSystemFonts: false } }).getBBox()!;
      const available = Number(gutterStyle.width) - Number(cellStyle.padding) * 2;
      expect(labelStyle.fontFamily).toBe('Geist_400Regular');
      expect(labelStyle.fontSize).toBe(12);
      expect(label.props.children).toBe(words.calendar.timeGrid.noSetTime);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(available);
      expect(label.props.numberOfLines).toBeUndefined();
      expect(label.props.ellipsizeMode).toBeUndefined();
    });
  }

  it.each([['en', en], ['pt-BR', ptBR]] as const)('grows and aligns an empty %s any-time lane to the measured accessibility label', (language, words) => {
    vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width: 320, height: 915, scale: 1, fontScale: 2 });
    const tree = renderGrid([column('2026-10-05')], new Map(), vi.fn(), false, displayTime, 'UTC', tokens, language, words.calendar.timeGrid.noSetTime);
    const label = hostsByTestID(tree, 'time-grid-any-time-label')[0]!;
    TestRenderer.act(() => label.props.onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width: 80, height: 120 } } }));
    const cell = hostParent(hostsByTestID(tree, 'time-grid-any-time-label')[0]!);
    const style = resolveStyle(cell.props.style);
    expect(style.height).toBeUndefined();
    expect(Number(style.minHeight)).toBeGreaterThanOrEqual(120 + Number(style.padding) * 2 + Number(style.borderBottomWidth));
    expect(renderedAncestorHeight(hostsByTestID(tree, 'time-grid-all-day')[0]!)).toBe(style.minHeight);
    expect(resolveStyle(hostParent(cell).props.style).height).toBeUndefined();
  });

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

  it.each(['none', 'scroll', 'scroll-start', 'drag', 'touch'])("holds the opening position through pane pinning until input=%s", (input) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T21:30:00Z'));
    let scrollOffset = 0;
    const scrollTo = vi.fn((offset: { y?: number }) => { if (offset.y !== undefined) scrollOffset = offset.y; });
    __setScrollToImpl(scrollTo);
    try {
      const tree = renderGrid([{ ...column('2026-10-08'), isToday: true }], new Map());
      const body = () => hostsByTestID(tree, 'time-grid-hour-scroller')[0]!;
      const pane = () => hostsByTestID(tree, 'time-grid-day-pane')[0]!;
      TestRenderer.act(() => {
        body().props.onLayout({ nativeEvent: { layout: { width: 800, height: 400 } } });
        pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 300 } } });
      });
      expect(body().props.stickyHeaderIndices).toEqual([]);
      const nowLine = tree.root.findAll((node) => node.type === 'View' && node.props.accessibilityLabel === 'Now')[0]!;
      const nowTop = Number(resolveStyle(nowLine.props.style).top);
      expect(300 + nowTop - scrollOffset).toBe(100);
      TestRenderer.act(() => body().props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: scrollOffset }, contentSize: { width: 800, height: 1752 }, layoutMeasurement: { width: 800, height: 400 } } }));
      if (input !== 'none') TestRenderer.act(() => {
        if (input === 'drag') body().props.onScrollBeginDrag();
        if (input === 'touch') body().props.onTouchMove?.();
        scrollOffset = input === 'scroll-start' ? 0 : 600;
        body().props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: scrollOffset }, contentSize: { width: 800, height: 1752 }, layoutMeasurement: { width: 800, height: 400 } } });
      });
      TestRenderer.act(() => pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 100 } } }));
      expect(body().props.stickyHeaderIndices).toEqual([0]);
      if (input === 'none') {
        const belowPane = nowTop - scrollOffset;
        expect(belowPane).toBeGreaterThanOrEqual(0);
        expect(belowPane).toBeLessThanOrEqual(300 / 3);
      } else expect(scrollOffset).toBe(input === 'scroll-start' ? 0 : 600);
    } finally { vi.useRealTimers(); __setScrollToImpl(() => {}); }
  });

  it.each([
    { movement: 'native clamp', offset: 1152, contentHeight: 1552, expected: 957 },
    { movement: 'native clamp within one DIP', offset: 1151.5, contentHeight: 1552, expected: 957 },
    { movement: 'upward input below the maximum', offset: 1100, contentHeight: 1552, expected: 1100 },
    { movement: 'upward input outside clamp tolerance', offset: 1150, contentHeight: 1552, expected: 1150 },
    { movement: 'input to the end', offset: 1352, contentHeight: 1752, expected: 1352 },
  ])("corrects the opening after $movement arrives before the shorter pane layout", ({ offset, contentHeight, expected }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T21:30:00Z'));
    let scrollOffset = 0;
    __setScrollToImpl((position) => { if (position.y !== undefined) scrollOffset = position.y; });
    try {
      const tree = renderGrid([{ ...column('2026-10-08'), isToday: true }], new Map());
      const body = () => hostsByTestID(tree, 'time-grid-hour-scroller')[0]!;
      const pane = () => hostsByTestID(tree, 'time-grid-day-pane')[0]!;
      TestRenderer.act(() => {
        body().props.onLayout({ nativeEvent: { layout: { width: 800, height: 400 } } });
        pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 300 } } });
      });
      expect(scrollOffset).toBe(1232);
      TestRenderer.act(() => body().props.onScroll({ nativeEvent: {
        contentOffset: { x: 0, y: scrollOffset },
        contentSize: { width: 800, height: 1752 },
        layoutMeasurement: { width: 800, height: 400 },
      } }));
      TestRenderer.act(() => {
        scrollOffset = offset;
        body().props.onScroll({ nativeEvent: {
          contentOffset: { x: 0, y: offset },
          contentSize: { width: 800, height: contentHeight },
          layoutMeasurement: { width: 800, height: 400 },
        } });
      });
      expect(scrollOffset).toBe(offset);
      TestRenderer.act(() => pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 100 } } }));
      expect(body().props.stickyHeaderIndices).toEqual([0]);
      expect(scrollOffset).toBe(expected);
      if (expected === 957) expect(1032 - scrollOffset).toBe(75);
    } finally { vi.useRealTimers(); __setScrollToImpl(() => {}); }
  });

  it.each([
    { movement: 'native clamp', offset: 388, contentWidth: 672, expected: 372 },
    { movement: 'upward input below the maximum', offset: 350, contentWidth: 672, expected: 350 },
    { movement: 'input to the end', offset: 1116, contentWidth: 1400, expected: 1116 },
  ])("keeps horizontal opening ownership after $movement", ({ offset, contentWidth, expected }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T21:30:00Z'));
    let horizontalOffset = 0;
    let verticalOffset = 0;
    __setScrollToImpl((position) => {
      if (position.x !== undefined) horizontalOffset = position.x;
      if (position.y !== undefined) verticalOffset = position.y;
    });
    try {
      const columns = Array.from({ length: 7 }, (_, index) => ({ ...column(`2026-10-${String(5 + index).padStart(2, '0')}`), isToday: index === 6 }));
      const crowded = new Map([[columns[6]!.dateStr, [makeEntry({ habitId: 'first', dueTime: '08:00' }), makeEntry({ habitId: 'second', dueTime: '08:00' })]]]);
      const tree = renderGrid(columns, crowded);
      const horizontal = () => tree.root.findAll((node) => node.type === 'ScrollView' && node.props.horizontal)[0]!;
      const body = () => hostsByTestID(tree, 'time-grid-hour-scroller')[0]!;
      const pane = () => hostsByTestID(tree, 'time-grid-day-pane')[0]!;
      TestRenderer.act(() => {
        horizontal().props.onLayout({ nativeEvent: { layout: { width: 284, height: 400 } } });
        horizontal().props.onContentSizeChange(1344, 400);
        body().props.onLayout({ nativeEvent: { layout: { width: 1344, height: 400 } } });
        pane().props.onLayout({ nativeEvent: { layout: { width: 1344, height: 300 } } });
      });
      expect(horizontalOffset).toBe(1060);
      expect(verticalOffset).toBe(1232);
      TestRenderer.act(() => horizontal().props.onScroll({ nativeEvent: {
        contentOffset: { x: 1060, y: 0 },
        contentSize: { width: 1344, height: 400 },
        layoutMeasurement: { width: 284, height: 400 },
      } }));
      TestRenderer.act(() => {
        horizontalOffset = offset;
        horizontal().props.onScroll({ nativeEvent: {
          contentOffset: { x: offset, y: 0 },
          contentSize: { width: contentWidth, height: 400 },
          layoutMeasurement: { width: 284, height: 400 },
        } });
      });
      TestRenderer.act(() => tree.update(
        <CalendarTimeGrid columns={columns} dayMap={new Map()} onSelectDay={vi.fn()} displayTime={displayTime} language="en" allDayLabel="No set time" nowLabel="Now" isLoading={false} t={translate} tokens={tokens} timeZone="UTC" />,
      ));
      TestRenderer.act(() => {
        horizontal().props.onContentSizeChange(672, 400);
        horizontal().props.onLayout({ nativeEvent: { layout: { width: 300, height: 400 } } });
        pane().props.onLayout({ nativeEvent: { layout: { width: 672, height: 100 } } });
      });
      expect(horizontalOffset).toBe(expected);
      expect(verticalOffset).toBe(expected === 372 ? 957 : 1232);
    } finally { vi.useRealTimers(); __setScrollToImpl(() => {}); }
  });

  it("holds now in the upper third through viewport and hour scale changes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T21:30:00Z'));
    const dimensions = vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width: 800, height: 915, scale: 1, fontScale: 1 });
    let scrollOffset = 0;
    __setScrollToImpl((offset) => { if (offset.y !== undefined) scrollOffset = offset.y; });
    try {
      const tree = renderGrid([{ ...column('2026-10-08'), isToday: true }], new Map());
      const body = () => hostsByTestID(tree, 'time-grid-hour-scroller')[0]!;
      const pane = () => hostsByTestID(tree, 'time-grid-day-pane')[0]!;
      TestRenderer.act(() => {
        body().props.onLayout({ nativeEvent: { layout: { width: 800, height: 400 } } });
        pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 100 } } });
      });
      const firstOffset = scrollOffset;
      expect(1032 - scrollOffset).toBe(75);
      TestRenderer.act(() => body().props.onLayout({ nativeEvent: { layout: { width: 800, height: 300 } } }));
      expect(1032 - scrollOffset).toBe(50);
      TestRenderer.act(() => {
        body().props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: firstOffset }, contentSize: { width: 800, height: 1477 }, layoutMeasurement: { width: 800, height: 300 } } });
        body().props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: scrollOffset }, contentSize: { width: 800, height: 1477 }, layoutMeasurement: { width: 800, height: 300 } } });
      });
      dimensions.mockReturnValue({ width: 800, height: 915, scale: 1, fontScale: 2 });
      TestRenderer.act(() => pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 120 } } }));
      expect(2064 - scrollOffset).toBe(45);
      TestRenderer.act(() => {
        body().props.onScrollBeginDrag();
        scrollOffset = 0;
        body().props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 0 }, contentSize: { width: 800, height: 2680 }, layoutMeasurement: { width: 800, height: 300 } } });
      });
      dimensions.mockReturnValue({ width: 800, height: 915, scale: 1, fontScale: 1 });
      TestRenderer.act(() => body().props.onLayout({ nativeEvent: { layout: { width: 800, height: 400 } } }));
      expect(scrollOffset).toBe(0);
    } finally { vi.useRealTimers(); __setScrollToImpl(() => {}); }
  });

  it.each([0, 6])("keeps edge-day horizontal opening scrolls under grid ownership (today=%s)", (todayIndex) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T21:30:00Z'));
    const scrollTo = vi.fn();
    __setScrollToImpl(scrollTo);
    try {
      const columns = Array.from({ length: 7 }, (_, index) => ({ ...column(`2026-10-${String(5 + index).padStart(2, '0')}`), isToday: index === todayIndex }));
      const tree = renderGrid(columns, new Map());
      const horizontal = () => tree.root.findAll((node) => node.type === 'ScrollView' && node.props.horizontal)[0]!;
      const body = () => hostsByTestID(tree, 'time-grid-hour-scroller')[0]!;
      const pane = () => hostsByTestID(tree, 'time-grid-day-pane')[0]!;
      TestRenderer.act(() => {
        horizontal().props.onLayout({ nativeEvent: { layout: { width: 284, height: 400 } } });
        horizontal().props.onContentSizeChange(672, 400);
        body().props.onLayout({ nativeEvent: { layout: { width: 672, height: 400 } } });
        pane().props.onLayout({ nativeEvent: { layout: { width: 672, height: 300 } } });
      });
      const horizontalOffset = todayIndex === 0 ? 0 : 388;
      expect(scrollTo.mock.calls.filter(([offset]) => 'x' in offset)).toEqual([[{ x: horizontalOffset, animated: false }]]);
      TestRenderer.act(() => horizontal().props.onScroll({ nativeEvent: { contentOffset: { x: horizontalOffset, y: 0 }, contentSize: { width: 672, height: 400 }, layoutMeasurement: { width: 284, height: 400 } } }));
      scrollTo.mockClear();
      TestRenderer.act(() => pane().props.onLayout({ nativeEvent: { layout: { width: 672, height: 100 } } }));
      expect(scrollTo.mock.calls.filter(([offset]) => 'y' in offset)).toEqual([[{ y: 957, animated: false }], [{ y: 957, animated: false }]]);
      TestRenderer.act(() => horizontal().props.onScroll({ nativeEvent: { contentOffset: { x: 100, y: 0 }, contentSize: { width: 672, height: 400 }, layoutMeasurement: { width: 284, height: 400 } } }));
      scrollTo.mockClear();
      TestRenderer.act(() => {
        horizontal().props.onLayout({ nativeEvent: { layout: { width: 300, height: 300 } } });
        body().props.onLayout({ nativeEvent: { layout: { width: 672, height: 300 } } });
      });
      expect(scrollTo).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); __setScrollToImpl(() => {}); }
  });

  it("unpins oversized day lanes and repins at half the viewport after a layout", () => {
    const tree = renderGrid([column('2025-06-16')], new Map());
    const body = () => hostsByTestID(tree, 'time-grid-hour-scroller')[0]!;
    const pane = () => hostsByTestID(tree, 'time-grid-day-pane')[0]!;
    TestRenderer.act(() => {
      body().props.onLayout({ nativeEvent: { layout: { width: 800, height: 400 } } });
      pane().props.onLayout?.({ nativeEvent: { layout: { width: 800, height: 200 } } });
    });
    expect(body().props.stickyHeaderIndices).toEqual([0]);
    TestRenderer.act(() => pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 201 } } }));
    expect(body().props.stickyHeaderIndices).toEqual([]);
    let parent = hostsByTestID(tree, 'time-grid-col-header')[0]!.parent;
    while (parent && parent !== body()) parent = parent.parent;
    expect(parent).toBe(body());
    TestRenderer.act(() => pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 100 } } }));
    expect(body().props.stickyHeaderIndices).toEqual([0]);
  });

  it("opens the hour body with now in its upper third", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T21:30:00Z'));
    const scrollTo = vi.fn();
    __setScrollToImpl(scrollTo);
    try {
      const tree = renderGrid([{ ...column('2026-10-08'), isToday: true }], new Map());
      const body = hostsByTestID(tree, 'time-grid-hour-scroller')[0]!;
      TestRenderer.act(() => {
        body.props.onLayout({ nativeEvent: { layout: { width: 800, height: 300 } } });
        hostsByTestID(tree, 'time-grid-day-pane')[0]!.props.onLayout({ nativeEvent: { layout: { width: 800, height: 120 } } });
      });
      const y = scrollTo.mock.calls[0]![0].y;
      expect(120 + 1032 - y).toBeGreaterThanOrEqual(120);
      expect(120 + 1032 - y).toBeLessThanOrEqual(180);
    } finally { vi.useRealTimers(); __setScrollToImpl(() => {}); }
  });

  it.each([178, 126])("opens against the loaded pane layout even when its height stays the same (height=%s)", (loadedHeight) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T21:30:00Z'));
    const scrollTo = vi.fn();
    __setScrollToImpl(scrollTo);
    try {
      const today = { ...column('2026-10-08'), isToday: true };
      const columns = [today];
      const grid = (dayMap: Map<string, CalendarDayEntry[]>, isLoading: boolean) => <CalendarTimeGrid columns={columns} dayMap={dayMap} onSelectDay={vi.fn()} displayTime={displayTime} language="en" allDayLabel="No set time" nowLabel="Now" isLoading={isLoading} t={translate} tokens={tokens} timeZone="UTC" />;
      const tree = renderGrid(columns, new Map(), vi.fn(), true);
      const body = () => hostsByTestID(tree, 'time-grid-hour-scroller')[0]!;
      const pane = () => hostsByTestID(tree, 'time-grid-day-pane')[0]!;
      TestRenderer.act(() => {
        body().props.onLayout({ nativeEvent: { layout: { width: 800, height: 300 } } });
        pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 126 } } });
      });
      expect(scrollTo).not.toHaveBeenCalled();
      const loadingPane = pane();
      const entries = Array.from({ length: 3 }, (_, index) => makeEntry({ habitId: String(index) }));
      const loaded = new Map([[today.dateStr, entries]]);
      TestRenderer.act(() => tree.update(grid(loaded, false)));
      expect(scrollTo).not.toHaveBeenCalled();
      expect(pane()).not.toBe(loadingPane);
      TestRenderer.act(() => pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: loadedHeight } } }));
      const pinned = loadedHeight <= 150;
      const firstOffset = scrollTo.mock.calls[0]![0].y;
      const visibleHourHeight = 300 - (pinned ? loadedHeight : 0);
      const visibleNow = 1032 + (pinned ? 0 : loadedHeight) - firstOffset;
      expect(visibleNow).toBeGreaterThanOrEqual(0);
      expect(visibleNow).toBeLessThanOrEqual(visibleHourHeight / 3);
      expect(body().props.stickyHeaderIndices).toEqual(pinned ? [0] : []);
      expect(scrollTo.mock.calls).toEqual([[{ y: firstOffset, animated: false }], [{ y: firstOffset, animated: false }]]);
      scrollTo.mockClear();
      TestRenderer.act(() => body().props.onScrollBeginDrag());
      TestRenderer.act(() => tree.update(grid(new Map([[today.dateStr, entries.slice(0, 1)]]), false)));
      TestRenderer.act(() => {
        body().props.onLayout({ nativeEvent: { layout: { width: 800, height: 400 } } });
        pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 126 } } });
      });
      expect(scrollTo).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); __setScrollToImpl(() => {}); }
  });

  it("preserves a vertical drag before the loaded pane layout arrives", () => {
    const scrollTo = vi.fn();
    __setScrollToImpl(scrollTo);
    try {
      const columns = [{ ...column('2026-10-08'), isToday: true }];
      const tree = renderGrid(columns, new Map(), vi.fn(), true);
      const body = () => hostsByTestID(tree, 'time-grid-hour-scroller')[0]!;
      TestRenderer.act(() => {
        body().props.onLayout({ nativeEvent: { layout: { width: 800, height: 300 } } });
        hostsByTestID(tree, 'time-grid-day-pane')[0]!.props.onLayout({ nativeEvent: { layout: { width: 800, height: 126 } } });
        body().props.onScrollBeginDrag?.();
      });
      TestRenderer.act(() => tree.update(<CalendarTimeGrid columns={columns} dayMap={new Map()} onSelectDay={vi.fn()} displayTime={displayTime} language="en" allDayLabel="No set time" nowLabel="Now" isLoading={false} t={translate} tokens={tokens} timeZone="UTC" />));
      TestRenderer.act(() => hostsByTestID(tree, 'time-grid-day-pane')[0]!.props.onLayout({ nativeEvent: { layout: { width: 800, height: 126 } } }));
      expect(scrollTo).not.toHaveBeenCalled();
    } finally { __setScrollToImpl(() => {}); }
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
