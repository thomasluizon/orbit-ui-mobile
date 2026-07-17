import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatAPIDate } from "@orbit/shared/utils";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";

const TestRenderer = require("react-test-renderer");

const state = vi.hoisted(() => ({
  rangeMap: new Map<string, CalendarDayEntry[]>(),
  monthError: null as string | null,
  monthRefresh: () => {},
}));

const calendarGridProps = vi.hoisted(() => ({
  current: null as Record<string, any> | null,
}));

const tokensProxy: any = new Proxy({}, { get: () => "#222222" });

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("@/hooks/use-profile", () => ({
  useProfile: () => ({ profile: { weekStartDay: 1 } }),
}));

vi.mock("@/hooks/use-time-format", () => ({
  useTimeFormat: () => ({ displayTime: (time: string) => time }),
}));

vi.mock("@/hooks/use-tour-target", () => ({ useTourTarget: () => {} }));

vi.mock("@/hooks/use-tour-scroll-container", () => ({
  useTourScrollContainer: () => ({ onTourScroll: () => {} }),
}));

vi.mock("@/hooks/use-horizontal-swipe", () => ({
  useHorizontalSwipe: () => ({}),
}));

vi.mock("@/hooks/use-habits", () => ({
  useCalendarData: () => ({
    dayMap: new Map(),
    isLoading: false,
    isFetching: false,
    error: state.monthError,
    refresh: state.monthRefresh,
  }),
  useCalendarRange: () => ({ dayMap: state.rangeMap }),
}));

vi.mock("@/lib/use-app-theme", () => ({
  useAppTheme: () => ({ currentScheme: "purple", currentTheme: "dark" }),
}));

vi.mock("@/lib/theme", () => ({
  createTokensV2: () => tokensProxy,
  tintFromPrimary: () => "rgba(0,0,0,0.1)",
  easings: {
    spring: [0.2, 0, 0, 1],
    out: [0.16, 1, 0.3, 1],
    smooth: [0.2, 0, 0, 1],
  },
  radius: { sm: 8, md: 12, lg: 16, xl: 20, "2xl": 24, full: 9999 },
  shadowsV2: {
    shadow1: { elevation: 1 },
    shadow2: { elevation: 4 },
    shadow3: { elevation: 10 },
  },
}));

vi.mock("@/components/bottom-sheet-modal", () => ({ BottomSheetModal: () => null }));
vi.mock("@/components/ui/section-label", () => ({ SectionLabel: () => null }));

vi.mock("@/app/(tabs)/calendar/_components/calendar-shell", () => ({
  CalendarHeader: () => null,
  CalendarWeekNav: () => null,
  CalendarLegend: () => null,
}));
vi.mock("@/app/(tabs)/calendar/_components/calendar-grid", () => ({
  CalendarGrid: (props: Record<string, any>) => {
    calendarGridProps.current = props;
    return null;
  },
}));
vi.mock("@/app/(tabs)/calendar/_components/calendar-stats", () => ({
  CalendarStats: () => null,
}));
vi.mock("@/app/(tabs)/calendar/_components/calendar-day-detail", () => ({
  CalendarDayDetail: () => null,
}));

import CalendarScreen from "@/app/(tabs)/calendar";

type TestNode = { type: unknown; props: Record<string, any> };
type Tree = {
  root: { findAll: (predicate: (node: TestNode) => boolean) => TestNode[] };
};

function makeEntry(overrides: Partial<CalendarDayEntry>): CalendarDayEntry {
  return {
    habitId: "x",
    title: "Habit",
    status: "upcoming",
    isBadHabit: false,
    dueTime: "08:00",
    isOneTime: false,
    ...overrides,
  };
}

function hostTexts(tree: Tree): unknown[] {
  return tree.root
    .findAll((node) => typeof node.type === "string" && node.type === "Text")
    .flatMap((node) => {
      const children = node.props.children;
      const list = Array.isArray(children) ? children : [children];
      return list.filter(
        (child) => typeof child === "string" || typeof child === "number",
      );
    });
}

