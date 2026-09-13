import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatAPIDate } from "@orbit/shared/utils";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";
import { View } from "react-native";

import CalendarScreen from "@/app/(tabs)/calendar";
import { SafeAreaView } from 'react-native-safe-area-context'

const TestRenderer = require("react-test-renderer");

const state = vi.hoisted(() => ({
  rangeMap: new Map<string, CalendarDayEntry[]>(),
  monthError: null as string | null,
  monthRefresh: () => {},
  profile: undefined as { weekStartDay: 0 | 1; timeZone: string | null } | undefined,
  profileError: null as Error | null,
  profileRefetch: vi.fn(),
  calendarDataCalls: vi.fn(),
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
      dayMap: new Map(),
      isLoading: false,
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
  CalendarHeader: () => <View testID="calendar-header" />,
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

type TestNode = { type: unknown; props: Record<string, any> };
type Tree = {
  root: { findAll: (predicate: (node: TestNode) => boolean) => TestNode[] };
  update: (element: React.ReactElement) => void;
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

function renderMonthHeader(tree: Tree): import("react-test-renderer").ReactTestRenderer {
  const flatList = tree.root.findAll(
    (node) => typeof node.type === "string" && node.type === "FlatList",
  )[0];
  let headerTree!: import("react-test-renderer").ReactTestRenderer;
  TestRenderer.act(() => {
    headerTree = TestRenderer.create(flatList!.props.ListHeaderComponent);
  });
  return headerTree;
}

describe("CalendarScreen views (mobile)", () => {
  beforeEach(() => {
    calendarGridProps.current = null;
    state.monthError = null;
    state.monthRefresh = () => {};
    state.profile = { weekStartDay: 1, timeZone: "UTC" };
    state.profileError = null;
    state.profileRefetch = vi.fn();
    state.calendarDataCalls.mockClear();
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

  it("uses UTC when the mounted screen has a nullable account timezone", () => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = "America/Sao_Paulo";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T01:30:00.000Z"));
    state.profile = { weekStartDay: 1, timeZone: null };
    let tree!: Tree;
    let headerTree!: import("react-test-renderer").ReactTestRenderer;
    try {
      TestRenderer.act(() => {
        tree = TestRenderer.create(<CalendarScreen />);
      });
      headerTree = renderMonthHeader(tree);

      expect(calendarGridProps.current?.todayKey).toBe("2026-09-12");
    } finally {
      TestRenderer.act(() => headerTree.update(<></>));
      vi.useRealTimers();
      if (originalTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimeZone;
    }
  });

  it("advances at account midnight while the device remains on the previous day", () => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = "America/Sao_Paulo";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T09:59:30.000Z"));
    state.profile = { weekStartDay: 1, timeZone: "Pacific/Kiritimati" };
    let tree!: Tree;
    let headerTree!: import("react-test-renderer").ReactTestRenderer;
    try {
      TestRenderer.act(() => {
        tree = TestRenderer.create(<CalendarScreen />);
      });
      headerTree = renderMonthHeader(tree);
      expect(calendarGridProps.current?.todayKey).toBe("2026-09-11");

      TestRenderer.act(() => {
        vi.advanceTimersByTime(60_000);
      });
      const flatList = tree.root.findAll(
        (node) => typeof node.type === "string" && node.type === "FlatList",
      )[0];
      TestRenderer.act(() => {
        headerTree.update(flatList!.props.ListHeaderComponent);
      });
      expect(calendarGridProps.current?.todayKey).toBe("2026-09-12");
    } finally {
      TestRenderer.act(() => headerTree.update(<></>));
      vi.useRealTimers();
      if (originalTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimeZone;
    }
  });

  it("reclassifies days immediately after a mounted profile timezone change", () => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = "America/Sao_Paulo";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T10:30:00.000Z"));
    state.profile = { weekStartDay: 1, timeZone: "Pacific/Kiritimati" };
    let tree!: Tree;
    let headerTree!: import("react-test-renderer").ReactTestRenderer;
    try {
      TestRenderer.act(() => {
        tree = TestRenderer.create(<CalendarScreen />);
      });
      headerTree = renderMonthHeader(tree);
      expect(calendarGridProps.current?.todayKey).toBe("2026-09-12");

      state.profile = { weekStartDay: 1, timeZone: "America/Los_Angeles" };
      TestRenderer.act(() => {
        tree.update(<CalendarScreen />);
      });
      const flatList = tree.root.findAll(
        (node) => typeof node.type === "string" && node.type === "FlatList",
      )[0];
      TestRenderer.act(() => {
        headerTree.update(flatList!.props.ListHeaderComponent);
      });

      expect(calendarGridProps.current?.todayKey).toBe("2026-09-11");
    } finally {
      TestRenderer.act(() => tree.update(<></>));
      TestRenderer.act(() => headerTree.update(<></>));
      vi.useRealTimers();
      if (originalTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimeZone;
    }
  });

  it('loads calendar data concurrently while the profile resolves', () => {
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
      expect.objectContaining({ width: 308, height: 264 }),
    ]));
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

  it("shows the empty-month state in place of the stat tiles when nothing is logged", () => {
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });

    const flatLists = tree!.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    );
    expect(flatLists).toHaveLength(1);

    let footerTree: Tree;
    TestRenderer.act(() => {
      footerTree = TestRenderer.create(
        flatLists[0]!.props.ListFooterComponent,
      );
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
