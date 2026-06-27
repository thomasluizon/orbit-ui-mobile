import React from "react";
import { describe, it, expect, vi } from "vitest";

const TestRenderer = require("react-test-renderer");

vi.mock("@/hooks/use-tour-target", () => ({
  useTourTarget: () => {},
}));

vi.mock("lucide-react-native", () => {
  const makeIcon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props);
  return {
    ChevronLeft: makeIcon("ChevronLeft"),
    ChevronRight: makeIcon("ChevronRight"),
    ChevronsLeft: makeIcon("ChevronsLeft"),
    ChevronsRight: makeIcon("ChevronsRight"),
  };
});

vi.mock("@/components/ui/stat-tile", () => ({
  StatTile: ({ value, label }: { value: string | number; label: string }) =>
    React.createElement(
      "View",
      null,
      React.createElement("Text", null, value),
      React.createElement("Text", null, label),
    ),
}));

import { createTokensV2 } from "@/lib/theme";
import { CalendarHeader } from "@/app/(tabs)/calendar/_components/calendar-shell";
import {
  CalendarStats,
  type CalendarStat,
} from "@/app/(tabs)/calendar/_components/calendar-stats";

type TestNode = { type: unknown; props: Record<string, any> };
type Tree = {
  root: { findAll: (predicate: (node: TestNode) => boolean) => TestNode[] };
};

function hostTextValues(tree: Tree): unknown[] {
  return tree.root
    .findAll((node) => node.type === "Text")
    .map((node) => node.props.children);
}

function pressByAccessibilityLabel(tree: Tree, label: string) {
  const matches = tree.root.findAll(
    (node) =>
      typeof node.type === "string" && node.props.accessibilityLabel === label,
  );
  expect(matches).toHaveLength(1);
  TestRenderer.act(() => {
    matches[0]!.props.onPress();
  });
}

describe("CalendarHeader year navigation (mobile)", () => {
  it("fires the year handlers and renders the month label", () => {
    const onPreviousYear = vi.fn();
    const onNextYear = vi.fn();
    const tokens = createTokensV2("purple", "dark");

    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CalendarHeader
          monthLabel="April 2026"
          previousMonthLabel="Previous month"
          nextMonthLabel="Next month"
          previousYearLabel="Previous year"
          nextYearLabel="Next year"
          currentMonthLabel="Go to current month"
          onPreviousMonth={vi.fn()}
          onNextMonth={vi.fn()}
          onPreviousYear={onPreviousYear}
          onNextYear={onNextYear}
          onCurrentMonth={vi.fn()}
          tokens={tokens}
        />,
      ) as unknown as Tree;
    });

    expect(hostTextValues(tree!)).toContain("April 2026");

    pressByAccessibilityLabel(tree!, "Previous year");
    pressByAccessibilityLabel(tree!, "Next year");

    expect(onPreviousYear).toHaveBeenCalledTimes(1);
    expect(onNextYear).toHaveBeenCalledTimes(1);
  });
});

describe("CalendarStats (mobile)", () => {
  it("renders a tile for each stat, surfacing its label", () => {
    const stats: readonly CalendarStat[] = [
      { key: "bestStreak", emoji: "🔥", value: 5, label: "Best streak" },
      { key: "totalLogs", emoji: "✅", value: 42, label: "Total logs" },
      { key: "missed", emoji: "⚠️", value: 3, label: "Missed" },
    ];

    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CalendarStats stats={stats} />,
      ) as unknown as Tree;
    });

    const texts = hostTextValues(tree!);
    expect(texts).toContain("Best streak");
    expect(texts).toContain("Total logs");
    expect(texts).toContain("Missed");
  });
});
