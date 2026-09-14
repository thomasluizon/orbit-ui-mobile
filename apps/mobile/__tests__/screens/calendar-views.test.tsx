import React from "react";
import { addDays, differenceInCalendarDays } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CALENDAR_MONTH_GRID_RESERVED_DAY_HEIGHT,
  formatAPIDate,
  formatAPIDateInTimeZone,
  parseAPIDate,
} from "@orbit/shared/utils";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";
import { Text, View } from "react-native";

import CalendarScreen from "@/app/(tabs)/calendar";
import { SafeAreaView } from 'react-native-safe-area-context'
import { ListRow } from '@/components/ui/list-row'
import { sheetTestControls } from '@/__tests__/support/sheet-double'

const TestRenderer = require("react-test-renderer");
type CalendarGridComponent = typeof import("@/app/(tabs)/calendar/_components/calendar-grid")["CalendarGrid"];

const MOCK_ACCOUNT_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

function getMockAccountDateKey(): string {
  return formatAPIDateInTimeZone(new Date(), MOCK_ACCOUNT_TIME_ZONE);
}

const state = vi.hoisted(() => ({
  rangeMap: new Map<string, CalendarDayEntry[]>(),
  rangeLoading: false,
  monthMap: new Map<string, CalendarDayEntry[]>(),
  monthLoading: false,
  monthError: null as string | null,
  monthRefresh: () => {},
  profile: undefined as {
    weekStartDay: 0 | 1;
    timeZone: string | null;
    hasProAccess: boolean;
  } | undefined,
  profileError: null as Error | null,
  profileRefetch: vi.fn(),
  calendarDataCalls: vi.fn(),
  calendarEvents: [] as Record<string, unknown>[],
  calendarEventsNotConnected: false,
  calendarEventsEnabled: undefined as boolean | undefined,
  calendarEventsTimeZone: undefined as string | null | undefined,
  calendarEventsPending: false,
  calendarEventsError: null as Error | null,
  calendarEventsRefetch: vi.fn(),
  calendarRangeCalls: vi.fn(),
  routerPush: vi.fn(),
  setShowCreateModal: vi.fn(),
}));

const calendarGridProps = vi.hoisted(() => ({
  actual: null as CalendarGridComponent | null,
  current: null as Record<string, any> | null,
  header: null as Record<string, any> | null,
  stats: null as Record<string, any> | null,
}));

const calendarDayDetailProps = vi.hoisted(() => ({
  current: null as Record<string, any> | null,
}));

const calendarStatsProps = vi.hoisted(() => ({
  current: null as {
    stats: readonly { key: string; value: string | number }[];
    state?: "default" | "loading" | "empty";
  } | null,
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
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: "en" },
  }),
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

vi.mock("@/hooks/use-calendar-events", () => ({
  useCalendarEvents: (options?: { enabled?: boolean; timeZone?: string | null }) => {
    state.calendarEventsEnabled = options?.enabled;
    state.calendarEventsTimeZone = options?.timeZone;
    return {
      data: state.calendarEventsNotConnected
        ? { status: "not-connected" }
        : { status: "connected", events: state.calendarEvents },
      isPending: state.calendarEventsPending,
      error: state.calendarEventsError,
      refetch: state.calendarEventsRefetch,
    };
  },
}));

vi.mock("@/hooks/use-tour-target", () => ({ useTourTarget: () => {} }));

vi.mock("@/hooks/use-tour-scroll-container", () => ({
  useTourScrollContainer: () => ({ onTourScroll: () => {} }),
}));

