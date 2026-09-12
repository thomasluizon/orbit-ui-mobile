import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatAPIDate } from "@orbit/shared/utils";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";
import { View } from "react-native";

import CalendarScreen from "@/app/(tabs)/calendar";
import { SafeAreaView } from 'react-native-safe-area-context'

const TestRenderer = require("react-test-renderer");

const state = vi.hoisted(() => ({
  rangeMap: new Map<string, CalendarDayEntry[]>(),
  monthMap: new Map<string, CalendarDayEntry[]>(),
  monthLoading: false,
  monthError: null as string | null,
  monthRefresh: () => {},
  profile: undefined as { weekStartDay: number } | undefined,
  profileError: null as Error | null,
  profileRefetch: vi.fn(),
  calendarDataCalls: vi.fn(),
  routerPush: vi.fn(),
  setShowCreateModal: vi.fn(),
}));

const calendarGridProps = vi.hoisted(() => ({
  current: null as Record<string, any> | null,
  header: null as Record<string, any> | null,
  stats: null as Record<string, any> | null,
}));

const tokensProxy: any = new Proxy({}, { get: () => "#222222" });

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: state.routerPush, replace: vi.fn() }),
}));

vi.mock("@/stores/ui-store", () => ({
  useUIStore: (selector: (value: Record<string, unknown>) => unknown) =>
    selector({ setShowCreateModal: state.setShowCreateModal }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("@/hooks/use-profile", () => ({
  useProfile: () => ({
    profile: state.profile,
    error: state.profileError,
    refetch: state.profileRefetch,
  }),
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
  useCalendarData: (month: Date) => {
    state.calendarDataCalls(month)
    return ({
      dayMap: state.monthMap,
      isLoading: state.monthLoading,
      isFetching: false,
      error: state.monthError,
      refresh: state.monthRefresh,
    })
  },
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

vi.mock("@/components/ui/sheet", async () => await import("@/__tests__/support/sheet-double"));
vi.mock("@/components/ui/section-label", () => ({ SectionLabel: () => null }));

vi.mock("@/app/(tabs)/calendar/_components/calendar-shell", () => ({
  CalendarHeader: (props: Record<string, any>) => {
    calendarGridProps.header = props;
    return <View testID="calendar-header" />;
  },
  CalendarWeekNav: () => null,
  CalendarLegend: () => <View testID="calendar-legend" />,
}));
vi.mock("@/app/(tabs)/calendar/_components/calendar-grid", () => ({
  CalendarGrid: (props: Record<string, any>) => {
    calendarGridProps.current = props;
    return null;
  },
}));
vi.mock("@/app/(tabs)/calendar/_components/calendar-stats", () => ({
  CalendarStats: (props: Record<string, any>) => {
    calendarGridProps.stats = props;
    return null;
  },
}));
vi.mock("@/app/(tabs)/calendar/_components/calendar-day-detail", () => ({
  CalendarDayDetail: () => null,
}));

type TestNode = { type: unknown; props: Record<string, any> };
type Tree = {
  update: (element: React.ReactElement) => void;
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

function pressView(tree: Tree, view: string) {
  const segments = tree.root.findAll(
    (node) =>
      typeof node.type === "string" &&
      node.props.accessibilityRole === "radio" &&
      typeof node.props.testID === "string" &&
      node.props.testID.startsWith(`segment-${view}-`),
  );
  expect(segments.length).toBeGreaterThan(0);
  TestRenderer.act(() => {
    segments[0]!.props.onPress();
  });
}

describe("CalendarScreen views (mobile)", () => {
  beforeEach(() => {
    calendarGridProps.current = null;
    calendarGridProps.header = null;
    calendarGridProps.stats = null;
    state.monthMap = new Map();
    state.monthLoading = false;
    state.monthError = null;
    state.monthRefresh = () => {};
    state.profile = { weekStartDay: 1 };
    state.profileError = null;
    state.profileRefetch = vi.fn();
    state.calendarDataCalls.mockClear();
    state.routerPush.mockClear();
    state.setShowCreateModal.mockClear();
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

  afterEach(() => vi.useRealTimers());
  it('leaves the top safe area to the shell', () => {
    let tree!: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />) })
    const safeAreas = tree.root.findAll((node) => node.type === SafeAreaView)
    expect(safeAreas.length).toBeGreaterThan(0)
    for (const safeArea of safeAreas) expect(safeArea.props.edges).toEqual(['left', 'right', 'bottom'])
    TestRenderer.act(() => tree.update(<></>))
  })

  it("renders one three-option view switcher without agenda and opens the month on today", () => {
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });

    const switchers = tree!.root.findAll(
      (node) =>
        typeof node.type === "string" &&
        node.props.accessibilityRole === "radiogroup" &&
        node.props.accessibilityLabel === "calendar.view.switchLabel",
    );
    const segments = tree!.root.findAll(
      (node) =>
        typeof node.type === "string" && node.props.accessibilityRole === "radio",
    );

    expect(switchers).toHaveLength(1);
    expect(segments).toHaveLength(3);
    expect(
      segments.find(
        (segment) => segment.props.testID === "segment-month-selected-enabled",
      )?.props.accessibilityState?.checked,
    ).toBe(true);
    expect(
      segments.some(
        (segment) => segment.props.testID === "segment-agenda-unselected-enabled",
      ),
    ).toBe(false);

    const flatLists = tree!.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    );
    let headerTree!: import("react-test-renderer").ReactTestRenderer;
    TestRenderer.act(() => {
      headerTree = TestRenderer.create(flatLists[0]!.props.ListHeaderComponent);
    });
    expect(calendarGridProps.current?.selectedDay).toBe(formatAPIDate(new Date()));
    TestRenderer.act(() => headerTree.update(<></>));
  });

  it('loads calendar data concurrently while the profile resolves', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 11));
    state.profile = undefined;
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });

    expect(state.calendarDataCalls).toHaveBeenCalledTimes(1);
    expect(tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === 'skeleton-unit-grid',
    )).toHaveLength(1);
    const gridShape = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === 'skeleton-grid-shape',
    )[0];
    expect(gridShape?.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ width: 332, height: 236 }),
    ]));
  });

  it.each([
    ['five-row', new Date(2026, 8, 11), 5],
    ['six-row', new Date(2026, 7, 11), 6],
  ])('keeps the %s profile-loading grid at the loaded month height', (_label, now, expectedRows) => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    state.profile = undefined;
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    const loadingShape = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === 'skeleton-grid-shape',
    )[0]!;
    const loadingHeight = loadingShape.props.style
      .flat(Infinity)
      .find((style: Record<string, unknown>) => typeof style.height === 'number')?.height;

    state.profile = { weekStartDay: 1 };
    TestRenderer.act(() => { tree.update(<CalendarScreen />); });
    const flatList = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.type === 'FlatList',
    )[0]!;
    TestRenderer.act(() => { TestRenderer.create(flatList.props.ListHeaderComponent); });
    const loadedRows = (calendarGridProps.current?.gridDays as unknown[]).length / 7;
    const loadedHeight = loadedRows * 44 + (loadedRows - 1) * 4;

    expect(loadedRows).toBe(expectedRows);
    expect(loadingHeight).toBe(loadedHeight);
  });

  it('shows a retryable error when the profile request fails', () => {
    state.profile = undefined;
    state.profileError = new Error('profile unavailable');
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });

    expect(hostTexts(tree)).toContain('calendar.loadError');
    const retry = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button',
    );
    expect(retry).toHaveLength(1);
    TestRenderer.act(() => { retry[0]!.props.onPress(); });
    expect(state.profileRefetch).toHaveBeenCalledTimes(1);
  });

  it("switches to the week time-grid when the week tab is selected", () => {
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });

    expect(
      tree!.root.findAll(
        (node) =>
          typeof node.type === "string" &&
          node.props.testID === "calendar-time-grid",
      ),
    ).toHaveLength(0);

    pressView(tree!, "week");

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
      tree = TestRenderer.create(<CalendarScreen />);
    });

    pressView(tree!, "week");
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
      tree = TestRenderer.create(<CalendarScreen />);
    });

    pressView(tree!, "range");

    expect(hostTexts(tree!)).toContain("calendar.timeGrid.pickRangeHint");
  });

  it("asks for the end day after the first interval pick", () => {
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });

    pressView(tree!, "range");
    expect(hostTexts(tree!)).toContain("calendar.timeGrid.pickRangeHint");
    expect(calendarGridProps.current).not.toBeNull();

    TestRenderer.act(() => {
      calendarGridProps.current!.onSelectDay("2026-01-05");
    });

    expect(hostTexts(tree!)).toContain("calendar.timeGrid.pickEndHint");
    expect(hostTexts(tree!)).not.toContain("calendar.timeGrid.pickRangeHint");
  });

  it("keeps the calendar usable and offers habit creation for an empty current month", () => {
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });

    const flatLists = tree!.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    );
    expect(flatLists).toHaveLength(1);

    let headerTree: Tree;
    let footerTree: Tree;
    TestRenderer.act(() => {
      headerTree = TestRenderer.create(
        flatLists[0]!.props.ListHeaderComponent,
      );
      footerTree = TestRenderer.create(
        flatLists[0]!.props.ListFooterComponent,
      );
    });

    expect(hostTexts(headerTree!)).toContain("calendar.emptyMonth");
    expect(calendarGridProps.current).not.toBeNull();
    expect(calendarGridProps.stats?.state).toBe("empty");
    expect(headerTree!.root.findAll(
      (node) => typeof node.type === "string" && node.props.testID === "calendar-legend",
    )).toHaveLength(0);
    const buttons = headerTree!.root.findAll(
      (node) => typeof node.type === "string" && node.props.accessibilityRole === "button",
    );
    expect(buttons.length).toBeGreaterThan(0);
    TestRenderer.act(() => buttons[0]!.props.onPress());
    expect(state.setShowCreateModal).toHaveBeenCalledWith(true);
    expect(state.routerPush).toHaveBeenCalledWith("/");
  });

  it("keeps paging but removes creation for a future month", () => {
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    let flatList = tree.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    )[0]!;
    let headerTree!: Tree;
    TestRenderer.act(() => {
      headerTree = TestRenderer.create(flatList.props.ListHeaderComponent);
    });
    TestRenderer.act(() => { calendarGridProps.header!.onNextMonth(); });
    flatList = tree.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    )[0]!;
    TestRenderer.act(() => {
      headerTree = TestRenderer.create(flatList.props.ListHeaderComponent);
    });

    expect(hostTexts(headerTree)).toContain("calendar.futureMonth");
    expect(calendarGridProps.current).not.toBeNull();
    expect(headerTree.root.findAll(
      (node) => typeof node.type === "string" && node.props.accessibilityRole === "button",
    )).toHaveLength(0);
  });

  it("keeps compact loading shaped like the grid and stat tiles", () => {
    state.monthLoading = true;
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    const flatList = tree.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    )[0]!;
    let headerTree!: Tree;
    TestRenderer.act(() => {
      headerTree = TestRenderer.create(flatList.props.ListHeaderComponent);
      TestRenderer.create(flatList.props.ListFooterComponent);
    });

    expect(calendarGridProps.current?.isLoading).toBe(true);
    expect(calendarGridProps.stats?.state).toBe("loading");
    expect(headerTree.root.findAll(
      (node) => typeof node.type === "string" && node.props.testID === "calendar-day-loading",
    )).toHaveLength(0);
  });

  it("shows the legend once the month has a scheduled entry", () => {
    state.monthMap = new Map([[formatAPIDate(new Date()), [makeEntry({})]]]);
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    const flatList = tree.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    )[0]!;
    let headerTree!: Tree;
    TestRenderer.act(() => {
      headerTree = TestRenderer.create(flatList.props.ListHeaderComponent);
      TestRenderer.create(flatList.props.ListFooterComponent);
    });

    expect(headerTree.root.findAll(
      (node) => typeof node.type === "string" && node.props.testID === "calendar-legend",
    )).toHaveLength(1);
    expect(calendarGridProps.stats?.state).toBe("default");
  });

  it("shows a retryable error card when the calendar query fails", () => {
    state.monthError = "network down";
    const refreshCalls: number[] = [];
    state.monthRefresh = () => {
      refreshCalls.push(1);
    };

    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
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
