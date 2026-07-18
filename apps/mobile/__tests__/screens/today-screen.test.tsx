import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockHabit,
  createMockProfile,
} from "@orbit/shared/__tests__/factories";
import type { NormalizedHabit } from "@orbit/shared/types/habit";
import { computeHabitCardStatus } from "@orbit/shared/utils";

import TodayScreen, {
  resolveBulkActionBarEnterShift,
  resolveTodayView,
  shouldRedirectGoalsTab,
} from "@/app/(tabs)/index";
import { BackHandler } from "@/test-mocks/react-native";

vi.mock("@/components/referral/referral-card", () => ({
  ReferralCard: () => null,
}));
vi.mock("@/components/social/social-entry-card", () => ({
  SocialEntryCard: () => null,
}));
vi.mock("@/components/referral/referral-drawer", () => ({
  ReferralDrawer: () => null,
}));


const TestRenderer: typeof import("react-test-renderer") = require("react-test-renderer");
type RenderedNode = {
  props: Record<string, unknown>;
};

type RenderedTree = {
  root: {
    findAll: (predicate: (node: RenderedNode) => boolean) => RenderedNode[];
    findAllByType: (type: string) => RenderedNode[];
    findByType: (type: string) => RenderedNode;
  };
};
const { todayShellMock } = vi.hoisted(() => ({
  todayShellMock: {
    TodayHeader: () => React.createElement("TodayHeader"),
    TodayTabs: (props: Record<string, unknown>) =>
      React.createElement("TodayTabs", props),
    TodayDateNavigation: (props: Record<string, unknown>) =>
      React.createElement("TodayDateNavigation", props),
  },
}));
const { useTourTargetMock } = vi.hoisted(() => ({
  useTourTargetMock: vi.fn(),
}));
const { useHabitsMock } = vi.hoisted(() => ({
  useHabitsMock: vi.fn(),
}));

const colorProxy = new Proxy<Record<string, string>>(
  {},
  {
    get: (_target, prop: string | symbol) =>
      prop === "white" ? "#ffffff" : "#111111",
  },
);

const shadowStub = {
  shadowColor: "#111111",
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0,
  shadowRadius: 0,
};
const createSurfaceLayer = () => ({
  backgroundColor: "#111111",
  borderColor: "#111111",
  topHighlight: "#111111",
  shadow: shadowStub,
  elevation: 0,
});
const surfacesMock = {
  screen: {
    backgroundColor: "#111111",
  },
  ground: createSurfaceLayer(),
  card: createSurfaceLayer(),
  elevated: createSurfaceLayer(),
  overlay: createSurfaceLayer(),
  glow: {
    subtle: shadowStub,
    base: shadowStub,
    strong: shadowStub,
  },
};

const dateParamState = { value: null as string | null };

const uiState = {
  activeView: "today",
  setActiveView: vi.fn(),
  searchQuery: "",
  setSearchQuery: vi.fn(),
  selectedFrequency: null,
  setSelectedFrequency: vi.fn(),
  selectedTagIds: [],
  setSelectedTagIds: vi.fn(),
  showCompleted: false,
  setShowCompleted: vi.fn(),
  isSelectMode: false,
  selectedHabitIds: new Set<string>(),
  toggleSelectMode: vi.fn(),
  selectAllHabits: vi.fn(),
  clearSelection: vi.fn(),
  setFilters: vi.fn(),
  showCreateModal: false,
  setShowCreateModal: vi.fn(),
  showCreateGoalModal: false,
  setShowCreateGoalModal: vi.fn(),
};
const bulkLogMutateAsync = vi.fn();
const bulkSkipMutateAsync = vi.fn();
const markRecentlyCompleted = vi.fn();
const checkAndPromptParentLog = vi.fn();
const mockHabitsData: {
  habitsById: Map<string, NormalizedHabit>;
  childrenByParent: Map<string, string[]>;
  topLevelHabits: NormalizedHabit[];
} = {
  habitsById: new Map<string, NormalizedHabit>(),
  childrenByParent: new Map<string, string[]>(),
  topLevelHabits: [],
};
const habitListHandle = {
  allCollapsed: false,
  allLoadedIds: new Set<string>(),
  collapseAll: vi.fn(),
  expandAll: vi.fn(),
  markRecentlyCompleted,
  checkAndPromptParentLog,
  refetch: vi.fn(),
};
function defaultUseHabitsReturn() {
  return {
    data: mockHabitsData,
    getChildren: () => [],
    isFetching: false,
  };
}
const mockRouterPush = vi.fn();
const mockRouterNavigate = vi.fn();
let mockProfile = createMockProfile({
  hasProAccess: false,
  aiSummaryEnabled: false,
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
  },
}));

