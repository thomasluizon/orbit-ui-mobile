import React from "react";
import { __setWindowDimensions } from "@/test-mocks/react-native";
import { StyleSheet } from "react-native";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import en from "@orbit/shared/i18n/en.json";
import ptBR from "@orbit/shared/i18n/pt-BR.json";

import { TrueSheet } from "@lodev09/react-native-true-sheet";
import { Sheet } from "@/components/ui/sheet";
import { createTokensV2 } from "@/lib/theme";
import { useUIStore } from "@/stores/ui-store";
import {
  CalendarHeader,
  CalendarLegend,
  CalendarWeekNav,
} from "@/app/(tabs)/calendar/_components/calendar-shell";
import {
  CalendarStats,
  type CalendarStat,
} from "@/app/(tabs)/calendar/_components/calendar-stats";

const TestRenderer = require("react-test-renderer");


vi.mock("@/components/ui/stat-tile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/stat-tile")>()),
  StatTile: ({ value, label }: { value: string | number; label: string }) =>
    React.createElement(
      "View",
      null,
      React.createElement("Text", null, value),
      React.createElement("Text", null, label),
    ),
}));

vi.unmock("@/components/ui/sheet");

const nativeSheet = vi.hoisted(() => ({
  present: vi.fn(() => Promise.resolve()),
  dismiss: vi.fn(() => Promise.resolve()),
}));

vi.mock("@lodev09/react-native-true-sheet", () => ({
  TrueSheet: class TrueSheet extends React.Component<{
    header?: React.ReactNode;
    children?: React.ReactNode;
  }> {
    present = nativeSheet.present;
    dismiss = nativeSheet.dismiss;
    render() {
      return <>{this.props.header}{this.props.children}</>;
    }
  },
}));

beforeEach(() => {
  useUIStore.setState({ openOverlayIds: [] });
  nativeSheet.present.mockClear();
  nativeSheet.dismiss.mockReset().mockResolvedValue(undefined);
});

type TestNode = { type: unknown; props: Record<string, any> };
type Tree = {
  unmount: () => void;
  root: { findAll: (predicate: (node: TestNode) => boolean) => TestNode[] };
};

const mountedTrees: Tree[] = [];

function mount(element: React.ReactElement): Tree {
  const tree = TestRenderer.create(element);
  mountedTrees.push(tree);
  return tree;
}

afterEach(() => {
  TestRenderer.act(() => mountedTrees.splice(0).forEach((tree) => tree.unmount()));
});

function finishNativeDismissal(tree: Tree) {
  const sheet = tree.root.findAll((node) => node.type === TrueSheet)[0]!;
  TestRenderer.act(() => sheet.props.onDidDismiss());
}

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
      const pressed = StyleSheet.flatten(style({ pressed: true }));
      if (pressed?.backgroundColor === createTokensV2("purple", "dark").bgHover && node.props.onPress) {
        expect(node.props.hitSlop).toBeUndefined();
        expect(Math.max(pressed.height ?? 0, pressed.minHeight ?? 0)).toBeGreaterThanOrEqual(44);
        expect(Math.max(pressed.width ?? 0, pressed.minWidth ?? 0)).toBeGreaterThanOrEqual(44);
      }
      style({ pressed: false });
    }
  }
}

describe("CalendarHeader year navigation (mobile)", () => {
  it("keeps the selector in the header without month controls in other views", () => {
    const tokens = createTokensV2("purple", "dark");
    let tree: Tree;
    TestRenderer.act(() => {
      tree = mount(
        <CalendarHeader
          monthLabel="April"
          year={2026}
          previousMonthLabel="Previous month"
          nextMonthLabel="Next month"
          currentMonthLabel="Current month"
          selectYearLabel="Select year"
          onPreviousMonth={vi.fn()}
          onNextMonth={vi.fn()}
          onCurrentMonth={vi.fn()}
          onSelectYear={vi.fn()}
          showMonthNavigation={false}
          viewSelector={React.createElement("View", { testID: "calendar-view-selector" })}
          tokens={tokens}
        />,
      );
    });

    const header = tree!.root.findAll((node) => node.props.testID === "calendar-header-group")[0] as TestNode & {
      findAll: (predicate: (node: TestNode) => boolean) => TestNode[];
    };
    expect(header.findAll((node) => node.props.testID === "calendar-view-selector")).toHaveLength(1);
    expect(tree!.root.findAll((node) => node.props.accessibilityLabel === "Previous month")).toHaveLength(0);
    expect(tree!.root.findAll((node) => node.props.accessibilityLabel === "Next month")).toHaveLength(0);
    expect(tree!.root.findAll((node) => node.props.accessibilityLabel === "Select year")).toHaveLength(0);
  });

  it.each([412, 1352])("renders the month and year with their drawn sizes at %ipx", (width) => {
    __setWindowDimensions({ width, height: 900, scale: 1, fontScale: 1 });
    const onPreviousMonth = vi.fn();
    const onNextMonth = vi.fn();
    const onCurrentMonth = vi.fn();
    const onSelectYear = vi.fn();
    const tokens = createTokensV2("purple", "dark");

    let tree: Tree;
    TestRenderer.act(() => {
      tree = mount(
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
      );
    });

    const texts = hostTextValues(tree!);
    expect(texts).toContain("April");
    expect(texts).toContain(2026);
    const month = tree!.root.findAll((node) => node.type === "Text" && node.props.children === "April")[0]!;
    expect(StyleSheet.flatten(month.props.style).fontSize).toBe(28);
    const year = tree!.root.findAll((node) => node.type === "Text" && node.props.children === 2026)[0]!;
    expect(StyleSheet.flatten(year.props.style)).toMatchObject({ fontSize: width >= 1024 ? 14 : 12 });

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
      tree = mount(
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
      );
    });

    pressByAccessibilityLabel(tree!, "Select year");
    expect(useUIStore.getState().openOverlayIds).toHaveLength(1);

    expect(tree!.root.findAll((node) => node.type === Sheet)).toHaveLength(1);
    pressByAccessibilityLabel(tree!, "2030");
    expect(nativeSheet.dismiss).toHaveBeenCalledOnce();
    expect(onSelectYear).not.toHaveBeenCalled();
    expect(useUIStore.getState().openOverlayIds).toHaveLength(1);
    expect(tree!.root.findAll((node) => node.type === Sheet)).toHaveLength(1);
    finishNativeDismissal(tree!);
    expect(onSelectYear).toHaveBeenCalledWith(2030);
    expect(useUIStore.getState().openOverlayIds).toHaveLength(0);
  });
});

