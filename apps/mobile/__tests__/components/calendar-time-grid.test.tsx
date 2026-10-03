import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { StyleSheet } from "react-native";
import * as ReactNative from "react-native";
import { CalendarEntryDetails } from "@/app/(tabs)/calendar/_components/calendar-entry-details";
import { Input } from "@/components/ui/input";
import { PillButton } from "@/components/ui/pill-button";
import { sheetTestControls } from "@/__tests__/support/sheet-double";
import type { TFunction } from "i18next";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";

import { createTokensV2 } from "@/lib/theme";
import {
  CalendarTimeGrid,
  type TimeGridColumn,
} from "@/app/(tabs)/calendar/_components/calendar-time-grid";

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
afterEach(() => { TestRenderer.act(() => { for (const tree of mounted) tree.update(<></>); }); mounted.length = 0; vi.restoreAllMocks(); sheetTestControls.defer(false); });

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
  it("grows the grid labels and padded column widths at 200% font scale", () => {
    vi.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({ width: 320, height: 915, scale: 1, fontScale: 2 });
    const col = column("2025-06-16");
    const tree = renderGrid([col], new Map([[col.dateStr, [makeEntry({ dueTime: '08:00' }), makeEntry({ habitId: 'untimed' })]]]), vi.fn(), false, (time) => `${time} AM`);
    expect(resolveStyle(hostsByTestID(tree, 'time-grid-col-header')[0]!.props.style).width).toBeGreaterThanOrEqual(104);
    expect(renderedAncestorHeight(hostsByTestID(tree, 'time-grid-col-header')[0]!)).toBeGreaterThanOrEqual(100);
    for (const label of hostsByTestID(tree, 'time-grid-hour-label')) expect(resolveStyle(label.props.style).fontSize).toBeGreaterThanOrEqual(12);
    const summaryStyle = resolveStyle(hostsByTestID(tree, 'time-grid-all-day-summary')[0]!.props.style);
    const count = tree.root.findAll((node) => node.type === 'Text' && node.props.children === 1)[0]!;
    const cell = hostsByTestID(tree, 'time-grid-all-day')[0]!;
    const cellStyle = resolveStyle(cell.props.style);
    const textHeight = Number(resolveStyle(count.props.style).lineHeight) * 2;
    const summaryHeight = Math.max(Number(summaryStyle.minHeight), textHeight + Number(summaryStyle.padding) * 2 + Number(summaryStyle.borderWidth) * 2);
    const requiredBandHeight = summaryHeight + Number(cellStyle.paddingVertical) * 2 + Number(cellStyle.borderBottomWidth);
    expect(renderedAncestorHeight(cell)).toBeGreaterThanOrEqual(requiredBandHeight);
  });

  it("paginates the untimed list and recovers from an empty search with a live count", () => {
    const col = column("2025-06-16");
    const entries = Array.from({ length: 25 }, (_, i) => makeEntry({ habitId: `ad-${i}`, title: `All ${i}` }));
    const tree = renderGrid([col], new Map([[col.dateStr, entries]]));
    TestRenderer.act(() => hostsByTestID(tree, 'time-grid-all-day-summary')[0]!.props.onPress());
    const titleNodes = () => tree.root.findAll((node) => node.type === 'Text' && node.props.selectable === true);
    expect(titleNodes()).toHaveLength(20);
    const next = tree.root.findAll((node) => node.type === PillButton && node.props.children === 'common.next')[0]!;
    TestRenderer.act(() => next.props.onClick());
    expect(titleNodes()).toHaveLength(5);
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityLiveRegion === 'polite')[0]!.props.children).toContain('\"shown\":5,\"total\":25');
    TestRenderer.act(() => tree.root.findAll((node) => node.type === Input)[0]!.props.onChange('missing'));
    expect(titleNodes()).toHaveLength(0);
    const liveCount = tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityLiveRegion === 'polite')[0]!;
    expect(liveCount.props.children).toContain('"total":0');
    const clear = tree.root.findAll((node) => node.type === PillButton && node.props.children === 'calendar.dayDetail.clearEventSearch')[0]!;
    TestRenderer.act(() => clear.props.onClick());
    expect(titleNodes()).toHaveLength(20);
    expect(tree.root.findAll((node) => node.type === Input)[0]!.props.value).toBe('');
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
      width: 56,
      minHeight: 48,
    });
    expect(textValuesWithin(tree, "time-grid-event")).not.toContain("Standup");
    expect(hostsByTestID(tree, "time-grid-event")[0]!.props.accessibilityLabel).toContain("Standup");
  });

  it("places an untimed habit in the all-day band, not the time body", () => {
    const col = column("2025-06-16");
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [col.dateStr, [makeEntry({ habitId: "b", title: "Read", dueTime: null })]],
    ]);
    const tree = renderGrid([col], dayMap);

    expect(hostsByTestID(tree, "time-grid-event")).toHaveLength(0);
    expect(hostsByTestID(tree, "time-grid-all-day-event")).toHaveLength(0);
    expect(textValuesWithin(tree, "time-grid-all-day-summary")).toContain(1);
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
    expect(widths).toEqual([48, 48]);
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

  it("aggregates every untimed entry into one 48px row and discloses their full names", () => {
    const onSelectDay = vi.fn();
    const col = column("2025-06-16");
    const entries = Array.from({ length: 8 }, (_, i) => makeEntry({ habitId: `ad-${i}`, title: `All ${i}`, dueTime: null }));
    const tree = renderGrid([col], new Map([[col.dateStr, entries]]), onSelectDay);
    expect(hostsByTestID(tree, "time-grid-all-day-event")).toHaveLength(0);
    const summary = hostsByTestID(tree, "time-grid-all-day-summary");
    expect(summary).toHaveLength(1);
    expect(textValuesWithin(tree, "time-grid-all-day-summary")).toContain(8);
    expect(summary[0]!.props.hitSlop).toBeUndefined();
    expect(resolveStyle(summary[0]!.props.style)).toMatchObject({ minHeight: 48, minWidth: 48 });
    TestRenderer.act(() => summary[0]!.props.onPress());
    const details = tree.root.findAll((node) => node.type === CalendarEntryDetails)[0]!;
    expect(details.props.entries.map((entry: CalendarDayEntry) => entry.title)).toEqual(entries.map((entry) => entry.title));
    expect(onSelectDay).not.toHaveBeenCalled();
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

    const more = hostsByTestID(tree, "time-grid-all-day-summary");
    expect(more[0]!.props.accessibilityLabel).toBe(
      'calendar.timeGrid.untimedCount:{"count":8}',
    );
    expect(resolveStyle(more[0]!.props.style)).toMatchObject({ minHeight: 48, minWidth: 48, borderRadius: 8 });
    expect(StyleSheet.flatten(more[0]!.props.style({ pressed: true }))).toMatchObject({
      backgroundColor: gridTokens.bgHover,
      borderRadius: 8,
      overflow: 'hidden',
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
