import React from "react";
import { describe, it, expect, vi } from "vitest";
import type { TFunction } from "i18next";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";
import type { CalendarSyncEvent } from "@orbit/shared";
import { createTokensV2 } from "@/lib/theme";
import { CalendarDayDetail } from "@/app/(tabs)/calendar/_components/calendar-day-detail";

const TestRenderer = require("react-test-renderer");

vi.mock("@/components/ui/pill-button", () => ({
  PillButton: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("PillButtonMock", null, children),
}));

vi.mock("@/app/(tabs)/calendar/_components/show-recurring-toggle", () => ({
  ShowRecurringToggle: () => React.createElement("ShowRecurringToggleMock", null),
}));

vi.mock("@/app/(tabs)/calendar/_components/calendar-day-entry", () => ({
  CalendarDayEntryRow: ({
    entry,
    isLast,
  }: {
    entry: { title: string };
    isLast: boolean;
  }) =>
    React.createElement("CalendarDayEntryRowMock", {
      title: entry.title,
      isLast,
    }),
}));

vi.mock("@/components/dates/event-row", () => ({
  EventRow: (props: Record<string, unknown>) =>
    React.createElement("EventRowMock", props),
}));

type TestNode = { type: unknown; props: Record<string, any> };
type Tree = {
  root: { findAll: (predicate: (node: TestNode) => boolean) => TestNode[] };
};

const translate = ((key: string) => key) as unknown as TFunction;

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

function renderDetail(
  entries: CalendarDayEntry[],
  calendarEvents: CalendarSyncEvent[] = [],
): Tree {
  const tokens = createTokensV2("purple", "dark");
  let tree: Tree;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <CalendarDayDetail
        selectedEntries={entries}
        filteredEntries={entries}
        calendarEvents={calendarEvents}
        completedCount={0}
        showRecurring
        onShowRecurringChange={() => {}}
        onGoToDay={() => {}}
        displayTime={(time) => time}
        t={translate}
        tokens={tokens}
      />,
    );
  });
  return tree!;
}

function entryRows(tree: Tree): TestNode[] {
  return tree.root.findAll((node) => node.type === "CalendarDayEntryRowMock");
}

describe("CalendarDayDetail entry list (mobile)", () => {
  it("renders exactly one row per filtered entry, preserving order", () => {
    const tree = renderDetail([
      makeEntry({ habitId: "1", title: "Read" }),
      makeEntry({ habitId: "2", title: "Exercise" }),
      makeEntry({ habitId: "3", title: "Journal" }),
    ]);

    const rows = entryRows(tree);
    expect(rows.map((row) => row.props.title)).toEqual([
      "Read",
      "Exercise",
      "Journal",
    ]);
  });

  it("flags only the final row as last, proving the index is passed through the map", () => {
    const tree = renderDetail([
      makeEntry({ habitId: "1", title: "Read" }),
      makeEntry({ habitId: "2", title: "Exercise" }),
      makeEntry({ habitId: "3", title: "Journal" }),
    ]);

    const rows = entryRows(tree);
    expect(rows.map((row) => row.props.isLast)).toEqual([false, false, true]);
  });

  it("renders no entry rows and the empty-day message when there are no entries", () => {
    const tree = renderDetail([]);

    expect(entryRows(tree)).toHaveLength(0);
    const emptyText = tree.root.findAll(
      (node) =>
        node.type === "Text" &&
        node.props.children === "calendar.noHabitsScheduled",
    );
    expect(emptyText).toHaveLength(1);
  });

  it("renders timed and all-day Google events through the read-only event row", () => {
    const tree = renderDetail([makeEntry()], [
      {
        id: "event-1",
        title: "Team meeting",
        description: null,
        startDate: "2025-06-15",
        startTime: "09:00",
        endTime: null,
        isRecurring: false,
        recurrenceRule: null,
        reminders: [],
      },
      {
        id: "event-2",
        title: "Company holiday",
        description: null,
        startDate: "2025-06-15",
        startTime: null,
        endTime: null,
        isRecurring: false,
        recurrenceRule: null,
        reminders: [],
      },
    ]);

    const events = tree.root.findAll((node) => node.type === "EventRowMock");
    expect(events.map((event) => event.props)).toEqual([
      expect.objectContaining({
        time: "09:00",
        title: "Team meeting",
        source: "calendar.title",
      }),
      expect.objectContaining({
        allDayLabel: "calendar.timeGrid.allDay",
        title: "Company holiday",
        source: "calendar.title",
      }),
    ]);
  });
});
