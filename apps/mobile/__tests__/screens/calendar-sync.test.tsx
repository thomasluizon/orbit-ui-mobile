import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockProfile } from "@orbit/shared/__tests__/factories";

import CalendarSyncScreen from "@/app/calendar-sync";

const TestRenderer = require("react-test-renderer");

type TestNode = {
  props: Record<string, unknown>;
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[];
};

const colorProxy: any = new Proxy(
  {},
  {
    get: (_target, prop) => (prop === "white" ? "#ffffff" : "#111111"),
  },
);

const mocks = vi.hoisted(() => {
  const queryClient = {
    invalidateQueries: vi.fn(async () => {}),
  };

  return {
    apiClient: vi.fn(),
    queryClient,
    eventsQuery: {
      data: { status: "connected", events: [] } as
        | { status: "connected"; events: unknown[] }
        | { status: "not-connected" }
        | undefined,
      isLoading: false,
      isError: false,
      error: null as Error | null,
      refetch: vi.fn(),
    },
    router: {
      push: vi.fn(),
      replace: vi.fn(),
    },
    profile: null as ReturnType<typeof createMockProfile> | null,
    searchParams: {} as { mode?: string },
    suggestions: [] as unknown[],
    isOnline: true,
    bulkMutateAsync: vi.fn(),
    dismissMutateAsync: vi.fn(),
    showError: vi.fn(),
  };
});

