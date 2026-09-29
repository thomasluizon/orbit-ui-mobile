import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockProfile } from "@orbit/shared/__tests__/factories";
import { ApiClientError } from "@orbit/shared";
import type { CalendarSyncEvent } from "@orbit/shared/utils";
import { calendarKeys } from '@orbit/shared/query';
import { Link as LinkIcon } from '@/components/ui/icons';
import { advanceAccountGeneration } from '@/lib/session-epoch';

import { CalendarImportContent, type CalendarImportActionHandle, type CalendarImportActionState } from "@/components/calendar-sync/calendar-import-content";
import { PillButton } from '@/components/ui/pill-button';
import { useTranslation } from 'react-i18next';
function CalendarSyncScreen() {
  const [action, setAction] = React.useState<CalendarImportActionState | null>(null);
  const actionRef = React.useRef<CalendarImportActionHandle>(null);
  const { t } = useTranslation();
  return <>
    <CalendarImportContent reviewMode={'mode' in mocks.searchParams && mocks.searchParams.mode === "review"} initialEventId={null} onClose={() => {}} onGoToHabits={() => {}} actionRef={actionRef} onActionStateChange={setAction} />
    {action ? <PillButton disabled={action.disabled} onClick={() => actionRef.current?.importSelected()}>{t('calendar.importButton', { count: action.count })}</PillButton> : null}
  </>;
}

const TestRenderer = require("react-test-renderer");

type TestNode = {
  props: Record<string, unknown>;
  type?: unknown;
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[];
};

type CalendarSyncTree = {
  root: TestNode & {
    find: (predicate: (node: TestNode) => boolean) => TestNode;
  };
  update: (element: React.ReactElement) => void;
};

const colorProxy: any = new Proxy(
  {},
  {
    get: (_target, prop) => (prop === "white" ? "#ffffff" : "#111111"),
  },
);