function pressTab(tree: Tree, label: string) {
  const tabs = tree.root.findAll(
    (node) =>
      typeof node.type === "string" &&
      node.props.accessibilityRole === "tab" &&
      node.props.accessibilityLabel === label,
  );
  expect(tabs.length).toBeGreaterThan(0);
  TestRenderer.act(() => {
    tabs[0]!.props.onPress();
  });
}

describe("CalendarScreen views (mobile)", () => {
  beforeEach(() => {
    calendarGridProps.current = null;
    state.monthError = null;
    state.monthRefresh = () => {};
    const todayStr = formatAPIDate(new Date());
    state.rangeMap = new Map<string, CalendarDayEntry[]>([
      [
        todayStr,
        [
          makeEntry({ habitId: "r", title: "Recurring", isOneTime: false }),
          makeEntry({
            habitId: "o",
            title: "OneTime",
            isOneTime: true,
            dueTime: "09:00",
          }),
        ],
      ],
    ]);
  });

  it("switches to the week time-grid when the week tab is selected", () => {
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />) as unknown as Tree;
    });

    expect(
      tree!.root.findAll(
        (node) =>
          typeof node.type === "string" &&
          node.props.testID === "calendar-time-grid",
      ),
    ).toHaveLength(0);

    pressTab(tree!, "calendar.view.week");

    expect(
      tree!.root.findAll(
        (node) =>
          typeof node.type === "string" &&
          node.props.testID === "calendar-time-grid",
      ),
    ).toHaveLength(1);
    expect(hostTexts(tree!)).toContain("Recurring");
    expect(hostTexts(tree!)).toContain("OneTime");
  });

  it("hides recurring habits from the week grid when show-recurring is turned off", () => {
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />) as unknown as Tree;
    });

    pressTab(tree!, "calendar.view.week");
    expect(hostTexts(tree!)).toContain("Recurring");

    const switches = tree!.root.findAll(
      (node) =>
        typeof node.type === "string" &&
        node.props.accessibilityRole === "switch",
    );
    expect(switches.length).toBeGreaterThan(0);
    TestRenderer.act(() => {
      switches[0]!.props.onPress();
    });

    expect(hostTexts(tree!)).not.toContain("Recurring");
    expect(hostTexts(tree!)).toContain("OneTime");
  });

  it("renders the interval clamp notice when a range is clamped", () => {
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />) as unknown as Tree;
    });

    pressTab(tree!, "calendar.view.range");

    expect(hostTexts(tree!)).toContain("calendar.timeGrid.pickRangeHint");
  });

  it("asks for the end day after the first interval pick", () => {
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />) as unknown as Tree;
    });

    pressTab(tree!, "calendar.view.range");
    expect(hostTexts(tree!)).toContain("calendar.timeGrid.pickRangeHint");
    expect(calendarGridProps.current).not.toBeNull();

    TestRenderer.act(() => {
      calendarGridProps.current!.onSelectDay("2026-01-05");
    });

    expect(hostTexts(tree!)).toContain("calendar.timeGrid.pickEndHint");
    expect(hostTexts(tree!)).not.toContain("calendar.timeGrid.pickRangeHint");
  });

  it("shows the empty-month state in place of the stat tiles when nothing is logged", () => {
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />) as unknown as Tree;
    });

    const flatLists = tree!.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    );
    expect(flatLists).toHaveLength(1);

    let footerTree: Tree;
    TestRenderer.act(() => {
      footerTree = TestRenderer.create(
        flatLists[0]!.props.ListFooterComponent,
      ) as unknown as Tree;
    });

    expect(hostTexts(footerTree!)).toContain("calendar.emptyMonth");
  });

  it("shows a retryable error card when the calendar query fails", () => {
    state.monthError = "network down";
    const refreshCalls: number[] = [];
    state.monthRefresh = () => {
      refreshCalls.push(1);
    };

    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />) as unknown as Tree;
    });

    expect(hostTexts(tree!)).toContain("calendar.loadError");

    const retryButtons = tree!.root.findAll(
      (node) =>
        typeof node.type === "string" &&
        node.props.accessibilityRole === "button",
    );
    expect(retryButtons).toHaveLength(1);
    TestRenderer.act(() => {
      retryButtons[0]!.props.onPress();
    });
    expect(refreshCalls).toHaveLength(1);
  });
});
