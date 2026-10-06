import { expectPressFill } from '../support/press-feedback';
import React from "react";
import { __setWindowDimensions } from "@/test-mocks/react-native";
import { StyleSheet, View } from "react-native";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import en from "@orbit/shared/i18n/en.json";
import ptBR from "@orbit/shared/i18n/pt-BR.json";

import { CalendarOptions } from '@/app/(tabs)/calendar/_components/calendar-options';
import { TrueSheet } from "@lodev09/react-native-true-sheet";
import { Sheet } from "@/components/ui/sheet";
import { createTokensV2, radius } from "@/lib/theme";
import { SMALL_PILL_VISIBLE_MIN, TOUCH_TARGET_MIN } from "@orbit/shared/theme";
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

vi.mock('@/components/navigation/notification-bell', () => ({ NotificationBell: () => <View testID="notification-bell" /> }));

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
  __setWindowDimensions({ width: 412, height: 900, scale: 1, fontScale: 1 });
  useUIStore.setState({ openOverlayIds: [], calendarShowRecurring: true });
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

describe("CalendarHeader month and year navigation (mobile)", () => {
  const tokens = createTokensV2("purple", "dark");
  function renderHeader(onSelectMonth = vi.fn(), onCurrentMonth = vi.fn(), showMonthNavigation = true) {
    let tree!: Tree;
    TestRenderer.act(() => {
      tree = mount(<CalendarHeader currentMonth={new Date(2026, 3, 1)} todayKey="2026-04-08"
        previousMonthLabel="Previous month" nextMonthLabel="Next month"
        onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={onCurrentMonth}
        onSelectMonth={onSelectMonth} tokens={tokens} periodNavigation={showMonthNavigation ? undefined : <CalendarWeekNav weekLabel="Apr 6 to 12" previousWeekLabel="Previous week" nextWeekLabel="Next week" currentWeekLabel="Current week" onPreviousWeek={vi.fn()} onNextWeek={vi.fn()} onCurrentWeek={vi.fn()} tokens={tokens} />}
        viewSelector={<View testID="calendar-view-selector" />} />);
    });
    return tree;
  }

  it.each(['light', 'dark'] as const)('paints ghost header controls in %s mode', (mode) => {
    const themedTokens = createTokensV2('purple', mode);
    let tree!: Tree;
    TestRenderer.act(() => {
      tree = mount(<CalendarHeader currentMonth={new Date(2026, 3, 1)} todayKey="2026-04-08" previousMonthLabel="Previous" nextMonthLabel="Next" onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()} tokens={themedTokens} />);
    });
    for (const label of ['Previous', 'Next']) {
      const control = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0]!;
      expect(StyleSheet.flatten(control.props.style({ pressed: false }))).toMatchObject({ backgroundColor: 'transparent', borderWidth: 1.5, borderColor: themedTokens.hairlineStrong });
      expectPressFill(tree, label, themedTokens.bgHover, 999);
    }
    const title = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'April, calendar.monthPicker')[0]!;
    expect(StyleSheet.flatten(title.props.style({ pressed: false }))).toMatchObject({ backgroundColor: 'transparent', borderRadius: 12 });
    expectPressFill(tree, 'April, calendar.monthPicker', themedTokens.bgHover, 12);
  });

  it("removes the month navigation row in the other views", () => {
    const tree = renderHeader(vi.fn(), vi.fn(), false);
    expect(tree.root.findAll((node) => node.props.testID === "calendar-month-navigation")).toHaveLength(0);
    expect(tree.root.findAll((node) => typeof node.type === "string" && node.props.testID === "calendar-view-selector")).toHaveLength(1);
  });

  it.each([320, 412, 1352])("keeps one month control at %ipx with a padded 48 target", (width) => {
    __setWindowDimensions({ width, height: 900, scale: 1, fontScale: 1 });
    const tree = renderHeader();
    expect(hostTextValues(tree).flat()).toContain("April");
    expect(hostTextValues(tree)).not.toContain(2026);
    const title = tree.root.findAll((node) => node.type === "Text" && Array.isArray(node.props.children) && node.props.children[0] === "April")[0];
    expect(StyleSheet.flatten(title?.props.style).fontSize).toBe(22);
    for (const label of ['Previous month', 'Next month']) expectPressFill(tree, label, tokens.bgHover, 999);
    expectPressFill(tree, 'April, calendar.monthPicker', tokens.bgHover, 12);
  });

  it("keeps year browsing local and reports a chosen month after native dismissal", () => {
    const onSelectMonth = vi.fn();
    const tree = renderHeader(onSelectMonth);
    pressByAccessibilityLabel(tree, "April, calendar.monthPicker");
    expect(useUIStore.getState().openOverlayIds).toHaveLength(1);
    pressByAccessibilityLabel(tree, "2026, common.selectYear");
    expect(tree.root.findAll((node) => node.type === "ScrollView")).toHaveLength(1);
    expect(tree.root.findAll((node) => node.props.testID === "sheet-body-scroll")).toHaveLength(0);
    pressByAccessibilityLabel(tree, "2030");
    expect(onSelectMonth).not.toHaveBeenCalled();
    pressByAccessibilityLabel(tree, "April");
    expect(nativeSheet.dismiss).toHaveBeenCalledOnce();
    expect(onSelectMonth).not.toHaveBeenCalled();
    finishNativeDismissal(tree);
    expect(onSelectMonth).toHaveBeenCalledWith(3, 2030);
    expect(useUIStore.getState().openOverlayIds).toHaveLength(0);
  });

  it("preserves the date on cancellation and recovers from rejected dismissal", async () => {
    const onSelectMonth = vi.fn();
    const tree = renderHeader(onSelectMonth);
    pressByAccessibilityLabel(tree, "April, calendar.monthPicker");
    pressByAccessibilityLabel(tree, "common.close");
    finishNativeDismissal(tree);
    expect(onSelectMonth).not.toHaveBeenCalled();
    pressByAccessibilityLabel(tree, "April, calendar.monthPicker");
    nativeSheet.dismiss.mockRejectedValueOnce(new Error("Dismissal rejected"));
    await TestRenderer.act(async () => { pressByAccessibilityLabel(tree, "April"); await Promise.resolve(); });
    expect(onSelectMonth).not.toHaveBeenCalled();
    expect(tree.root.findAll((node) => node.type === Sheet)).toHaveLength(1);
    await TestRenderer.act(async () => { pressByAccessibilityLabel(tree, "April"); await Promise.resolve(); });
    finishNativeDismissal(tree);
    expect(onSelectMonth).toHaveBeenCalledExactlyOnceWith(3, 2026);
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
    for (const label of ['Previous week', 'Next week']) expectPressFill(tree!, label, tokens.bgHover, 999);
    const current = tree!.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Apr 6 – 12, Go to current week')[0]!;
    expect.soft(current.props.hitSlop).toBe((TOUCH_TARGET_MIN - SMALL_PILL_VISIBLE_MIN) / 2);
    expect.soft(StyleSheet.flatten(current.props.style({ pressed: false }))).toMatchObject({
      backgroundColor: 'transparent', minHeight: TOUCH_TARGET_MIN, borderWidth: 1.5, borderColor: tokens.hairlineStrong,
    });
    expect.soft(StyleSheet.flatten(current.props.style({ pressed: true }))).toMatchObject({
      backgroundColor: tokens.bgHover, borderRadius: radius.full, overflow: 'hidden',
    });
    pressByAccessibilityLabel(tree!, "Previous week");
    pressByAccessibilityLabel(tree!, "Next week");
    pressByAccessibilityLabel(tree!, "Apr 6 – 12, Go to current week");
    expect(onPreviousWeek).toHaveBeenCalledTimes(1);
    expect(onNextWeek).toHaveBeenCalledTimes(1);
    expect(onCurrentWeek).toHaveBeenCalledTimes(1);
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
    expect(partialArc[0]?.props).toMatchObject({ cx: 7, cy: 7, r: 6.25, strokeWidth: 1.5, rotation: -135, origin: "7, 7", strokeDasharray: [Math.PI * 6.25, Math.PI * 12.5] });
    expect(partialTrack[0]?.props).toMatchObject({ cx: 7, cy: 7, r: 6.25, strokeWidth: 1.5 });
    const noneMark = tree!.root.findAll(
      (node) => node.type === "View" && node.props.testID === "calendar-legend-none",
    )[0];
    expect(StyleSheet.flatten(noneMark?.props.style)).toMatchObject({ borderColor: tokens.statusEmpty, borderWidth: 1.5 });
    expect(StyleSheet.flatten(noneMark?.props.style).backgroundColor).toBeUndefined();
    const loggableMark = tree!.root.findAll(
      (node) => node.type === "View" && node.props.testID === "calendar-legend-loggable",
    )[0];
    expect(StyleSheet.flatten(loggableMark?.props.style)).toMatchObject({
      backgroundColor: tokens.bgWell,
      borderColor: tokens.hairline,
      borderWidth: 1,
    });
    for (const outcome of ["full", "none", "loggable"]) {
      const mark = tree!.root.findAll((node) => node.type === "View" && node.props.testID === `calendar-legend-${outcome}`);
      expect(mark).toHaveLength(1);
      expect(StyleSheet.flatten(mark[0]?.props.style)).toMatchObject({ width: 14, height: 14 });
    }
    const partialMark = tree!.root.findAll((node) => node.type === "Svg" && node.props.testID === "calendar-legend-partial")[0];
    expect(partialMark?.props).toMatchObject({ width: 14, height: 14 });
    const legendRows = tree!.root.findAll((node) => node.type === "View" && React.Children.toArray(node.props.children).some((child) => React.isValidElement<{ testID?: string }>(child) && String(child.props.testID ?? "").startsWith("calendar-legend-")));
    expect(legendRows).toHaveLength(4);
    for (const row of legendRows) expect(StyleSheet.flatten(row.props.style)).toMatchObject({ flexDirection: "row", gap: 8 });
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
      gap: 16,
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

describe('Calendar options (mobile)', () => {
  it('closes the menu before changing the filter or opening the legend', () => {
    let tree!: Tree;
    TestRenderer.act(() => { tree = mount(<CalendarOptions tokens={createTokensV2('purple', 'dark')} onGoogleCalendar={vi.fn()} />); });
    expect(hostTextValues(tree)).not.toContain('calendar.legend.loggable');
    pressByAccessibilityLabel(tree, 'calendar.options');
    const recurring = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'checkbox')[0]!;
    expect(recurring.props.accessibilityState.checked).toBe(true);
    TestRenderer.act(() => recurring.props.onPress());
    expect(useUIStore.getState().calendarShowRecurring).toBe(true);
    finishNativeDismissal(tree);
    expect(useUIStore.getState().calendarShowRecurring).toBe(false);
    pressByAccessibilityLabel(tree, 'calendar.options');
    const legend = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'menuitem' && node.props.children.some((child: React.ReactElement<{ children?: React.ReactNode }> | null) => child?.props.children === 'calendar.legendTitle'))[0]!;
    TestRenderer.act(() => legend.props.onPress());
    expect(hostTextValues(tree)).not.toContain('calendar.legend.loggable');
    finishNativeDismissal(tree);
    expect(hostTextValues(tree)).toContain('calendar.legend.loggable');
    expect(tree.root.findAll((node) => node.type === Sheet)).toHaveLength(1);
  });
});
