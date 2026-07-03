import React from "react";
import { describe, it, expect, vi } from "vitest";
import type { TFunction } from "i18next";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";

const TestRenderer = require("react-test-renderer");

import { createTokensV2 } from "@/lib/theme";
import {
  CalendarTimeGrid,
  type TimeGridColumn,
} from "@/app/(tabs)/calendar/_components/calendar-time-grid";

type TestNode = { type: unknown; props: Record<string, any> };
type Tree = {
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

function column(dateStr: string): TimeGridColumn {
  return { date: new Date(`${dateStr}T00:00:00`), dateStr, isToday: false };
}

const displayTime = (time: string) => time;
const tokens = createTokensV2("purple", "dark");
const translate = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as unknown as TFunction;

function renderGrid(
  columns: TimeGridColumn[],
  dayMap: Map<string, CalendarDayEntry[]>,
  onSelectDay = vi.fn(),
  isLoading = false,
): Tree {
  let tree: Tree;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <CalendarTimeGrid
        columns={columns}
        dayMap={dayMap}
        onSelectDay={onSelectDay}
        displayTime={displayTime}
        language="en"
        allDayLabel="All-day"
        nowLabel="Now"
        isLoading={isLoading}
        t={translate}
        tokens={tokens}
      />,
    ) as unknown as Tree;
  });
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
    if (child && typeof child === "object" && "props" in child) {
      return collectText(child as { props: { children?: unknown } });
    }
    return [];
  });
}

describe("CalendarTimeGrid (mobile)", () => {
  it("places a timed habit as a block in its column", () => {
    const col = column("2025-06-16");
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [col.dateStr, [makeEntry({ habitId: "a", title: "Standup", dueTime: "08:00" })]],
    ]);
    const tree = renderGrid([col], dayMap);

    expect(hostsByTestID(tree, "time-grid-event")).toHaveLength(1);
    expect(textValuesWithin(tree, "time-grid-event")).toContain("Standup");
  });

  it("places an untimed habit in the all-day band, not the time body", () => {
    const col = column("2025-06-16");
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [col.dateStr, [makeEntry({ habitId: "b", title: "Read", dueTime: null })]],
    ]);
    const tree = renderGrid([col], dayMap);

    expect(hostsByTestID(tree, "time-grid-event")).toHaveLength(0);
    expect(textValuesWithin(tree, "time-grid-all-day-event")).toContain("Read");
  });

  it("renders one column header per day in the range", () => {
    const columns = ["2025-06-16", "2025-06-17", "2025-06-18", "2025-06-19"].map(
      column,
    );
    const tree = renderGrid(columns, new Map());

    expect(hostsByTestID(tree, "time-grid-col-header")).toHaveLength(4);
  });

  it("caps the all-day stack and collapses the overflow into a +N that opens the day", () => {
    const onSelectDay = vi.fn();
    const col = column("2025-06-16");
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry({ habitId: `ad-${i}`, title: `All ${i}`, dueTime: null }),
    );
    const dayMap = new Map<string, CalendarDayEntry[]>([[col.dateStr, entries]]);
    const tree = renderGrid([col], dayMap, onSelectDay);

    expect(hostsByTestID(tree, "time-grid-all-day-event")).toHaveLength(4);
    const more = hostsByTestID(tree, "time-grid-all-day-more");
    expect(more).toHaveLength(1);
    expect(textValuesWithin(tree, "time-grid-all-day-more")).toContain(4);

    TestRenderer.act(() => {
      more[0]!.props.onPress();
    });
    expect(onSelectDay).toHaveBeenCalledWith("2025-06-16");
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

  it("opens the tapped day from a timed event block", () => {
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
    expect(onSelectDay).toHaveBeenCalledWith("2025-06-16");
  });

  it("labels the +N overflow chip with a localized count for screen readers", () => {
    const col = column("2025-06-16");
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry({ habitId: `ad-${i}`, title: `All ${i}`, dueTime: null }),
    );
    const tree = renderGrid([col], new Map([[col.dateStr, entries]]));

    const more = hostsByTestID(tree, "time-grid-all-day-more");
    expect(more[0]!.props.accessibilityLabel).toBe(
      'calendar.timeGrid.moreLabel:{"count":4}',
    );
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
