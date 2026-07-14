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

vi.mock("@/components/ui/year-picker", () => ({
  YearPicker: ({ onSelectYear }: { onSelectYear: (year: number) => void }) =>
    React.createElement("YearPickerMock", {
      onPress: () => onSelectYear(2030),
    }),
}));

import { createTokensV2 } from "@/lib/theme";
import {
  CalendarHeader,
  CalendarLegend,
  CalendarWeekNav,
} from "@/app/(tabs)/calendar/_components/calendar-shell";
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

function exercisePressCallbacks(tree: Tree) {
  for (const node of tree.root.findAll(() => true)) {
    const style = node.props.style;
    if (typeof style === "function") {
      style({ pressed: true });
      style({ pressed: false });
    }
  }
}

describe("CalendarHeader year navigation (mobile)", () => {
  it("renders the month and year, fires month handlers, and has no year-skip arrows", () => {
    const onPreviousMonth = vi.fn();
    const onNextMonth = vi.fn();
    const onCurrentMonth = vi.fn();
    const onSelectYear = vi.fn();
    const tokens = createTokensV2("purple", "dark");

    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CalendarHeader
          monthLabel="April"
          year={2026}
          previousMonthLabel="Previous month"
          nextMonthLabel="Next month"
          currentMonthLabel="Go to current month"
          selectYearLabel="Select year"
          onPreviousMonth={onPreviousMonth}
          onNextMonth={onNextMonth}
          onCurrentMonth={onCurrentMonth}
          onSelectYear={onSelectYear}
          tokens={tokens}
        />,
      ) as unknown as Tree;
    });

    const texts = hostTextValues(tree!);
    expect(texts).toContain("April");
    expect(texts).toContain(2026);

    pressByAccessibilityLabel(tree!, "Previous month");
    pressByAccessibilityLabel(tree!, "Next month");
    pressByAccessibilityLabel(tree!, "Go to current month");
    expect(onPreviousMonth).toHaveBeenCalledTimes(1);
    expect(onNextMonth).toHaveBeenCalledTimes(1);
    expect(onCurrentMonth).toHaveBeenCalledTimes(1);

    const yearArrows = tree!.root.findAll(
      (node) =>
        typeof node.type === "string" &&
        (node.props.accessibilityLabel === "Previous year" ||
          node.props.accessibilityLabel === "Next year"),
    );
    expect(yearArrows).toHaveLength(0);
  });

  it("opens the year picker and reports the chosen year", () => {
    const onSelectYear = vi.fn();
    const tokens = createTokensV2("purple", "dark");

    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CalendarHeader
          monthLabel="April"
          year={2026}
          previousMonthLabel="Previous month"
          nextMonthLabel="Next month"
          currentMonthLabel="Go to current month"
          selectYearLabel="Select year"
          onPreviousMonth={vi.fn()}
          onNextMonth={vi.fn()}
          onCurrentMonth={vi.fn()}
          onSelectYear={onSelectYear}
          tokens={tokens}
        />,
      ) as unknown as Tree;
    });

    pressByAccessibilityLabel(tree!, "Select year");

    const mock = tree!.root.findAll((node) => node.type === "YearPickerMock");
    expect(mock.length).toBeGreaterThan(0);
    TestRenderer.act(() => {
      mock[0]!.props.onPress();
    });
    expect(onSelectYear).toHaveBeenCalledWith(2030);
  });
});

describe("CalendarHeader year modal internals (mobile)", () => {
  function renderHeader(onSelectYear = vi.fn()) {
    const tokens = createTokensV2("purple", "dark");
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CalendarHeader
          monthLabel="April"
          year={2026}
          previousMonthLabel="Previous month"
          nextMonthLabel="Next month"
          currentMonthLabel="Go to current month"
          selectYearLabel="Select year"
          onPreviousMonth={vi.fn()}
          onNextMonth={vi.fn()}
          onCurrentMonth={vi.fn()}
          onSelectYear={onSelectYear}
          tokens={tokens}
        />,
      ) as unknown as Tree;
    });
    return tree!;
  }

  it("guards the dialog responder and closes on backdrop press and request-close", () => {
    const tree = renderHeader();
    pressByAccessibilityLabel(tree, "Select year");

    const modal = tree.root.findAll((node) => node.type === "Modal")[0]!;
    expect(modal.props.visible).toBe(true);

    const dialog = tree.root.findAll(
      (node) => typeof node.props.onStartShouldSetResponder === "function",
    )[0]!;
    expect(dialog.props.onStartShouldSetResponder()).toBe(true);

    const backdrop = tree.root.findAll(
      (node) =>
        node.type === "Pressable" &&
        typeof node.props.onPress === "function" &&
        !node.props.accessibilityRole,
    )[0]!;
    TestRenderer.act(() => {
      backdrop.props.onPress();
    });
    expect(
      tree.root.findAll((node) => node.type === "Modal")[0]!.props.visible,
    ).toBe(false);

    pressByAccessibilityLabel(tree, "Select year");
    TestRenderer.act(() => {
      tree.root
        .findAll((node) => node.type === "Modal")[0]!
        .props.onRequestClose();
    });
    expect(
      tree.root.findAll((node) => node.type === "Modal")[0]!.props.visible,
    ).toBe(false);

    exercisePressCallbacks(tree);
  });
});

describe("CalendarWeekNav (mobile)", () => {
  it("renders the week label and fires the week navigation handlers", () => {
    const onPreviousWeek = vi.fn();
    const onNextWeek = vi.fn();
    const onCurrentWeek = vi.fn();
    const tokens = createTokensV2("purple", "dark");

    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CalendarWeekNav
          weekLabel="Apr 6 – 12"
          previousWeekLabel="Previous week"
          nextWeekLabel="Next week"
          currentWeekLabel="Go to current week"
          onPreviousWeek={onPreviousWeek}
          onNextWeek={onNextWeek}
          onCurrentWeek={onCurrentWeek}
          tokens={tokens}
        />,
      ) as unknown as Tree;
    });

    expect(hostTextValues(tree!)).toContain("Apr 6 – 12");
    pressByAccessibilityLabel(tree!, "Previous week");
    pressByAccessibilityLabel(tree!, "Next week");
    pressByAccessibilityLabel(tree!, "Go to current week");
    expect(onPreviousWeek).toHaveBeenCalledTimes(1);
    expect(onNextWeek).toHaveBeenCalledTimes(1);
    expect(onCurrentWeek).toHaveBeenCalledTimes(1);
    exercisePressCallbacks(tree!);
  });
});

describe("CalendarLegend (mobile)", () => {
  it("renders all four status labels", () => {
    const tokens = createTokensV2("purple", "dark");
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CalendarLegend
          todayLabel="Today"
          doneLabel="Done"
          partialLabel="Partial"
          missedLabel="Missed"
          tokens={tokens}
        />,
      ) as unknown as Tree;
    });

    const texts = hostTextValues(tree!);
    expect(texts).toEqual(
      expect.arrayContaining(["Today", "Done", "Partial", "Missed"]),
    );
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