vi.mock("@/hooks/use-horizontal-swipe", () => ({
  useHorizontalSwipe: ({
    onSwipeLeft,
    onSwipeRight,
    minDistance = 50,
  }: {
    onSwipeLeft: () => void;
    onSwipeRight: () => void;
    minDistance?: number;
  }) => ({
    fire(deltaX: number, deltaY = 0) {
      if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
      if (Math.abs(deltaX) <= minDistance) return;
      if (deltaX < 0) onSwipeLeft();
      else onSwipeRight();
    },
  }),
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
  useCalendarRange: (start: Date, end: Date, enabled: boolean) => {
    state.calendarRangeCalls(start, end, enabled);
    return {
      dayMap: state.rangeMap,
      isLoading: state.rangeLoading,
      isFetching: false,
      error: null,
      refresh: vi.fn(),
    };
  },
  useLogHabit: () => ({ mutate: vi.fn() }),
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
vi.mock("@/app/(tabs)/calendar/_components/calendar-grid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/(tabs)/calendar/_components/calendar-grid")>();
  calendarGridProps.actual = actual.CalendarGrid;
  return {
    CalendarGrid: (props: Record<string, any>) => {
      calendarGridProps.current = props;
      return null;
    },
  };
});
vi.mock("@/app/(tabs)/calendar/_components/calendar-stats", () => ({
  CalendarStats: (props: Record<string, any>) => {
    calendarGridProps.stats = props;
    const stats = props.stats as readonly { key: string; value: string | number }[];
    calendarStatsProps.current = {
      stats,
      state: props.state as "default" | "loading" | "empty" | undefined,
    };
    return (
      <View testID="calendar-stats">
        {stats.map((stat) => <Text key={stat.key}>{`${stat.key}:${stat.value}`}</Text>)}
      </View>
    );
  },
}));
vi.mock("@/app/(tabs)/calendar/_components/calendar-day-detail", () => ({
  CalendarDayDetail: (props: Record<string, any>) => {
    calendarDayDetailProps.current = props;
    return React.createElement("Pressable", {
      accessibilityRole: "switch",
      accessibilityLabel: "calendar.showRecurring",
      accessibilityState: { checked: props.showRecurring },
      onPress: () => props.onShowRecurringChange(!props.showRecurring),
    });
  },
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

function openSelectedDay(
  tree: Tree,
  selectedDay: string,
): import("react-test-renderer").ReactTestRenderer {
  const headerTree = renderMonthHeader(tree);
  TestRenderer.act(() => {
    calendarGridProps.current!.onSelectDay(selectedDay);
  });
  return headerTree;
}

function renderMonthFooter(tree: Tree): import("react-test-renderer").ReactTestRenderer {
  const flatList = tree.root.findAll(
    (node) => typeof node.type === "string" && node.type === "FlatList",
  )[0];
  let footerTree!: import("react-test-renderer").ReactTestRenderer;
  TestRenderer.act(() => {
    footerTree = TestRenderer.create(flatList!.props.ListFooterComponent);
  });
  return footerTree;
}

function setBoundaryEntries(firstDay: string, secondDay: string) {
  state.monthMap = new Map([
    [firstDay, [makeEntry({ habitId: "first", status: "completed" })]],
    [
      secondDay,
      [
        makeEntry({ habitId: "second", status: "completed" }),
        makeEntry({ habitId: "missed", status: "upcoming" }),
      ],
    ],
  ]);
}

describe("CalendarScreen views (mobile)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T12:00:00.000Z"));
    calendarGridProps.current = null;
    calendarDayDetailProps.current = null;
    calendarGridProps.header = null;
    calendarGridProps.stats = null;
    state.monthMap = new Map();
    state.rangeLoading = false;
    state.monthLoading = false;
    state.monthError = null;
    state.monthRefresh = () => {};
    state.profile = { weekStartDay: 1, timeZone: MOCK_ACCOUNT_TIME_ZONE, hasProAccess: false };
    state.profileError = null;
    state.profileRefetch = vi.fn();
    state.calendarDataCalls.mockClear();
    state.calendarEvents = [];
    state.calendarEventsNotConnected = false;
    state.calendarEventsEnabled = undefined;
    state.calendarEventsTimeZone = undefined;
    state.calendarEventsPending = false;
    state.calendarEventsError = null;
    state.calendarEventsRefetch = vi.fn();
    state.routerPush.mockClear();
    state.calendarRangeCalls.mockClear();
    state.rangeLoading = false;
    calendarStatsProps.current = null;
    state.routerPush.mockClear();
    state.setShowCreateModal.mockClear();
    const todayStr = getMockAccountDateKey();
    state.monthMap = new Map();
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

  afterEach(() => {
    sheetTestControls.defer(false);
    vi.useRealTimers();
  });
  it('leaves the top safe area to the shell', () => {
    let tree!: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />) })
    const safeAreas = tree.root.findAll((node) => node.type === SafeAreaView)
    expect(safeAreas.length).toBeGreaterThan(0)
    for (const safeArea of safeAreas) expect(safeArea.props.edges).toEqual(['left', 'right', 'bottom'])
    TestRenderer.act(() => tree.update(<></>))
  })

  it("renders the agenda at phone width without folding it back to month", () => {
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
    expect(segments).toHaveLength(4);
    expect(
      segments.find(
        (segment) => segment.props.testID === "segment-month-selected-enabled",
      )?.props.accessibilityState?.checked,
    ).toBe(true);
    expect(
      segments.some(
        (segment) => segment.props.testID === "segment-agenda-unselected-enabled",
      ),
    ).toBe(true);

    const flatLists = tree!.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    );
    let headerTree!: import("react-test-renderer").ReactTestRenderer;
    TestRenderer.act(() => {
      headerTree = TestRenderer.create(flatLists[0]!.props.ListHeaderComponent);
    });
    expect(calendarGridProps.current?.selectedDay).toBe(formatAPIDate(new Date()));
    TestRenderer.act(() => headerTree.update(<></>));

    pressView(tree!, "agenda");
    expect(
      tree!.root.findAll(
        (node) =>
          typeof node.type === "string" &&
          node.props.testID === "calendar-agenda-view",
      ),
    ).toHaveLength(1);
    expect(hostTexts(tree!).some((text) => String(text).startsWith("calendar.agenda.today,"))).toBe(true);
    const agendaRows = tree!.root.findAll((node) => node.type === ListRow);
    expect(agendaRows).toHaveLength(2);
    expect(
      tree!.root.findAll(
        (node) =>
          typeof node.type === "string" &&
          node.props.accessibilityRole === "header",
      ),
    ).toHaveLength(7);
    for (const row of agendaRows) {
      expect(row.props.readOnly).toBe(true);
      expect(row.props.wrapTitle).toBe(true);
      expect(row.props.onPress).toBeUndefined();
      expect(row.props.onClick).toBeUndefined();
    }
  });

  it("renders agenda placeholders instead of empty-day copy while loading", () => {
    state.rangeMap = new Map();
    state.rangeLoading = true;
    let tree!: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });

    pressView(tree, "agenda");

    expect(
      tree.root.findAll(
        (node) =>
          typeof node.type === "string" &&
          node.props.testID === "calendar-agenda-loading-day",
      ),
    ).toHaveLength(7);
    expect(hostTexts(tree)).not.toContain("calendar.agenda.empty");
    TestRenderer.act(() => tree.update(<></>));
  });

  it("passes only the selected day's Google events to the day detail", () => {
    state.profile = { weekStartDay: 1, timeZone: "UTC", hasProAccess: true };
    const selectedDay = formatAPIDate(new Date());
    state.calendarEvents = [
      {
        id: "selected-event",
        title: "Team meeting",
        description: null,
        startDate: selectedDay,
        startTime: "09:00",
        endTime: null,
        isRecurring: false,
        recurrenceRule: null,
        reminders: [],
      },
      {
        id: "other-event",
        title: "Tomorrow",
        description: null,
        startDate: "2099-01-01",
        startTime: "10:00",
        endTime: null,
        isRecurring: false,
        recurrenceRule: null,
        reminders: [],
      },
    ];

    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });
    const headerTree = openSelectedDay(tree!, selectedDay);

    expect(
      calendarDayDetailProps.current?.calendarEvents.map(
        (event: { id: string }) => event.id,
      ),
    ).toEqual(["selected-event"]);
    expect(state.calendarEventsTimeZone).toBe("UTC");
    TestRenderer.act(() => headerTree.update(<></>));
    TestRenderer.act(() => (tree as unknown as import("react-test-renderer").ReactTestRenderer).update(<></>));
  });

  it("passes a failed Google events query to the selected-day panel", () => {
    state.profile = { weekStartDay: 1, timeZone: "UTC", hasProAccess: true };
    state.calendarEventsError = new Error("calendar events unavailable");
    let tree!: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });
    const headerTree = openSelectedDay(tree, formatAPIDate(new Date()));

    expect(calendarDayDetailProps.current?.calendarEventsState).toBe("failed");
    TestRenderer.act(() => {
      calendarDayDetailProps.current?.onRetryCalendarEvents();
    });
    expect(state.calendarEventsRefetch).toHaveBeenCalledTimes(1);
    TestRenderer.act(() => headerTree.update(<></>));
    TestRenderer.act(() => tree.update(<></>));
  });

  it("passes a revoked Google authorization to the selected-day panel", () => {
    sheetTestControls.defer(true);
    state.profile = { weekStartDay: 1, timeZone: "UTC", hasProAccess: true };
    state.calendarEventsNotConnected = true;
    let tree!: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });
    const headerTree = openSelectedDay(tree, formatAPIDate(new Date()));

    expect(calendarDayDetailProps.current?.calendarEventsState).toBe("not-connected");
    expect(calendarDayDetailProps.current?.calendarEvents).toEqual([]);
    TestRenderer.act(() => {
      calendarDayDetailProps.current?.onReconnectCalendarEvents();
    });
    expect(state.routerPush).not.toHaveBeenCalled();
    expect(sheetTestControls.isDismissPending).toBe(true);
    TestRenderer.act(() => {
      sheetTestControls.completeDismissal();
    });
    expect(state.routerPush).toHaveBeenCalledWith("/calendar-sync");
    TestRenderer.act(() => headerTree.update(<></>));
    TestRenderer.act(() => tree.update(<></>));
  });

  it("passes a resolved empty Google events query as ready", () => {
    state.profile = { weekStartDay: 1, timeZone: "UTC", hasProAccess: true };
    let tree!: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });
    const headerTree = openSelectedDay(tree, formatAPIDate(new Date()));

    expect(calendarDayDetailProps.current?.calendarEventsState).toBe("ready");
    expect(calendarDayDetailProps.current?.calendarEvents).toEqual([]);
    TestRenderer.act(() => headerTree.update(<></>));
    TestRenderer.act(() => tree.update(<></>));
  });

  it("does not enable the calendar event request for a free profile", () => {
    sheetTestControls.defer(true);
    state.calendarEvents = [
      {
        id: "retained-event",
        title: "Retained meeting",
        description: null,
        startDate: formatAPIDate(new Date()),
        startTime: "09:00",
        endTime: null,
        isRecurring: false,
        recurrenceRule: null,
        reminders: [],
      },
    ];
    let tree!: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });
    const headerTree = openSelectedDay(tree, formatAPIDate(new Date()));

    expect(state.calendarEventsEnabled).toBe(false);
    expect(calendarDayDetailProps.current?.calendarEvents).toEqual([]);
    expect(calendarDayDetailProps.current?.calendarEventsState).toBe("pro-boundary");
    TestRenderer.act(() => {
      calendarDayDetailProps.current?.onViewPro();
    });
    expect(state.routerPush).not.toHaveBeenCalled();
    expect(sheetTestControls.isDismissPending).toBe(true);
    TestRenderer.act(() => {
      sheetTestControls.completeDismissal();
    });
    expect(state.routerPush).toHaveBeenCalledWith("/upgrade");
    TestRenderer.act(() => headerTree.update(<></>));
    TestRenderer.act(() => tree.update(<></>));
  });

  it("uses UTC when the mounted screen has a nullable account timezone", () => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = "America/Sao_Paulo";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T01:30:00.000Z"));
    state.profile = { weekStartDay: 1, timeZone: null, hasProAccess: false };
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
    state.profile = { weekStartDay: 1, timeZone: "Pacific/Kiritimati", hasProAccess: false };
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
    state.profile = { weekStartDay: 1, timeZone: "Pacific/Kiritimati", hasProAccess: false };
    let tree!: Tree;
    let headerTree!: import("react-test-renderer").ReactTestRenderer;
    try {
      TestRenderer.act(() => {
        tree = TestRenderer.create(<CalendarScreen />);
      });
      headerTree = renderMonthHeader(tree);
      expect(calendarGridProps.current?.todayKey).toBe("2026-09-12");

      state.profile = { weekStartDay: 1, timeZone: "America/Los_Angeles", hasProAccess: false };
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

  it.each([
    {
      name: "device date is one day ahead",
      deviceTimeZone: "Pacific/Kiritimati",
      accountTimeZone: "America/Los_Angeles",
      now: "2026-09-12T10:30:00.000Z",
      firstDay: "2026-09-12",
      secondDay: "2026-09-13",
      expected: ["bestStreak:1", "totalLogs:1", "missed:0"],
    },
    {
      name: "device date is one day behind",
      deviceTimeZone: "America/Los_Angeles",
      accountTimeZone: "UTC",
      now: "2026-09-12T00:30:00.000Z",
      firstDay: "2026-09-11",
      secondDay: "2026-09-12",
      expected: ["bestStreak:2", "totalLogs:2", "missed:1"],
    },
  ])("renders statistics through the account date when $name", ({
    deviceTimeZone,
    accountTimeZone,
    now,
    firstDay,
    secondDay,
    expected,
  }) => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = deviceTimeZone;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    state.profile = { weekStartDay: 1, timeZone: accountTimeZone, hasProAccess: false };
    setBoundaryEntries(firstDay, secondDay);
    let tree!: Tree;
    let footerTree!: import("react-test-renderer").ReactTestRenderer;
    try {
      TestRenderer.act(() => {
        tree = TestRenderer.create(<CalendarScreen />);
      });
      footerTree = renderMonthFooter(tree);

      for (const figure of expected) expect(hostTexts(footerTree)).toContain(figure);
    } finally {
      TestRenderer.act(() => footerTree.update(<></>));
      TestRenderer.act(() => tree.update(<></>));
      vi.useRealTimers();
      if (originalTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimeZone;
    }
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
      expect.objectContaining({ width: 332, height: 284 }),
    ]));
  });

  it.each([
    ['Monday-first five-row', new Date(2026, 8, 11), 1, 5],
    ['Monday-first six-row', new Date(2026, 7, 11), 1, 6],
    ['Sunday-first six-row', new Date(2026, 4, 11), 0, 6],
  ] as const)('keeps the %s profile-loading grid at the loaded month height', (_label, now, weekStartDay, expectedRows) => {
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

    state.profile = { weekStartDay, timeZone: "UTC", hasProAccess: false };
    TestRenderer.act(() => { tree.update(<CalendarScreen />); });
    const flatList = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.type === 'FlatList',
    )[0]!;
    TestRenderer.act(() => { TestRenderer.create(flatList.props.ListHeaderComponent); });
    const loadedRows = (calendarGridProps.current?.gridDays as unknown[]).length / 7;
    const ActualCalendarGrid = calendarGridProps.actual!;
    let gridTree!: import('react-test-renderer').ReactTestRenderer;
    TestRenderer.act(() => {
      gridTree = TestRenderer.create(
        <ActualCalendarGrid
          {...(calendarGridProps.current! as React.ComponentProps<CalendarGridComponent>)}
        />,
      );
    });
    const loadedDayGrid = gridTree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === 'month-grid-days',
    )[0]!;
    const loadedHeight = (loadedDayGrid.props.style as { minHeight: number }).minHeight;

    expect(loadedRows).toBe(expectedRows);
    expect(loadingHeight).toBe(loadedHeight);
    expect(loadedHeight).toBe(CALENDAR_MONTH_GRID_RESERVED_DAY_HEIGHT);
    TestRenderer.act(() => gridTree.update(<></>));
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T12:00:00.000Z"));
    state.rangeMap = new Map([
      [
        getMockAccountDateKey(),
        [
          makeEntry({ habitId: "r", title: "Recurring", isOneTime: false }),
          makeEntry({ habitId: "o", title: "OneTime", isOneTime: true }),
        ],
      ],
    ]);
    let tree!: Tree;
    try {
      TestRenderer.act(() => {
        tree = TestRenderer.create(<CalendarScreen />);
      });

      pressView(tree, "week");
      expect(hostTexts(tree)).toContain("Recurring");

      const switches = tree.root.findAll(
        (node) =>
          typeof node.type === "string" &&
          node.props.accessibilityRole === "switch",
      );
      expect(switches.length).toBeGreaterThan(0);
      TestRenderer.act(() => {
        switches[0]!.props.onPress();
      });

      expect(hostTexts(tree)).not.toContain("Recurring");
      expect(hostTexts(tree)).toContain("OneTime");

      pressView(tree, "agenda");
      expect(hostTexts(tree)).toContain("Recurring");
      expect(hostTexts(tree)).toContain("OneTime");
    } finally {
      TestRenderer.act(() => tree.update(<></>));
      vi.useRealTimers();
    }
  });

  it("removes recurring habits from the month and shows its honest empty state", () => {
    const todayStr = getMockAccountDateKey();
    state.monthMap = new Map([[todayStr, [
      makeEntry({ habitId: "r", title: "Recurring", isOneTime: false }),
    ]]]);
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });
    const flatList = tree!.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    )[0]!;
    let headerTree!: import("react-test-renderer").ReactTestRenderer;
    TestRenderer.act(() => {
      headerTree = TestRenderer.create(flatList.props.ListHeaderComponent);
    });

    expect(tree!.root.findAll(
      (node) => typeof node.type === "string" && node.props.accessibilityRole === "switch",
    )).toHaveLength(0);
    const switches = headerTree.root.findAll(
      (node) => typeof node.type === "string" && node.props.accessibilityRole === "switch",
    );
    expect(switches).toHaveLength(1);

    let initialFooterTree!: Tree;
    TestRenderer.act(() => {
      initialFooterTree = TestRenderer.create(flatList.props.ListFooterComponent);
    });
    expect(initialFooterTree.root.findAll(
      (node) => typeof node.type === "string" && node.props.testID === "calendar-stats",
    )).toHaveLength(1);

    TestRenderer.act(() => {
      (switches[0]!.props as { onPress: () => void }).onPress();
    });

    const updatedFlatList = tree!.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    )[0]!;
    TestRenderer.act(() => {
      headerTree.update(updatedFlatList.props.ListHeaderComponent);
    });
    expect(calendarGridProps.current?.gridDays.find(
      (day: { dateStr: string }) => day.dateStr === todayStr,
    )?.totalCount).toBe(0);
    let updatedFooterTree!: Tree;
    TestRenderer.act(() => {
      updatedFooterTree = TestRenderer.create(updatedFlatList.props.ListFooterComponent);
    });
    expect(updatedFooterTree.root.findAll(
      (node) => typeof node.type === "string" && node.props.testID === "calendar-stats",
    )).toHaveLength(1);
    expect(calendarGridProps.stats?.state).toBe("empty");
    expect(hostTexts(headerTree)).toContain("calendar.emptyMonth");
  });

  it("matches web by paging a 61px by 45px drag after the 60px boundary", () => {
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });
    const flatList = tree!.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    )[0]!;
    let headerTree!: import("react-test-renderer").ReactTestRenderer;
    TestRenderer.act(() => {
      headerTree = TestRenderer.create(flatList.props.ListHeaderComponent);
    });
    const initialMonth = state.calendarDataCalls.mock.calls.at(-1)?.[0] as Date;
    const initialCallCount = state.calendarDataCalls.mock.calls.length;
    const swipeGesture = calendarGridProps.current?.swipeGesture;

    TestRenderer.act(() => swipeGesture.fire(-59));
    expect(state.calendarDataCalls).toHaveBeenCalledTimes(initialCallCount);

    TestRenderer.act(() => swipeGesture.fire(-61, 45));
    expect((state.calendarDataCalls.mock.calls.at(-1)?.[0] as Date).getMonth())
      .toBe((initialMonth.getMonth() + 1) % 12);

    TestRenderer.act(() => swipeGesture.fire(61, 45));
    expect((state.calendarDataCalls.mock.calls.at(-1)?.[0] as Date).getMonth())
      .toBe(initialMonth.getMonth());
  });

  it("states a fourteen-day span and pages by the whole span", () => {
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });

    pressView(tree!, "range");

    expect(hostTexts(tree!).some((text) =>
      typeof text === "string" && text.startsWith("calendar.range.label:") && text.includes('"start"') && text.includes('"end"'),
    )).toBe(true);
    const beforePage = state.calendarRangeCalls.mock.calls.at(-1)!;
    const previous = tree!.root.findAll(
      (node) =>
        typeof node.type === "string" &&
        node.props.accessibilityRole === "button" &&
        node.props.accessibilityLabel === "calendar.range.previous",
    )[0]!;
    TestRenderer.act(() => previous.props.onPress());
    const afterPage = state.calendarRangeCalls.mock.calls.at(-1)!;
    expect(differenceInCalendarDays(beforePage[1], beforePage[0])).toBe(13);
    expect(differenceInCalendarDays(beforePage[1], afterPage[1])).toBe(14);
  });

  it("renders fourteen range days as read-only cells with span figures", () => {
    const today = parseAPIDate(getMockAccountDateKey());
    state.rangeMap = new Map([
      [formatAPIDate(addDays(today, -1)), [makeEntry({ status: "completed" })]],
      [formatAPIDate(today), [makeEntry({ status: "missed" })]],
    ]);
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });

    pressView(tree!, "range");
    const rangeDays = tree!.root.findAll(
      (node) =>
        typeof node.type === "string" &&
        typeof node.props.testID === "string" &&
        node.props.testID.startsWith("day-cell-"),
    );
    expect(rangeDays).toHaveLength(14);
    for (const day of rangeDays) {
      expect(day.props.accessibilityRole).toBe("image");
      expect(day.props.onPress).toBeUndefined();
    }
    expect(calendarStatsProps.current?.stats.map((stat) => stat.value)).toEqual([1, 1, 1]);
  });

  it("keeps the pending range busy without exposing empty outcomes, then reveals the resolved span", () => {
    state.rangeLoading = true;
    let tree!: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });

    pressView(tree, "range");
    const loadingGrid = tree.root.findAll(
      (node) =>
        typeof node.type === "string" &&
        node.props.testID === "skeleton-unit-grid" &&
        node.props.accessibilityRole === "progressbar",
    );
    expect(loadingGrid).toHaveLength(1);
    expect(loadingGrid[0]!.props.accessibilityRole).toBe("progressbar");
    expect(loadingGrid[0]!.props.accessibilityState).toEqual({ busy: true });
    expect(tree.root.findAll(
      (node) => typeof node.type === "string" && typeof node.props.testID === "string" && node.props.testID.startsWith("day-cell-"),
    )).toHaveLength(0);
    expect(calendarStatsProps.current?.state).toBe("loading");

    state.rangeLoading = false;
    TestRenderer.act(() => {
      tree.update(<CalendarScreen />);
    });

    expect(tree.root.findAll(
      (node) => typeof node.type === "string" && node.props.testID === "skeleton-unit-grid",
    )).toHaveLength(0);
    expect(tree.root.findAll(
      (node) => typeof node.type === "string" && typeof node.props.testID === "string" && node.props.testID.startsWith("day-cell-"),
    )).toHaveLength(14);
    expect(calendarStatsProps.current?.state ?? "default").toBe("default");
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
    state.monthMap = new Map([[getMockAccountDateKey(), [makeEntry({})]]]);
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
