import React from "react";
import { StyleSheet, type ViewStyle } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockProfile } from "@orbit/shared/__tests__/factories";
import { ApiClientError } from "@orbit/shared";
import { calendarImportTitleKey, type CalendarSyncEvent } from "@orbit/shared/utils";
import en from "@orbit/shared/i18n/en.json";
import ptBR from "@orbit/shared/i18n/pt-BR.json";
import { Sheet } from "@/components/ui/sheet";
import { calendarKeys } from '@orbit/shared/query';
import { Link as LinkIcon } from '@/components/ui/icons';
import { advanceAccountGeneration } from '@/lib/session-epoch';

import { CalendarImportContent, type CalendarImportActionHandle, type CalendarImportActionState } from "@/components/calendar-sync/calendar-import-content";
import AuthCallbackScreen from '@/app/auth-callback';
import { clearPendingGoogleAuthSession } from '@/lib/google-auth-callback';
import { PillButton } from '@/components/ui/pill-button';
import { useTranslation } from 'react-i18next';
function CalendarSyncScreen({ inSheet = false }: Readonly<{ inSheet?: boolean }>) {
  const [action, setAction] = React.useState<CalendarImportActionState | null>(null);
  const actionRef = React.useRef<CalendarImportActionHandle>(null);
  const { t } = useTranslation();
  const content = <>
    <CalendarImportContent reviewMode={'mode' in mocks.searchParams && mocks.searchParams.mode === "review"} initialEventId={mocks.initialEventId} onClose={() => {}} onGoToHabits={mocks.goToHabits} actionRef={actionRef} onActionStateChange={setAction} />
    {action ? <PillButton disabled={action.disabled} onClick={() => actionRef.current?.importSelected()}>{t('calendar.importButton', { count: action.count })}</PillButton> : null}
  </>;
  return inSheet ? <Sheet title={t(calendarImportTitleKey(false))} onClose={() => {}}>{content}</Sheet> : content;
}

vi.unmock('@/components/ui/sheet')

vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class TrueSheet extends React.Component<{ children?: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode }> {
    present = vi.fn(async () => {});
    dismiss = vi.fn(async () => {});
    render() { return <>{this.props.header}{this.props.children}{this.props.footer}</>; }
  },
}));

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
    login: vi.fn(),
    openBrowser: vi.fn(),
    queryClient,
    eventsQuery: {
      data: initialEventsQueryData(),
      isLoading: false,
      isError: false,
      error: null as Error | null,
      refetch: vi.fn(),
    },
    goToHabits: vi.fn(),
    router: {
      push: vi.fn(),
      replace: vi.fn(),
    },
    profile: null as ReturnType<typeof createMockProfile> | null,
    searchParams: {},
    initialEventId: null as string | null,
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
    language: 'en',
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
    i18n: { language: mocks.language },
    t: (key: string, params?: Record<string, unknown>) =>
      key === 'calendar.calendars.title' ? (mocks.language === 'pt-BR' ? ptBR : en).calendar.calendars.title : params ? `${key}(${JSON.stringify(params)})` : key,
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
      lastSyncedAt: '2026-09-12T09:12:00Z',
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
    mutateAsync: mocks.setAutoSyncMutate,
    isPending: mocks.isSetPending,
  }),
  useRunCalendarSyncNow: () => ({
    mutateAsync: mocks.runSyncNowMutate,
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

vi.mock("@react-native-async-storage/async-storage", () => {
  const entries = new Map<string, string>();
  return {
    default: {
      getItem: (key: string) => Promise.resolve(entries.get(key) ?? null),
      setItem: (key: string, value: string) => { entries.set(key, value); return Promise.resolve(); },
      removeItem: (key: string) => { entries.delete(key); return Promise.resolve(); },
    },
  };
});

vi.mock("@/lib/api-client", () => ({
  apiClient: mocks.apiClient,
}));

vi.mock("@/lib/google-auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/google-auth")>(),
  startMobileGoogleAuth: mocks.startGoogleAuth,
}));