vi.mock("expo-router", async () => {
  const React = await import("react");

  return {
    useRouter: () => mocks.router,
    useLocalSearchParams: () => mocks.searchParams,
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => callback(), [callback]);
    },
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}(${JSON.stringify(params)})` : key,
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => mocks.queryClient,
}));

vi.mock("@/hooks/use-profile", () => ({
  useProfile: () => ({
    profile: mocks.profile,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-habits", () => ({
  useBulkCreateHabits: () => ({
    mutateAsync: mocks.bulkMutateAsync,
  }),
}));

vi.mock("@/hooks/use-calendar-auto-sync", () => ({
  useCalendarAutoSyncState: () => ({
    data: {
      enabled: false,
      status: "Idle",
      lastSyncedAt: null,
      hasGoogleConnection: true,
    },
    isLoading: false,
  }),
  useCalendarSyncSuggestions: () => ({
    data: mocks.suggestions,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useSetCalendarAutoSync: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useRunCalendarSyncNow: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useDismissCalendarSuggestion: () => ({
    mutateAsync: mocks.dismissMutateAsync,
    isPending: false,
  }),
}));

vi.mock("@/hooks/use-calendar-events", () => ({
  useCalendarEvents: () => mocks.eventsQuery,
}));

vi.mock("@/hooks/use-calendars", () => ({
  useCalendars: () => ({ data: [], isLoading: false, isError: false }),
  useSetSelectedCalendars: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: mocks.apiClient,
}));

vi.mock("@/lib/google-auth", () => ({
  startMobileGoogleAuth: vi.fn(),
}));

const tokensV2Proxy: any = new Proxy(
  {},
  {
    get: (_target, prop) => (prop === "fgOnPrimary" ? "#ffffff" : "#111111"),
  },
);

vi.mock("@/lib/use-app-theme", () => ({
  useAppTheme: () => ({
    colors: colorProxy,
    currentScheme: "purple",
    currentTheme: "dark",
  }),
}));

vi.mock("@/lib/theme", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createColors: () => colorProxy,
    createTokensV2: () => tokensV2Proxy,
  };
});

vi.mock("@/hooks/use-offline", () => ({
  useOffline: () => ({
    isOnline: mocks.isOnline,
  }),
}));

vi.mock("@/hooks/use-app-toast", () => ({
  useAppToast: () => ({
    showError: mocks.showError,
  }),
}));

vi.mock("@/components/ui/offline-unavailable-state", () => ({
  OfflineUnavailableState: () => null,
}));

vi.mock('@/components/ui/icons', () => {
  const createIcon = (name: string) => (props: any) =>
    React.createElement(name, props);

  return {
    AlertTriangle: createIcon("AlertTriangle"),
    ArrowLeft: createIcon("ArrowLeft"),
    Bell: createIcon("Bell"),
    CalendarDays: createIcon("CalendarDays"),
    Check: createIcon("Check"),
    ChevronLeft: createIcon("ChevronLeft"),
    ChevronRight: createIcon("ChevronRight"),
    Link: createIcon("Link"),
    Loader2: createIcon("Loader2"),
    RefreshCw: createIcon("RefreshCw"),
    WifiOff: createIcon("WifiOff"),
    X: createIcon("X"),
  };
});

vi.mock("@/components/ui/app-bar", () => ({
  AppBar: () => null,
}));

vi.mock("@/components/ui/section-label", () => ({
  SectionLabel: ({ children }: { children?: unknown }) => React.createElement("SectionLabel", null, children as never),
}));

vi.mock("@/components/ui/settings-row", () => ({
  SettingsRow: ({ label, accessory }: { label: string; accessory?: string }) =>
    React.createElement("SettingsRow", { accessory }, label),
  Switch: () => null,
}));

vi.mock("@/components/ui/select-check", () => ({
  SelectCheck: () => null,
  RadioGlyph: () => null,
}));

vi.mock("@/components/ui/pill-button", () => ({
  PillButton: ({
    children,
    onPress,
    disabled,
  }: {
    children?: unknown;
    onPress?: () => void;
    disabled?: boolean;
  }) => React.createElement("PillButton", { onPress, disabled }, children as never),
}));

vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native")>();
  return {
    ...actual,
    Switch: (props: Record<string, unknown>) =>
      React.createElement("Switch", props),
  };
});

describe("CalendarSyncScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile = createMockProfile({ hasProAccess: true });
    mocks.apiClient.mockResolvedValue([]);
    mocks.eventsQuery.data = { status: "connected", events: [] };
    mocks.eventsQuery.isLoading = false;
    mocks.eventsQuery.isError = false;
    mocks.eventsQuery.error = null;
    mocks.searchParams = {};
    mocks.suggestions = [];
    mocks.isOnline = true;
    mocks.bulkMutateAsync.mockReset();
    mocks.dismissMutateAsync.mockReset();
  });

  it("refetches calendar events through the cached query once the screen settles", async () => {
    await TestRenderer.act(async () => {
      TestRenderer.create(<CalendarSyncScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.eventsQuery.refetch).toHaveBeenCalledTimes(1);
  });

  it("replaces to upgrade instead of pushing when a free user opens the screen", async () => {
    mocks.profile = createMockProfile({ hasProAccess: false });

    await TestRenderer.act(async () => {
      TestRenderer.create(<CalendarSyncScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.router.replace).toHaveBeenCalledWith("/upgrade");
    expect(mocks.router.push).not.toHaveBeenCalledWith("/upgrade");
    expect(mocks.eventsQuery.refetch).not.toHaveBeenCalled();
  });

  function buildEvents(count: number) {
    return Array.from({ length: count }, (_value, index) => ({
      id: `ev-${index}`,
      title: `Event ${index}`,
      description: null,
      startDate: "2026-07-01",
      startTime: null,
      endTime: null,
      isRecurring: false,
      recurrenceRule: null,
      reminders: [],
      calendarName: "Work",
    }));
  }

  function countEventTitles(root: {
    findAll: (
      predicate: (node: { props: Record<string, unknown>; type?: unknown }) => boolean,
    ) => unknown[];
  }) {
    return root.findAll(
      (node) =>
        typeof node.type === "string" && /^Event \d+$/.test(String(node.props.children)),
    ).length;
  }

  function findShowMore(root: {
    findAll: (predicate: (node: { props: Record<string, unknown> }) => boolean) => {
      props: Record<string, unknown>;
    }[];
  }) {
    return root.findAll((node) => node.props.children === "calendar.showMore");
  }

  it("renders only the first page of events and reveals more on demand", async () => {
    mocks.eventsQuery.data = { status: "connected", events: buildEvents(45) };

    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CalendarSyncScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(countEventTitles(tree.root)).toBe(20);

    const showMore = findShowMore(tree.root);
    expect(showMore.length).toBeGreaterThan(0);

    const pressable = tree.root.find(
      (node: TestNode) =>
        node.props.accessibilityRole === "button" &&
        typeof node.props.onPress === "function" &&
        node.findAll((child: TestNode) =>
          child.props.children === "calendar.showMore",
        ).length > 0,
    );

    await TestRenderer.act(async () => {
      (pressable.props.onPress as () => void)();
      await Promise.resolve();
    });

    expect(countEventTitles(tree.root)).toBe(40);
  });

  it("does not show the pager when events fit on one page", async () => {
    mocks.eventsQuery.data = { status: "connected", events: buildEvents(8) };

    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CalendarSyncScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(countEventTitles(tree.root)).toBe(8);
    expect(findShowMore(tree.root)).toHaveLength(0);
  });

  it("shows the source calendar name in each event's meta", async () => {
    mocks.eventsQuery.data = { status: "connected", events: buildEvents(1) };

    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CalendarSyncScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const metaNodes = tree.root.findAll(
      (node: { props: Record<string, unknown> }) =>
        typeof node.props.children === "string" &&
        (node.props.children as string).includes("Work"),
    );
    expect(metaNodes.length).toBeGreaterThan(0);
  });

  it("shows the offline state without a retry chip when disconnected", async () => {
    mocks.isOnline = false;

    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CalendarSyncScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      tree.root.findAll(
        (node: TestNode) => node.props.children === "offline.title",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAll(
        (node: TestNode) => node.props.children === "offline.description",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAll(
        (node: TestNode) => node.props.children === "calendar.retry",
      ),
    ).toHaveLength(0);
  });

  it("dismisses a suggestion from the review list", async () => {
    mocks.searchParams = { mode: "review" };
    mocks.suggestions = [{ id: "sug-0", event: buildEvents(1)[0] }];
    mocks.dismissMutateAsync.mockResolvedValue(undefined);

    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CalendarSyncScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const dismiss = tree.root.find(
      (node: TestNode) =>
        node.props.accessibilityLabel === "calendar.autoSync.dismissSuggestion" &&
        typeof node.props.onPress === "function",
    );

    await TestRenderer.act(async () => {
      (dismiss.props.onPress as () => void)();
      await Promise.resolve();
    });

    expect(mocks.dismissMutateAsync).toHaveBeenCalledWith({ id: "sug-0" });
  });

  it("lists imported habits on the done step and toasts partial failures", async () => {
    mocks.eventsQuery.data = { status: "connected", events: buildEvents(2) };
    mocks.bulkMutateAsync.mockResolvedValue({
      results: [
        { status: "Success", habitId: "h1", title: "Event 0", error: null },
        { status: "Failed", habitId: null, title: "Event 1", error: "boom" },
      ],
    });

    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CalendarSyncScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const importPill = tree.root.find(
      (node: TestNode) =>
        typeof node.props.onPress === "function" &&
        typeof node.props.children === "string" &&
        (node.props.children as string).includes("calendar.importButton"),
    );

    await TestRenderer.act(async () => {
      (importPill.props.onPress as () => void)();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.showError).toHaveBeenCalledWith(
      'calendar.importPartialFailure({"count":1})',
    );
    expect(
      tree.root.findAll(
        (node: TestNode) => node.props.children === "calendar.importDone",
      ).length,
    ).toBeGreaterThan(0);
    const doneRows = tree.root.findAll(
      (node: TestNode & { type?: unknown }) =>
        node.type === "SettingsRow" && node.props.children === "Event 0",
    );
    expect(doneRows).toHaveLength(1);
    expect(doneRows[0]!.props.accessory).toBe("none");
    expect(
      tree.root.findAll(
        (node: TestNode & { type?: unknown }) =>
          node.type === "SettingsRow" && node.props.children === "Event 1",
      ),
    ).toHaveLength(0);
  });
});