const mocks = vi.hoisted(() => {
  const events: CalendarSyncEvent[] = [];
  const initialEventsQueryData = (): { status: "connected"; events: CalendarSyncEvent[] } | { status: "not-connected" } =>
    ({ status: "connected", events });
  const queryClient = {
    invalidateQueries: vi.fn(async () => {}),
  };

  return {
    apiClient: vi.fn(),
    queryClient,
    eventsQuery: {
      data: initialEventsQueryData(),
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
    searchParams: {},
    suggestions: [] as unknown[],
    isOnline: true,
    hasGoogleConnection: true,
    bulkMutateAsync: vi.fn(),
    dismissMutateAsync: vi.fn(),
    setAutoSyncMutate: vi.fn(),
    runSyncNowMutate: vi.fn(),
    isSetPending: false,
    isRunPending: false,
    showError: vi.fn(),
    startGoogleAuth: vi.fn(),
    autoSyncStatus: "Idle",
    autoSyncError: false,
    refetchAutoSyncState: vi.fn(),
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
      status: mocks.autoSyncStatus,
      lastSyncedAt: null,
      hasGoogleConnection: mocks.hasGoogleConnection,
    },
    isLoading: false,
    isError: mocks.autoSyncError,
    refetch: mocks.refetchAutoSyncState,
  }),
  useCalendarSyncSuggestions: () => ({
    data: mocks.suggestions,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useSetCalendarAutoSync: () => ({
    mutate: mocks.setAutoSyncMutate,
    isPending: mocks.isSetPending,
  }),
  useRunCalendarSyncNow: () => ({
    mutate: mocks.runSyncNowMutate,
    isPending: mocks.isRunPending,
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
  startMobileGoogleAuth: mocks.startGoogleAuth,
}));

vi.mock("expo-web-browser", () => ({
  WebBrowserResultType: { CANCEL: "cancel", DISMISS: "dismiss" },
}));

const tokensV2Proxy: any = new Proxy(
  {},
  {
    get: (_target, prop) => prop === "fgOnPrimary" ? "#ffffff" : prop === 'primary' ? '#ff00ff' : "#111111",
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

vi.mock("@/components/ui/app-bar", () => ({
  AppBar: () => null,
}));

vi.mock("@/components/ui/section-label", () => ({
  SectionLabel: ({ children }: { children?: unknown }) => React.createElement("SectionLabel", null, children as never),
}));

vi.mock("@/components/ui/settings-row", () => ({
  SettingsRow: ({ label, accessory }: { label: string; accessory?: string }) =>
    React.createElement("SettingsRow", { accessory }, label),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ onToggle, accessibilityLabel }: { onToggle: () => void; accessibilityLabel: string }) =>
    React.createElement("Switch", { onPress: onToggle, accessibilityLabel }),
}));

vi.mock("@/components/ui/select-check", () => ({
  SelectCheck: () => null,
  RadioGlyph: () => null,
}));

vi.mock("@/components/ui/pill-button", () => ({
  PillButton: ({
    children,
    onClick,
    disabled,
  }: {
    children?: unknown;
    onClick?: () => void;
    disabled?: boolean;
  }) => React.createElement("PillButton", { onClick, disabled }, children as never),
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
    mocks.hasGoogleConnection = true;
    mocks.bulkMutateAsync.mockReset();
    mocks.dismissMutateAsync.mockReset();
    mocks.setAutoSyncMutate.mockReset();
    mocks.runSyncNowMutate.mockReset();
    mocks.startGoogleAuth.mockReset();
    mocks.autoSyncStatus = "Idle";
    mocks.autoSyncError = false;
    mocks.isSetPending = false;
    mocks.isRunPending = false;
  });

  it("refetches calendar events through the cached query once the screen settles", async () => {
    await TestRenderer.act(async () => {
      TestRenderer.create(<CalendarSyncScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.eventsQuery.refetch).toHaveBeenCalledTimes(1);
  });

  async function pressConnect() {
    let tree: CalendarSyncTree;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CalendarSyncScreen />) as CalendarSyncTree;
      await Promise.resolve();
    });
    const connect = tree!.root.find((node: TestNode) =>
      node.props.children === "auth.signInWithGoogle" && typeof node.props.onClick === "function");
    await TestRenderer.act(async () => {
      (connect.props.onClick as () => void)();
      await Promise.resolve();
    });
    return tree!;
  }

  it("starts calendar consent from the disconnected screen and opens the callback on success", async () => {
    mocks.eventsQuery.data = { status: "not-connected" };
    mocks.startGoogleAuth.mockResolvedValue({ type: "success", url: "https://app.useorbit.org/auth-callback?code=google-code" });

    const tree = await pressConnect();

    expect(mocks.startGoogleAuth).toHaveBeenCalledWith({ returnUrl: "/calendar?import=1", forceConsent: true });
    expect(tree.root.findAll((node) => node.type === 'Switch')).toHaveLength(0);
    const linkGlyph = tree.root.find((node) => node.type === LinkIcon);
    expect(linkGlyph.props.color).toBe('#111111');
    expect(mocks.router.replace).toHaveBeenCalledWith("/auth-callback");
    expect(mocks.router.replace).not.toHaveBeenCalledWith("/login?googleError=1");
  });

  it("shows retry when connection status fails instead of claiming disconnection", async () => {
    mocks.autoSyncError = true;
    mocks.hasGoogleConnection = false;
    let tree: CalendarSyncTree;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CalendarSyncScreen />) as CalendarSyncTree;
      await Promise.resolve();
    });

    expect(tree!.root.findAll((node) => node.props.children === "calendar.errorTitle")).not.toHaveLength(0);
    expect(tree!.root.findAll((node) => node.props.children === "calendar.notConnectedTitle")).toHaveLength(0);
    const retry = tree!.root.find((node) => node.props.children === "calendar.retry" && typeof node.props.onClick === "function");
    await TestRenderer.act(async () => {
      (retry.props.onClick as () => void)();
      await Promise.resolve();
    });
    expect(mocks.refetchAutoSyncState).toHaveBeenCalled();
  });

  it.each(["cancel", "dismiss"])("keeps the calendar open when consent returns %s", async (type) => {
    mocks.eventsQuery.data = { status: "not-connected" };
    mocks.startGoogleAuth.mockResolvedValue({ type });

    await pressConnect();

    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(mocks.showError).not.toHaveBeenCalled();
  });

  it("keeps the calendar open when Google declines consent in the redirect URL", async () => {
    mocks.eventsQuery.data = { status: "not-connected" };
    mocks.startGoogleAuth.mockResolvedValue({
      type: "denied",
      url: "https://app.useorbit.org/auth-callback?error=access_denied&state=oauth-state",
    });

    await pressConnect();

    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(mocks.showError).not.toHaveBeenCalled();
  });

  it("keeps the review return path and sends failed authorization to login", async () => {
    mocks.searchParams = { mode: "review" };
    mocks.hasGoogleConnection = false;
    mocks.autoSyncStatus = "ReconnectRequired";
    mocks.startGoogleAuth.mockRejectedValue(new Error("Google denied access"));

    let tree: CalendarSyncTree;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CalendarSyncScreen />) as CalendarSyncTree;
      await Promise.resolve();
    });
    const reconnect = tree!.root.find((node: TestNode) =>
      node.props.children === "auth.signInWithGoogle" && typeof node.props.onClick === "function");
    await TestRenderer.act(async () => {
      (reconnect.props.onClick as () => void)();
      await Promise.resolve();
    });

    expect(mocks.startGoogleAuth).toHaveBeenCalledWith({ returnUrl: "/calendar?mode=review", forceConsent: true });
    expect(mocks.router.replace).toHaveBeenCalledWith("/login?googleError=1");
    expect(mocks.router.replace).not.toHaveBeenCalledWith("/auth-callback");
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

    const deselect = tree.root.find(
      (node: TestNode) =>
        node.props.accessibilityLabel === "calendar.deselectAll" &&
        typeof node.props.onPress === "function",
    );
    TestRenderer.act(() => {
      (deselect.props.onPress as () => void)();
    });
    const select = tree.root.find(
      (node: TestNode) =>
        node.props.accessibilityLabel === "calendar.selectAll" &&
        typeof node.props.onPress === "function",
    );
    expect(select.props.accessibilityState).toEqual({ selected: false });
    TestRenderer.act(() => {
      (select.props.onPress as () => void)();
    });
    expect(
      tree.root.find(
        (node: TestNode) =>
          node.props.accessibilityLabel === "calendar.deselectAll" &&
          typeof node.props.onPress === "function",
      ).props.accessibilityState,
    ).toEqual({ selected: true });
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
        (node.props.children).includes("Work"),
    );
    expect(metaNodes.length).toBeGreaterThan(0);
  });

  it("shows text-bearing recovery when importing an event is blocked", async () => {
    mocks.eventsQuery.data = { status: "connected", events: buildEvents(1) };
    mocks.bulkMutateAsync.mockRejectedValue(new ApiClientError(403, "Forbidden"));

    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CalendarSyncScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const importPill = tree.root.find(
      (node: TestNode) =>
        typeof node.props.onClick === "function" &&
        typeof node.props.children === "string" &&
        node.props.children.includes("calendar.importButton"),
    );

    await TestRenderer.act(async () => {
      (importPill.props.onClick as () => void)();
      await Promise.resolve();
    });

    expect(mocks.bulkMutateAsync.mock.calls[0]?.[0].habits[0].title).toBe("Event 0");
    expect(tree.root.findAll(
      (node: TestNode) => node.props.children === "errors.api.edgeBlocked",
    ).length).toBeGreaterThan(0);
  });

  it("shows retry recovery when loading calendars is blocked", async () => {
    mocks.eventsQuery.isError = true;
    mocks.eventsQuery.error = new ApiClientError(403, "Forbidden");

    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CalendarSyncScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(tree.root.findAll(
      (node: TestNode) => node.props.children === "errors.api.edgeBlockedRetry",
    ).length).toBeGreaterThan(0);
  });

  it("shows text-bearing recovery when importing a review suggestion is blocked", async () => {
    mocks.searchParams = { mode: "review" };
    mocks.suggestions = [{ id: "suggestion-1", event: buildEvents(1)[0] }];
    mocks.bulkMutateAsync.mockRejectedValue(new ApiClientError(403, "Forbidden"));

    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CalendarSyncScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const importPill = tree.root.find(
      (node: TestNode) =>
        typeof node.props.onClick === "function" &&
        typeof node.props.children === "string" &&
        node.props.children.includes("calendar.importButton"),
    );
    await TestRenderer.act(async () => {
      (importPill.props.onClick as () => void)();
      await Promise.resolve();
    });

    expect(mocks.bulkMutateAsync.mock.calls[0]?.[0].habits[0].title).toBe("Event 0");
    expect(tree.root.findAll(
      (node: TestNode) => node.props.children === "errors.api.edgeBlocked",
    ).length).toBeGreaterThan(0);
  });

  it("shows retry recovery when dismissing a suggestion is blocked", async () => {
    mocks.searchParams = { mode: "review" };
    mocks.suggestions = [{ id: "suggestion-1", event: buildEvents(1)[0] }];
    mocks.dismissMutateAsync.mockRejectedValue(new ApiClientError(403, "Forbidden"));

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

    expect(mocks.dismissMutateAsync).toHaveBeenCalledWith({ id: "suggestion-1" });
    expect(mocks.showError).toHaveBeenCalledWith("errors.api.edgeBlockedRetry");
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

  it('drops a previous account suggestion error', async () => {
    mocks.searchParams = { mode: 'review' };
    mocks.suggestions = [{ id: 'sug-0', event: buildEvents(1)[0] }];
    let failDismiss!: (error: Error) => void;
    mocks.dismissMutateAsync.mockImplementationOnce(() => new Promise((_resolve, reject) => { failDismiss = reject; }));
    let tree!: CalendarSyncTree;
    await TestRenderer.act(async () => { tree = TestRenderer.create(<CalendarSyncScreen />) as CalendarSyncTree; await Promise.resolve(); });
    const dismiss = tree.root.find((node: TestNode) => node.props.accessibilityLabel === 'calendar.autoSync.dismissSuggestion');
    await TestRenderer.act(async () => { (dismiss.props.onPress as () => void)(); await Promise.resolve(); });
    await TestRenderer.act(async () => { advanceAccountGeneration(); failDismiss(new Error('old failure')); await Promise.resolve(); });
    expect(mocks.showError).not.toHaveBeenCalled();
  });

  it("enables and imports an alternating weekday suggestion", async () => {
    const event = {
      ...buildEvents(1)[0]!,
      title: "Alternate week training",
      isRecurring: true,
      recurrenceRule: "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE",
    };
    mocks.searchParams = { mode: "review" };
    mocks.suggestions = [{ id: "sug-interval", event }];

    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CalendarSyncScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const eventRow = tree.root.find(
      (node: TestNode) =>
        node.props.accessibilityRole === "checkbox",
    );
    expect(eventRow.props.disabled).toBe(false);
    expect(eventRow.props.accessibilityState).toEqual({
      checked: true,
      disabled: false,
    });
    const importPill = tree.root.find(
      (node: TestNode & { type?: unknown }) =>
        typeof node.props.onClick === "function" &&
        typeof node.props.children === "string" &&
        node.props.children.includes("calendar.importButton"),
    );
    expect(importPill.props.disabled).toBe(false);
    await TestRenderer.act(async () => {
      (importPill.props.onClick as () => void)();
      await Promise.resolve();
    });
    expect(mocks.bulkMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      habits: [expect.objectContaining({
        days: ["Monday", "Wednesday"],
        frequencyUnit: "Day",
        frequencyQuantity: 1,
        intervalWeeks: 2,
      })],
    }));
  });

  it.each([
    ["a monthly weekday interval", "RRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=MO", "2026-09-21", 1],
    ["a weekday interval above the API bound", "RRULE:FREQ=WEEKLY;INTERVAL=53;BYDAY=MO", "2026-09-21", 1],
    ["a different active-week partition", "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO;WKST=MO", "2026-09-27", 0],
  ])("disables %s in review", async (_name, recurrenceRule, startDate, weekStartDay) => {
    mocks.profile = createMockProfile({ hasProAccess: true, weekStartDay: weekStartDay as 0 | 1 });
    mocks.searchParams = { mode: "review" };
    mocks.suggestions = [{ id: "sug-unsupported", event: {
      ...buildEvents(1)[0]!, title: "Unsupported training", startDate,
      isRecurring: true, recurrenceRule,
    } }];

    let tree!: CalendarSyncTree;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CalendarSyncScreen />) as CalendarSyncTree;
      await Promise.resolve();
    });

    const eventRow = tree.root.find((node: TestNode) => node.props.accessibilityRole === "checkbox");
    expect(eventRow.props.disabled).toBe(true);
    expect(eventRow.props.accessibilityHint).toBe("calendar.importIssue.unsupportedWeekdayRecurrence");
    const importPill = tree.root.find((node: TestNode) =>
      typeof node.props.onClick === "function" &&
      typeof node.props.children === "string" &&
      node.props.children.includes("calendar.importButton"),
    );
    expect(importPill.props.disabled).toBe(true);
  });

  it("explains and disables a finite month-end suggestion before import", async () => {
    const event = {
      ...buildEvents(1)[0]!,
      title: "Month end close",
      startDate: "2026-01-31",
      startTime: null,
      isRecurring: true,
      recurrenceRule: "RRULE:FREQ=MONTHLY;COUNT=3",
    };
    mocks.searchParams = { mode: "review" };
    mocks.suggestions = [{ id: "sug-month-end", event }];

    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CalendarSyncScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const eventRow = tree.root.find(
      (node: TestNode) =>
        node.props.accessibilityRole === "checkbox" &&
        node.props.accessibilityHint === "calendar.importIssue.finiteDateClamp",
    );
    expect(eventRow.props.disabled).toBe(true);
    expect(eventRow.props.accessibilityState).toEqual({
      checked: false,
      disabled: true,
    });
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
        typeof node.props.onClick === "function" &&
        typeof node.props.children === "string" &&
        (node.props.children).includes("calendar.importButton"),
    );

    await TestRenderer.act(async () => {
      (importPill.props.onClick as () => void)();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.showError).toHaveBeenCalledWith(
      'calendar.importPartialFailure({"count":1})',
    );
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: [...calendarKeys.all, 'manual-fetch'],
    });
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