describe("CalendarHeader year sheet dismissal (mobile)", () => {
  function renderHeader(onSelectYear = vi.fn()) {
    const tokens = createTokensV2("purple", "dark");
    let tree: Tree;
    TestRenderer.act(() => {
      tree = mount(
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
      );
    });
    return tree!;
  }

  it("opens the shared sheet with one scroll owner and closes after native dismissal", () => {
    const onSelectYear = vi.fn();
    const tree = renderHeader(onSelectYear);
    expect(tree.root.findAll((node) => node.type === Sheet)).toHaveLength(0);
    pressByAccessibilityLabel(tree, "Select year");

    const sheet = tree.root.findAll((node) => node.type === Sheet)[0]!;
    expect(sheet.props.title).toBe("Select year");
    expect(nativeSheet.present).toHaveBeenCalledOnce();
    expect(tree.root.findAll((node) => node.type === "Modal")).toHaveLength(0);
    expect(tree.root.findAll((node) => node.type === "ScrollView")).toHaveLength(1);
    expect(tree.root.findAll((node) => node.props.testID === "sheet-body-scroll")).toHaveLength(0);

    pressByAccessibilityLabel(tree, "common.close");
    expect(nativeSheet.dismiss).toHaveBeenCalledOnce();
    expect(tree.root.findAll((node) => node.type === Sheet)).toHaveLength(1);
    expect(useUIStore.getState().openOverlayIds).toHaveLength(1);
    finishNativeDismissal(tree);
    expect(tree.root.findAll((node) => node.type === Sheet)).toHaveLength(0);
    expect(useUIStore.getState().openOverlayIds).toHaveLength(0);
    expect(onSelectYear).not.toHaveBeenCalled();

    pressByAccessibilityLabel(tree, "Select year");
    finishNativeDismissal(tree);
    expect(tree.root.findAll((node) => node.type === Sheet)).toHaveLength(0);
    expect(onSelectYear).not.toHaveBeenCalled();
    exercisePressCallbacks(tree);
  });

  it("keeps the picker and selected year when native dismissal rejects", async () => {
    const onSelectYear = vi.fn();
    const tree = renderHeader(onSelectYear);
    pressByAccessibilityLabel(tree, "Select year");
    nativeSheet.dismiss.mockRejectedValueOnce(new Error("Dismissal rejected"));
    await TestRenderer.act(async () => {
      pressByAccessibilityLabel(tree, "2030");
      await Promise.resolve();
    });
    expect(nativeSheet.dismiss).toHaveBeenCalledOnce();
    expect(onSelectYear).not.toHaveBeenCalled();
    expect(tree.root.findAll((node) => node.type === Sheet)).toHaveLength(1);
    expect(useUIStore.getState().openOverlayIds).toHaveLength(1);

    await TestRenderer.act(async () => {
      pressByAccessibilityLabel(tree, "2030");
      await Promise.resolve();
    });
    finishNativeDismissal(tree);
    expect(onSelectYear).toHaveBeenCalledExactlyOnceWith(2030);
    expect(tree.root.findAll((node) => node.type === Sheet)).toHaveLength(0);
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
      tree = mount(
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
      );
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
  it.each([
    [en, ["all logged", "part done", "nothing logged", "can log"], "Range", "Open this day on Today", ["Previous range", "Next range"], ["done", "not logged", "indulged", "resisted"]],
    [ptBR, ["tudo registrado", "em parte", "nada registrado", "pode registrar"], "Período", "Abrir este dia no Hoje", ["Período anterior", "Período seguinte"], ["feito", "sem registro", "cedeu", "resistiu"]],
  ])("uses the drawn calendar words in each locale", (locale, legendWords, rangeWord, dayLink, rangePager, statusWords) => {
    expect([locale.calendar.legend.full, locale.calendar.legend.partial, locale.calendar.legend.none, locale.calendar.legend.loggable]).toEqual(legendWords);
    expect([locale.calendar.dayCell.full, locale.calendar.dayCell.partial, locale.calendar.dayCell.none]).toEqual(legendWords.slice(0, 3));
    expect(locale.calendar.view.range).toBe(rangeWord);
    expect(locale.calendar.goToDay).toBe(dayLink);
    expect([locale.calendar.range.previous, locale.calendar.range.next]).toEqual(rangePager);
    expect([locale.calendar.status.completed, locale.calendar.status.missed, locale.calendar.status.indulged, locale.calendar.status.resisted]).toEqual(statusWords);
    let tree: Tree;
    TestRenderer.act(() => {
      tree = mount(<CalendarLegend loggableLabel={locale.calendar.legend.loggable} fullLabel={locale.calendar.legend.full} partialLabel={locale.calendar.legend.partial} noneLabel={locale.calendar.legend.none} tokens={createTokensV2("purple", "dark")} />);
    });
    expect(hostTextValues(tree!)).toEqual(legendWords);
  });

  it("renders all four status labels", () => {
    const tokens = createTokensV2("purple", "dark");
    let tree: Tree;
    TestRenderer.act(() => {
      tree = mount(
        <CalendarLegend
          loggableLabel="Can log"
          fullLabel="All done"
          partialLabel="Partial"
          noneLabel="None logged"
          tokens={tokens}
        />,
      );
    });

    const texts = hostTextValues(tree!);
    expect(texts).toEqual(
      expect.arrayContaining(["Can log", "All done", "Partial", "None logged"]),
    );
    expect(tree!.root.findAll((node) => node.type === "View" && node.props.testID === "calendar-legend-full")).toHaveLength(1);
    expect(tree!.root.findAll((node) => node.type === "Svg" && node.props.testID === "calendar-legend-partial")).toHaveLength(1);
    expect(tree!.root.findAll((node) => node.type === "View" && node.props.testID === "calendar-legend-none")).toHaveLength(1);
    const partialArc = tree!.root.findAll(
      (node) => node.type === "Circle" && node.props.stroke === tokens.primary,
    );
    const partialTrack = tree!.root.findAll(
      (node) => node.type === "Circle" && node.props.stroke === tokens.statusEmpty,
    );
    expect(partialTrack).toHaveLength(1);
    expect(partialArc).toHaveLength(1);
    expect(partialArc[0]?.props).toMatchObject({ strokeWidth: 1.5, rotation: -135 });
    const noneMark = tree!.root.findAll(
      (node) => node.type === "View" && node.props.testID === "calendar-legend-none",
    )[0];
    expect(StyleSheet.flatten(noneMark?.props.style).borderColor).toBe(tokens.statusEmpty);
    const loggableMark = tree!.root.findAll(
      (node) => node.type === "View" && node.props.testID === "calendar-legend-loggable",
    )[0];
    expect(StyleSheet.flatten(loggableMark?.props.style)).toMatchObject({
      backgroundColor: tokens.bgWell,
      borderColor: tokens.hairline,
      borderWidth: 1,
    });
  });
});

describe("CalendarStats (mobile)", () => {
  const stats = [
    { key: "bestStreak", value: 5, label: "Best streak" },
    { key: "totalLogs", value: 42, label: "Logs" },
    { key: "missed", value: 3, label: "Missed" },
  ] as const satisfies readonly [CalendarStat, CalendarStat, CalendarStat];

  it("renders the three month figures in one row", () => {
    let tree: Tree;
    TestRenderer.act(() => {
      tree = mount(
        <CalendarStats stats={stats} />,
      );
    });

    const texts = hostTextValues(tree!);
    const statsRow = tree!.root.findAll(
      (node) => node.type === "View" && node.props.testID === "calendar-stats",
    )[0]!;
    expect(StyleSheet.flatten(statsRow.props.style)).toMatchObject({
      flexDirection: "row",
      gap: 12,
    });
    expect(statsRow.props.children).toHaveLength(3);
    expect(texts).toContain("Best streak");
    expect(texts).toContain("Logs");
    expect(texts).toContain("Missed");
  });

  it("keeps loading and loaded row spacing identical", () => {
    let loadingTree: Tree;
    let loadedTree: Tree;
    TestRenderer.act(() => {
      loadingTree = TestRenderer.create(
        <CalendarStats stats={stats} state="loading" loadingLabel="Loading stats" />,
      );
      loadedTree = TestRenderer.create(<CalendarStats stats={stats} />);
    });

    const row = (tree: Tree) => tree.root.findAll(
      (node) => node.type === "View" && node.props.testID === "calendar-stats",
    )[0]!;
    expect(StyleSheet.flatten(row(loadingTree!).props.style))
      .toEqual(StyleSheet.flatten(row(loadedTree!).props.style));
    expect(row(loadingTree!).props.children).toHaveLength(3);
    expect(row(loadedTree!).props.children).toHaveLength(3);
  });
});