vi.mock("@/hooks/use-coach-tour", () => ({
  useCoachTour: () => {},
}));

vi.mock("@/hooks/use-engagement-slot", () => ({
  useEngagementSlot: () => ({
    slot: null,
  }),
}));

vi.mock("@/components/today/setup-checklist-card", () => ({
  SetupChecklistCard: () => null,
}));

vi.mock("expo-router", () => ({
  useLocalSearchParams: () =>
    dateParamState.value ? { date: dateParamState.value } : {},
  useRouter: () => ({
    push: mockRouterPush,
    navigate: mockRouterNavigate,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}(${JSON.stringify(params)})` : key,
    i18n: { language: "en" },
  }),
}));

vi.mock("@/hooks/use-profile", () => ({
  useProfile: () => ({
    profile: mockProfile,
  }),
}));

vi.mock("@/hooks/use-tour-target", () => ({
  useTourTarget: useTourTargetMock,
}));

vi.mock("@/hooks/use-tags", () => ({
  useTags: () => ({
    tags: [],
  }),
}));

vi.mock("@/hooks/use-gamification", () => ({
  useStreakInfo: () => ({
    data: { currentStreak: 0 },
  }),
}));

vi.mock("@/hooks/use-habits", () => ({
  EMPTY_HABITS_BY_ID: new Map(),
  EMPTY_CHILDREN_BY_PARENT: new Map(),
  EMPTY_NORMALIZED_HABITS: [],
  useHabits: useHabitsMock,
  useDeleteHabit: () => ({ mutateAsync: vi.fn() }),
  useBulkDeleteHabits: () => ({ mutateAsync: vi.fn() }),
  useBulkLogHabits: () => ({ mutateAsync: bulkLogMutateAsync }),
  useBulkSkipHabits: () => ({ mutateAsync: bulkSkipMutateAsync }),
}));

vi.mock("@/stores/ui-store", () => ({
  useUIStore: <T,>(selector: (state: typeof uiState) => T) => selector(uiState),
}));

vi.mock("@/components/habit-list", () => ({
  HabitList: React.forwardRef(function MockHabitList(
    props: Record<string, unknown>,
    ref: React.ForwardedRef<unknown>,
  ) {
    React.useImperativeHandle(ref, () => habitListHandle);
    return React.createElement(
      "HabitList",
      props,
      props.listHeader as React.ReactNode,
    );
  }),
}));

vi.mock("@/components/habits/create-habit-modal", () => ({
  CreateHabitModal: () => null,
}));

vi.mock("@/components/habits/habit-detail-drawer", () => ({
  HabitDetailDrawer: () => null,
}));

vi.mock("@/components/habits/edit-habit-modal", () => ({
  EditHabitModal: () => null,
}));

vi.mock("@/components/habits/today-ai-summary", () => ({
  TodayAISummary: () => null,
}));

vi.mock("@/components/habits/bulk-action-bar-v2", () => ({
  BulkActionBarV2: (props: Record<string, unknown>) =>
    React.createElement("BulkActionBarV2", props),
}));

vi.mock("@/components/ui/chip", () => ({
  Chip: (props: Record<string, unknown>) =>
    React.createElement("Chip", props, props.children as React.ReactNode),
}));

vi.mock("@/components/ui/tag-chip", () => ({
  TagChip: (props: Record<string, unknown>) =>
    React.createElement("TagChip", props),
}));

vi.mock("@/components/ui/section-label", () => ({
  SectionLabel: (props: Record<string, unknown>) =>
    React.createElement(
      "SectionLabel",
      props,
      props.children as React.ReactNode,
    ),
}));

vi.mock("@/components/goals/goals-view", () => ({
  GoalsView: () => React.createElement("GoalsView"),
}));

vi.mock("@/components/goals/create-goal-modal", () => ({
  CreateGoalModal: () => null,
}));

vi.mock("@/components/gamification/streak-badge", () => ({
  StreakBadge: () => React.createElement("StreakBadge"),
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: (props: Record<string, unknown>) =>
    React.createElement("ConfirmDialog", props),
}));

vi.mock("@/components/ui/theme-toggle", () => ({
  ThemeToggle: () => React.createElement("ThemeToggle"),
}));

vi.mock("@/components/ui/trial-banner", () => ({
  TrialBanner: () => React.createElement("TrialBanner"),
}));

vi.mock("@/components/navigation/notification-bell", () => ({
  NotificationBell: () => React.createElement("NotificationBell"),
}));

vi.mock("@/components/ui/anchored-menu", () => ({
  AnchoredMenu: () => null,
  MenuAnchorHost: ({ children }: { children?: unknown }) => children,
  useAnchoredMenu: () => ({
    anchorRef: { current: null },
    visible: false,
    anchorRect: null,
    open: () => {},
    close: () => {},
    toggle: () => {},
  }),
}));

vi.mock("../../app/(tabs)/today-shell", () => todayShellMock);
vi.mock("@/hooks/use-horizontal-swipe", () => ({
  useHorizontalSwipe: () => ({ toGestureArray: () => [] }),
}));

vi.mock("@/lib/habit-selection-state", () => ({
  shouldResetSelectionForViewChange: () => false,
}));

vi.mock("@/lib/theme", () => ({
  createColors: () => colorProxy,
  createTokensV2: () => colorProxy,
  tintFromPrimary: () => "rgba(127, 70, 247, 0.1)",
  easings: {
    spring: [0.34, 1.56, 0.64, 1],
    out: [0.16, 1, 0.3, 1],
    smooth: [0.2, 0, 0, 1],
  },
  radius: {
    full: 999,
    lg: 16,
    md: 12,
    xl: 20,
  },
  spacing: {
    pageX: 20,
    pageBottom: 40,
    sectionGap: 16,
    cardPadding: 20,
    cardGap: 12,
    itemGap: 8,
  },
  shadows: {
    lg: {},
  },
  shadowsV2: {
    shadow1: {
      shadowColor: "#111111",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    shadow2: {
      shadowColor: "#111111",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    shadow3: {
      shadowColor: "#111111",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
  },
  zLayers: {
    dropdown: 1000,
    sticky: 1100,
    modalBackdrop: 1200,
    modal: 1300,
    tourSpotlight: 1400,
    celebration: 1500,
    toast: 1600,
    tooltip: 1700,
  },
}));

vi.mock("@/lib/use-app-theme", () => ({
  useAppTheme: () => ({
    colors: colorProxy,
    surfaces: surfacesMock,
    currentScheme: "purple",
    currentTheme: "dark",
  }),
}));

vi.mock('@/components/ui/icons', () => {
  const createIcon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props);
  return {
    ArrowUp: createIcon("ArrowUp"),
    Check: createIcon("Check"),
    CheckCircle2: createIcon("CheckCircle2"),
    ChevronLeft: createIcon("ChevronLeft"),
    ChevronRight: createIcon("ChevronRight"),
    ChevronsDownUp: createIcon("ChevronsDownUp"),
    ChevronsUpDown: createIcon("ChevronsUpDown"),
    Eye: createIcon("Eye"),
    FastForward: createIcon("FastForward"),
    Filter: createIcon("Filter"),
    MinusCircle: createIcon("MinusCircle"),
    MoreVertical: createIcon("MoreVertical"),
    PlusCircle: createIcon("PlusCircle"),
    RefreshCw: createIcon("RefreshCw"),
    Search: createIcon("Search"),
    Trash2: createIcon("Trash2"),
    X: createIcon("X"),
  };
});

async function renderTodayScreen(): Promise<RenderedTree> {
  let tree: unknown = null;

  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<TodayScreen />);
    await Promise.resolve();
  });

  if (!tree) {
    throw new Error("Expected screen to render");
  }

  return tree as unknown as RenderedTree;
}

describe("TodayScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHabitsMock.mockImplementation(defaultUseHabitsReturn);
    vi.useRealTimers();
    mockRouterPush.mockReset();
    mockRouterNavigate.mockReset();
    mockProfile = createMockProfile({
      hasProAccess: false,
      aiSummaryEnabled: false,
    });
    bulkLogMutateAsync.mockReset();
    bulkSkipMutateAsync.mockReset();
    mockHabitsData.habitsById = new Map();
    mockHabitsData.childrenByParent = new Map();
    mockHabitsData.topLevelHabits = [];
    habitListHandle.allLoadedIds = new Set();
    dateParamState.value = "2026-04-07";
    uiState.activeView = "today";
    uiState.isSelectMode = false;
    uiState.searchQuery = "";
    uiState.selectedFrequency = null;
    uiState.selectedTagIds = [];
    uiState.showCompleted = false;
    uiState.selectedHabitIds = new Set<string>();
    uiState.showCreateModal = false;
    uiState.showCreateGoalModal = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes the shared habits header through the habit list and removes the nestable scroll container", async () => {
    const tree = await renderTodayScreen();

    expect(tree.root.findAllByType("NestableScrollContainer")).toHaveLength(0);

    const habitList = tree.root.findByType("HabitList");
    expect(habitList.props.listHeader).toBeTruthy();
    expect(habitList.props.onLogHabit).toBeUndefined();
  });

  it("renders the animated filter shell, list shell, and bulk action bar", async () => {
    uiState.isSelectMode = true;

    const tree = await renderTodayScreen();

    expect(
      tree.root.findAll((node) => node.props.testID === "today-filters-shell")
        .length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      tree.root.findAll((node) => node.props.testID === "today-list-shell")
        .length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      tree.root.findAll((node) => node.props.testID === "bulk-action-bar")
        .length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("clears the selection when hardware back is pressed in select mode", async () => {
    uiState.isSelectMode = true;

    await renderTodayScreen();

    const handled = BackHandler.emitBackPress();

    expect(handled).toBe(true);
    expect(uiState.clearSelection).toHaveBeenCalled();
  });

  it("registers the list shell as the habits tour overview target", async () => {
    await renderTodayScreen();

    expect(useTourTargetMock).toHaveBeenCalledWith(
      "tour-habit-list",
      expect.objectContaining({ current: expect.anything() }),
    );
  });

  it("drops bulk action bar movement when reduced motion is enabled", () => {
    expect(
      resolveBulkActionBarEnterShift({
        shift: 0,
        reducedMotionEnabled: true,
      }),
    ).toBe(0);
    expect(
      resolveBulkActionBarEnterShift({
        shift: 6,
        reducedMotionEnabled: false,
      }),
    ).toBe(12);
  });

  it("dedupes descendant successes before prompting parent logs for bulk actions", async () => {
    const root = createMockHabit({
      id: "root",
      title: "Root",
      hasSubHabits: true,
    });
    const parent = createMockHabit({
      id: "parent",
      title: "Parent",
      parentId: "root",
      hasSubHabits: true,
    });
    const child = createMockHabit({
      id: "child",
      title: "Child",
      parentId: "parent",
    });

    mockHabitsData.habitsById = new Map([
      [root.id, root],
      [parent.id, parent],
      [child.id, child],
    ]);
    mockHabitsData.childrenByParent = new Map([
      [root.id, [parent.id]],
      [parent.id, [child.id]],
    ]);
    mockHabitsData.topLevelHabits = [root];
    uiState.selectedHabitIds = new Set([parent.id, child.id]);

    bulkLogMutateAsync.mockResolvedValue({
      results: [
        { habitId: parent.id, status: "Success" },
        { habitId: child.id, status: "Success" },
      ],
    });

    const tree = await renderTodayScreen();

    const bulkLogDialog = tree.root
      .findAllByType("ConfirmDialog")
      .find(
        (node: { props: { title?: string } }) =>
          node.props.title === "habits.bulkLogTitle",
      );

    if (!bulkLogDialog || typeof bulkLogDialog.props.onConfirm !== "function") {
      throw new Error("Expected bulk log confirm dialog to be rendered");
    }
    const onConfirm = bulkLogDialog.props.onConfirm;

    await TestRenderer.act(async () => {
      await onConfirm();
    });

    expect(markRecentlyCompleted).toHaveBeenCalledWith("parent");
    expect(markRecentlyCompleted).toHaveBeenCalledWith("child");
    expect(checkAndPromptParentLog).toHaveBeenCalledTimes(1);
    expect(checkAndPromptParentLog).toHaveBeenCalledWith("parent");
  });

  it("routes free users to upgrade when they select goals", () => {
    expect(shouldRedirectGoalsTab("goals", false)).toBe(true);
    expect(shouldRedirectGoalsTab("today", false)).toBe(false);
  });

  it("lets pro users switch to goals", () => {
    expect(shouldRedirectGoalsTab("goals", true)).toBe(false);
    expect(resolveTodayView("goals", true)).toBe("goals");
  });

  it("recovers a stale free goals view back to today", async () => {
    uiState.activeView = "goals";
    const tree = await renderTodayScreen();

    const habitList = tree.root.findByType("HabitList");
    expect(habitList.props.view).toBe("today");
  });

  it("advances a followed today selection after midnight without reopening the screen", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T23:59:55"));
    dateParamState.value = null;

    await renderTodayScreen();

    expect(useHabitsMock.mock.calls.at(-1)?.[0]).toMatchObject({
      dateFrom: "2026-04-07",
      dateTo: "2026-04-07",
    });

    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });

    expect(useHabitsMock.mock.calls.at(-1)?.[0]).toMatchObject({
      dateFrom: "2026-04-08",
      dateTo: "2026-04-08",
    });
  });

  it("keeps a manually pinned date fixed after midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T23:59:55"));
    dateParamState.value = "2026-04-06";

    await renderTodayScreen();

    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });

    expect(useHabitsMock.mock.calls.at(-1)?.[0]).toMatchObject({
      dateFrom: "2026-04-06",
      dateTo: "2026-04-06",
    });
  });

  it("navigates to adjacent days with a date query param", async () => {
    dateParamState.value = "2026-04-07";

    const tree = await renderTodayScreen();

    const dateNav = tree.root.findByType("TodayDateNavigation");

    TestRenderer.act(() => {
      (dateNav.props.onGoToPreviousDay as () => void)();
    });
    expect(mockRouterPush).toHaveBeenCalledWith("/?date=2026-04-06");

    TestRenderer.act(() => {
      (dateNav.props.onGoToNextDay as () => void)();
    });
    expect(mockRouterPush).toHaveBeenCalledWith("/?date=2026-04-08");
  });

  it("returns to today via the bare tabs index, clearing the date param", async () => {
    dateParamState.value = "2026-04-06";

    const tree = await renderTodayScreen();

    const dateNav = tree.root.findByType("TodayDateNavigation");

    TestRenderer.act(() => {
      (dateNav.props.onGoToToday as () => void)();
    });

    expect(mockRouterNavigate).toHaveBeenCalledWith("/");
  });

  it("renders today on the bare route and the pinned day on a date deep link", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T12:00:00"));

    dateParamState.value = null;
    await renderTodayScreen();
    expect(useHabitsMock.mock.calls.at(-1)?.[0]).toMatchObject({
      dateFrom: "2026-04-07",
      dateTo: "2026-04-07",
    });

    dateParamState.value = "2026-04-02";
    await renderTodayScreen();
    expect(useHabitsMock.mock.calls.at(-1)?.[0]).toMatchObject({
      dateFrom: "2026-04-02",
      dateTo: "2026-04-02",
    });
  });

  it("renders the load-error state with a working retry when habits fail before any data", async () => {
    const refetch = vi.fn();
    useHabitsMock.mockReturnValue({
      data: undefined,
      getChildren: () => [],
      isFetching: false,
      isError: true,
      refetch,
    });

    const tree = await renderTodayScreen();

    expect(tree.root.findAllByType("HabitList")).toHaveLength(0);
    expect(tree.root.findAllByType("TodayTabs").length).toBeGreaterThanOrEqual(
      1,
    );

    const retryPill = tree.root.findAll(
      (node) =>
        node.props.accessibilityLabel === "common.retry" &&
        typeof node.props.onPress === "function",
    )[0];
    if (!retryPill) {
      throw new Error("Expected the retry pill to be rendered");
    }

    TestRenderer.act(() => {
      (retryPill.props.onPress as () => void)();
    });

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("TodayScreen overdue bulk selection", () => {
  function seedOverdueHabit(): NormalizedHabit {
    const overdue = createMockHabit({
      id: "overdue-1",
      title: "Overdue task",
      isOverdue: true,
      frequencyUnit: null,
      dueDate: "2026-04-01",
      scheduledDates: [],
      isCompleted: false,
    });
    mockHabitsData.habitsById = new Map([[overdue.id, overdue]]);
    mockHabitsData.topLevelHabits = [overdue];
    return overdue;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    useHabitsMock.mockImplementation(defaultUseHabitsReturn);
    vi.useRealTimers();
    mockProfile = createMockProfile({
      hasProAccess: false,
      aiSummaryEnabled: false,
    });
    bulkLogMutateAsync.mockReset();
    bulkSkipMutateAsync.mockReset();
    mockHabitsData.habitsById = new Map();
    mockHabitsData.childrenByParent = new Map();
    mockHabitsData.topLevelHabits = [];
    habitListHandle.allLoadedIds = new Set();
    dateParamState.value = "2026-04-07";
    uiState.activeView = "today";
    uiState.isSelectMode = true;
    uiState.searchQuery = "";
    uiState.selectedFrequency = null;
    uiState.selectedTagIds = [];
    uiState.showCompleted = false;
    uiState.selectedHabitIds = new Set<string>();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats an overdue one-time habit fixture as overdue", () => {
    const overdue = seedOverdueHabit();

    expect(computeHabitCardStatus(overdue)).toBe("overdue");
  });

  it("includes the overdue habit when selecting all", async () => {
    const overdue = seedOverdueHabit();

    const tree = await renderTodayScreen();

    const bulkBar = tree.root.findByType("BulkActionBarV2");

    TestRenderer.act(() => {
      (bulkBar.props.onSelectAll as () => void)();
    });

    expect(uiState.selectAllHabits).toHaveBeenCalledWith(
      expect.arrayContaining([overdue.id]),
    );
  });

  it("dispatches a bulk log for a selected overdue habit without a date", async () => {
    const overdue = seedOverdueHabit();
    uiState.selectedHabitIds = new Set([overdue.id]);
    bulkLogMutateAsync.mockResolvedValue({
      results: [{ habitId: overdue.id, status: "Success" }],
    });

    const tree = await renderTodayScreen();

    const bulkLogDialog = tree.root
      .findAllByType("ConfirmDialog")
      .find(
        (node: { props: { title?: string } }) =>
          node.props.title === "habits.bulkLogTitle",
      );

    if (!bulkLogDialog || typeof bulkLogDialog.props.onConfirm !== "function") {
      throw new Error("Expected bulk log confirm dialog to be rendered");
    }
    const onConfirm = bulkLogDialog.props.onConfirm as () => Promise<void>;

    await TestRenderer.act(async () => {
      await onConfirm();
    });

    expect(bulkLogMutateAsync).toHaveBeenCalledWith([{ habitId: overdue.id }]);
  });

  it("dispatches a bulk skip for a selected overdue habit without a date", async () => {
    const overdue = seedOverdueHabit();
    uiState.selectedHabitIds = new Set([overdue.id]);
    bulkSkipMutateAsync.mockResolvedValue({
      results: [{ habitId: overdue.id, status: "Success" }],
    });

    const tree = await renderTodayScreen();

    const bulkSkipDialog = tree.root
      .findAllByType("ConfirmDialog")
      .find(
        (node: { props: { title?: string } }) =>
          node.props.title === "habits.bulkSkipTitle",
      );

    if (!bulkSkipDialog || typeof bulkSkipDialog.props.onConfirm !== "function") {
      throw new Error("Expected bulk skip confirm dialog to be rendered");
    }
    const onConfirm = bulkSkipDialog.props.onConfirm as () => Promise<void>;

    await TestRenderer.act(async () => {
      await onConfirm();
    });

    expect(bulkSkipMutateAsync).toHaveBeenCalledWith([{ habitId: overdue.id }]);
  });
});

describe("TodayScreen overdue date gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHabitsMock.mockImplementation(defaultUseHabitsReturn);
    vi.useRealTimers();
    mockProfile = createMockProfile({
      hasProAccess: false,
      aiSummaryEnabled: false,
    });
    mockHabitsData.habitsById = new Map();
    mockHabitsData.childrenByParent = new Map();
    mockHabitsData.topLevelHabits = [];
    dateParamState.value = null;
    uiState.activeView = "today";
    uiState.isSelectMode = false;
    uiState.searchQuery = "";
    uiState.selectedFrequency = null;
    uiState.selectedTagIds = [];
    uiState.showCompleted = false;
    uiState.selectedHabitIds = new Set<string>();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function lastFilters() {
    return useHabitsMock.mock.calls.at(-1)?.[0];
  }

  it("includes overdue when the selected date is today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T12:00:00"));
    dateParamState.value = null;

    await renderTodayScreen();

    expect(lastFilters()).toMatchObject({
      dateFrom: "2026-04-07",
      dateTo: "2026-04-07",
      includeOverdue: true,
    });
  });

  it("excludes overdue when the selected date is in the future", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T12:00:00"));
    dateParamState.value = "2026-04-09";

    await renderTodayScreen();

    expect(lastFilters()).toMatchObject({ includeOverdue: false });
  });

  it("excludes overdue when the selected date is in the past", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T12:00:00"));
    dateParamState.value = "2026-04-05";

    await renderTodayScreen();

    expect(lastFilters()).toMatchObject({ includeOverdue: false });
  });
});