vi.mock("@/stores/auth-store", () => ({
  getSessionGeneration: () => ({ epoch: 0, credentialVersion: 0 }),
  useAuthStore: (selector: (state: { login: typeof mocks.login }) => unknown) => selector({ login: mocks.login }),
}));
vi.mock("@/components/auth/login-content", () => ({ LoginContent: () => null }));
vi.mock("expo-linking", () => ({ useLinkingURL: () => null }));
vi.mock("expo-crypto", () => ({
  getRandomBytesAsync: () => Promise.resolve(new Uint8Array(32).fill(1)),
  digestStringAsync: () => Promise.resolve("challenge="),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  CryptoEncoding: { BASE64: "base64" },
}));

vi.mock("expo-web-browser", () => ({
  openAuthSessionAsync: mocks.openBrowser,
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



vi.mock("@/components/ui/settings-row", () => ({
  SettingsRow: ({ label, ...props }: React.ComponentProps<typeof import("@/components/ui/settings-row")["SettingsRow"]>) =>
    React.createElement("SettingsRow", props, label),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ onChange, label, checked }: { onChange: (value: boolean) => void; label: string; checked: boolean }) =>
    React.createElement("Switch", { onPress: () => onChange(!checked), accessibilityLabel: label }),
}));

vi.mock("@/components/ui/select-check", () => ({
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
  afterEach(() => { vi.unstubAllEnvs(); });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile = createMockProfile({ hasProAccess: true });
    mocks.language = 'en';
    mocks.apiClient.mockResolvedValue([]);
    mocks.eventsQuery.data = { status: "connected", events: [] };
    mocks.eventsQuery.isLoading = false;
    mocks.eventsQuery.isError = false;
    mocks.eventsQuery.error = null;
    mocks.searchParams = {};
    mocks.initialEventId = null;
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


  it('shows one Calendários heading in the connected import sheet', async () => {
    mocks.language = 'pt-BR';
    mocks.eventsQuery.data = { status: 'connected', events: buildEvents(2) };
    let tree!: CalendarSyncTree;
    await TestRenderer.act(async () => { tree = TestRenderer.create(<CalendarSyncScreen inSheet />); await Promise.resolve(); });
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === ptBR.calendar.calendars.title)).toHaveLength(1);
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'header' && node.props.children === ptBR.calendar.calendars.title)).toHaveLength(1);
  });

  it.each([['pt-BR', 'sex., 16 de out.'], ['en', 'Fri, Oct 16']])('localizes calendar dates in %s west of UTC', async (language, expected) => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    expect(new Date(2026, 9, 16).getTimezoneOffset()).toBeGreaterThan(0);
    mocks.language = language;
    mocks.eventsQuery.data = { status: 'connected', events: [{ ...buildEvents(1)[0]!, startDate: '2026-10-16' }] };
    let tree!: CalendarSyncTree;
    await TestRenderer.act(async () => { tree = TestRenderer.create(<CalendarSyncScreen inSheet />); await Promise.resolve(); });
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === expected)).toHaveLength(1);
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === '2026-10-16')).toHaveLength(0);
    vi.unstubAllEnvs();
  });

  it('preselects only the event opened from the day card', async () => {
    mocks.initialEventId = 'ev-1';
    mocks.eventsQuery.data = { status: 'connected', events: buildEvents(3) };
    mocks.bulkMutateAsync.mockResolvedValue({ results: [] });
    let tree!: CalendarSyncTree;
    await TestRenderer.act(async () => { tree = TestRenderer.create(<CalendarSyncScreen />); await Promise.resolve(); });
    const action = tree.root.find((node) => node.props.children === 'calendar.importButton({"count":1})' && typeof node.props.onClick === 'function');
    await TestRenderer.act(async () => { (action.props.onClick as () => void)(); await Promise.resolve(); });
    expect(mocks.bulkMutateAsync.mock.calls[0]![0].habits).toHaveLength(1);
    expect(mocks.bulkMutateAsync.mock.calls[0]![0].habits[0].title).toBe('Event 1');
  });

  it('discloses an imported event title without selecting other events', async () => {
    const title = 'Already imported event ' + 'long title '.repeat(30);
    mocks.initialEventId = 'ev-0';
    mocks.eventsQuery.data = { status: 'connected', events: [{ ...buildEvents(2)[0]!, title, isImported: true }, buildEvents(2)[1]!] };
    let tree!: CalendarSyncTree;
    await TestRenderer.act(async () => { tree = TestRenderer.create(<CalendarSyncScreen />); await Promise.resolve(); });
    const fullTitle = tree.root.find((node) => node.type === 'Text' && node.props.children === title);
    expect(fullTitle.props.numberOfLines ?? 0).toBe(0);
    expect(tree.root.find((node) => node.props.children === 'calendar.importButton({"count":0})' && typeof node.props.onClick === 'function').props.disabled).toBe(true);
    expect(mocks.bulkMutateAsync).not.toHaveBeenCalled();
  });

  it('owns dated sync controls and keeps sync failures in the sheet', async () => {
    mocks.eventsQuery.data = { status: 'connected', events: buildEvents(1) };
    mocks.runSyncNowMutate.mockRejectedValueOnce(new ApiClientError(403, 'Forbidden'));
    let tree!: CalendarSyncTree;
    await TestRenderer.act(async () => { tree = TestRenderer.create(<CalendarSyncScreen />); await Promise.resolve(); });
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === 'calendar.dayDetail.googleConnected')).toHaveLength(1);
    expect(tree.root.findAll((node) => node.type === 'Text' && typeof node.props.children === 'string' && /2026,/.test(node.props.children))).toHaveLength(1);
    const toggle = tree.root.find((node) => node.type === 'Switch' && typeof node.props.onPress === 'function');
    await TestRenderer.act(async () => { (toggle.props.onPress as () => void)(); await Promise.resolve(); });
    expect(mocks.setAutoSyncMutate).toHaveBeenCalledWith({ enabled: true });
    const sync = () => tree.root.find((node) => node.props.children === 'calendar.autoSync.syncNow' && typeof node.props.onClick === 'function');
    await TestRenderer.act(async () => { (sync().props.onClick as () => void)(); await Promise.resolve(); });
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'alert' && node.props.children === 'errors.api.edgeBlocked')).toHaveLength(1);
    expect(mocks.showError).not.toHaveBeenCalled();
    await TestRenderer.act(async () => { (sync().props.onClick as () => void)(); await Promise.resolve(); });
    expect(mocks.runSyncNowMutate).toHaveBeenCalledTimes(2);
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'alert' && node.props.children !== '')).toHaveLength(0);
  });

  it.each([[false, false], [true, false], [true, true]])('exposes all long event text before import, review: %s, blocked: %s', async (review, blocked) => {
    const event = {
      ...buildEvents(1)[0]!,
      ...(blocked ? { isRecurring: true, recurrenceRule: 'RRULE:FREQ=MONTHLY;COUNT=3', startDate: '2026-01-31', startTime: null } : {}),
      title: `Planning the weekly training schedule ${'UnbrokenTitle'.repeat(20)}`,
      calendarName: `The shared calendar for family routines ${'UnbrokenCalendar'.repeat(20)}`,
      description: `Review the complete agenda. ${'Include every preparation step and follow-up commitment. '.repeat(30)}`,
    };
    const events = [event, { ...buildEvents(1)[0]!, id: 'short-event', title: 'Short event' }];
    if (review) {
      mocks.searchParams = { mode: 'review' };
      mocks.suggestions = events.map((entry) => ({ id: `suggestion-${entry.id}`, event: entry }));
    } else {
      mocks.eventsQuery.data = { status: 'connected', events };
    }
    let tree!: CalendarSyncTree;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CalendarSyncScreen />) as CalendarSyncTree;
      await Promise.resolve();
    });
    for (const value of [event.title, event.calendarName, event.description]) {
      const text = tree.root.find((node) => node.type === 'Text' && node.props.children === value);
      expect(text.props.numberOfLines ?? 0, value).toBe(0);
    }
    const row = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'checkbox')[0]!;
    expect(row.props.accessibilityState).toEqual({ checked: !blocked, disabled: blocked });
    for (const value of [event.title, event.calendarName, event.description]) {
      expect(row.findAll((node) => node.type === 'Text' && node.props.children === value)).toHaveLength(1);
    }
    if (blocked) {
      expect(row.props.disabled).toBe(true);
      expect(row.props.accessibilityHint).toBe('calendar.importIssue.finiteDateClamp');
    } else {
      TestRenderer.act(() => { (row.props.onPress as () => void)(); });
      expect(row.props.accessibilityState).toEqual({ checked: false, disabled: false });
      TestRenderer.act(() => { (row.props.onPress as () => void)(); });
      expect(row.props.accessibilityState).toEqual({ checked: true, disabled: false });
    }
    if (review) {
      const dismiss = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'calendar.autoSync.dismissSuggestion')[0]!;
      await TestRenderer.act(async () => { await (dismiss.props.onPress as () => Promise<void>)(); });
      expect(mocks.dismissMutateAsync).toHaveBeenCalledWith({ id: 'suggestion-ev-0' });
      expect(row.props.accessibilityState).toEqual({ checked: !blocked, disabled: blocked });
    }
    expect(mocks.bulkMutateAsync).not.toHaveBeenCalled();
  });

  it("refetches calendar events through the cached query once the screen settles", async () => {
    await TestRenderer.act(async () => {
      TestRenderer.create(<CalendarSyncScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.eventsQuery.refetch).toHaveBeenCalledTimes(1);
  });

  it('leaves the import body bottom inset to its sheet', async () => {
    let tree: CalendarSyncTree;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CalendarSyncScreen />) as CalendarSyncTree;
      await Promise.resolve();
    });
    const body = tree!.root.findAll((node) => node.type === 'View')[0];
    const style = (StyleSheet.flatten(body!.props.style) as ViewStyle | undefined) ?? {};
    expect(style.paddingBottom ?? style.paddingVertical ?? style.padding ?? 0).toBe(0);
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

  it("starts Google calendar consent and leaves callback navigation to the App Link", async () => {
    mocks.eventsQuery.data = { status: "not-connected" };
    mocks.startGoogleAuth.mockResolvedValue({ type: "success", url: "https://app.useorbit.org/auth-callback?code=google-code" });

    const tree = await pressConnect();

    expect(mocks.startGoogleAuth).toHaveBeenCalledWith({ returnUrl: "/calendar?import=1", forceConsent: true });
    expect(tree.root.findAll((node) => node.type === 'Switch')).toHaveLength(0);
    const linkGlyph = tree.root.find((node) => node.type === LinkIcon);
    expect(linkGlyph.props.color).toBe('#111111');
    expect(mocks.router.replace).not.toHaveBeenCalled();
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

  it("exchanges calendar consent once when the App Link mounts two callback screens", async () => {
    vi.stubEnv("EXPO_PUBLIC_GOOGLE_CLIENT_ID", "web-client-id");
    await clearPendingGoogleAuthSession();
    const { startMobileGoogleAuth } = await vi.importActual<typeof import("@/lib/google-auth")>("@/lib/google-auth");
    mocks.startGoogleAuth.mockImplementation(startMobileGoogleAuth);
    mocks.eventsQuery.data = { status: "not-connected" };
    mocks.login.mockResolvedValue(() => true);
    mocks.apiClient.mockResolvedValue({
      token: "access", refreshToken: "refresh", userId: "calendar-user",
      name: "Calendar", email: "calendar@example.com",
    });
    const callbacks: ReturnType<typeof TestRenderer.create>[] = [];
    mocks.openBrowser.mockImplementation((authorizeUrl: string, redirect: string) => {
      const url = new URL(authorizeUrl);
      expect(url.searchParams.get("prompt")).toBe("consent");
      expect(url.searchParams.get("scope")).toContain("calendar.readonly");
      callbacks.push(TestRenderer.create(<AuthCallbackScreen />));
      callbacks.push(TestRenderer.create(<AuthCallbackScreen />));
      return Promise.resolve({ type: "success", url: `${redirect}?code=calendar-code&state=${url.searchParams.get("state")}` });
    });
    try {
      callbacks.push(await pressConnect());
      await vi.waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/calendar?import=1"));
      expect(mocks.apiClient.mock.calls.filter(([endpoint]) => endpoint === "/api/auth/google/code")).toHaveLength(1);
      expect(mocks.login).toHaveBeenCalledTimes(1);
      expect(mocks.router.replace).toHaveBeenCalledTimes(1);
      expect(mocks.router.replace).not.toHaveBeenCalledWith("/login?googleError=1");
    } finally {
      TestRenderer.act(() => {
        callbacks.forEach((callback) => callback.unmount());
      });
      await clearPendingGoogleAuthSession();
      vi.unstubAllEnvs();
    }
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

  it.each([
    ['pt-BR', false, '7:30 PM - 8:15 PM'],
    ['en', true, '19:30 - 20:15'],
  ])('shows imported event times with %s and the saved clock', async (language, uses24HourClock, expected) => {
    mocks.language = language;
    mocks.profile = createMockProfile({ hasProAccess: true, uses24HourClock });
    mocks.eventsQuery.data = { status: 'connected', events: [{ ...buildEvents(1)[0]!, startTime: '19:30', endTime: '20:15' }] };
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CalendarSyncScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(tree.root.findAll((node: TestNode) => node.props.children === expected).length).toBeGreaterThan(0);
  });

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
    const events: CalendarSyncEvent[] = buildEvents(8);
    events[0] = { ...events[0]!, isImported: true, importedHabitId: '4a16a8be-cd9b-4baf-bcaf-ec0ce6d59dfa' };
    mocks.eventsQuery.data = { status: "connected", events };

    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CalendarSyncScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(countEventTitles(tree.root)).toBe(7);
    expect(tree.root.findAll((node: TestNode) => node.props.children === 'Event 0')).toHaveLength(0);
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
    expect(tree.root.findAll((node: TestNode) => node.type === "Text" && node.props.accessibilityRole === "alert" && node.props.children === "errors.api.edgeBlockedRetry")).toHaveLength(1);
    expect(mocks.showError).not.toHaveBeenCalled();
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

  it("lists imported habits and keeps partial failures visible", async () => {
    const habitName = 'Caminhar pelo bairro depois do trabalho e conversar com todos os amigos durante os encontros da semana';
    mocks.eventsQuery.data = { status: "connected", events: buildEvents(2).map((event, index) => index === 0 ? { ...event, title: habitName } : event) };
    mocks.bulkMutateAsync.mockResolvedValue({
      results: [
        { status: "Success", habitId: "h1", title: habitName, error: null },
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

    expect(tree.root.findAll((node: TestNode) => node.type === 'Text' && node.props.accessibilityRole === 'alert' && node.props.children === 'calendar.importPartialFailure({"count":1})')).toHaveLength(1);
    expect(mocks.showError).not.toHaveBeenCalled();
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
        node.type === "SettingsRow" && node.props.children === habitName,
    );
    expect(doneRows).toHaveLength(1);
    expect(doneRows[0]!.props.accessory).toBe("none");
    expect(doneRows[0]!.props.textMode).toBe("personal");
    const goToHabits = tree.root.find(
      (node: TestNode) =>
        typeof node.props.onClick === "function" &&
        node.props.children === "calendar.goToHabits",
    );
    await TestRenderer.act(() => {
      (goToHabits.props.onClick as () => void)();
    });
    expect(mocks.goToHabits).toHaveBeenCalledExactlyOnceWith();
    expect(
      tree.root.findAll(
        (node: TestNode & { type?: unknown }) =>
          node.type === "SettingsRow" && node.props.children === "Event 1",
      ),
    ).toHaveLength(0);
  });
});
