import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockHabit,
  createMockProfile,
} from "@orbit/shared/__tests__/factories";
import type { NormalizedHabit } from "@orbit/shared/types/habit";
import { formatAPIDate } from "@orbit/shared/utils";

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

const colorProxy = new Proxy<Record<string, string>>(
  {},
  {
    get: (_target, prop: string | symbol) =>
      prop === "white" ? "#ffffff" : "#111111",
  },
);

const setSelectedDate = vi.fn((date: string) => {
  uiState.selectedDate = date;
  uiState.followToday = false;
});

const goToToday = vi.fn(() => {
  uiState.selectedDate = formatAPIDate(new Date());
  uiState.followToday = true;
});

const syncSelectedDateWithToday = vi.fn(() => {
  if (!uiState.followToday) return;

  const today = formatAPIDate(new Date());
  if (uiState.selectedDate !== today) {
    uiState.selectedDate = today;
  }
});

const uiState = {
  selectedDate: "2026-04-07",
  followToday: true,
  setSelectedDate,
  goToToday,
  syncSelectedDateWithToday,
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
const mockRouterPush = vi.fn();
let mockProfile = createMockProfile({
  hasProAccess: false,
  aiSummaryEnabled: false,
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
  },
}));

vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    push: mockRouterPush,
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
  useHabits: () => ({
    data: mockHabitsData,
    getChildren: () => [],
    isFetching: false,
  }),
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

vi.mock("@/components/habits/habit-summary-card", () => ({
  HabitSummaryCard: () => null,
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
}));

vi.mock("../../app/(tabs)/today-shell", () => todayShellMock);
vi.mock("@/hooks/use-horizontal-swipe", () => ({
  useHorizontalSwipe: () => ({
    panHandlers: {},
  }),
}));

vi.mock("@/lib/habit-selection-state", () => ({
  shouldResetSelectionForViewChange: () => false,
}));

vi.mock("@/lib/theme", () => ({
  createColors: () => colorProxy,
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
}));

vi.mock("@/lib/use-app-theme", () => ({
  useAppTheme: () => ({
    colors: colorProxy,
  }),
}));

vi.mock("lucide-react-native", () => {
  const createIcon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props);
  return {
    Check: createIcon("Check"),
    CheckCircle2: createIcon("CheckCircle2"),
    ChevronLeft: createIcon("ChevronLeft"),
    ChevronRight: createIcon("ChevronRight"),
    ChevronsDownUp: createIcon("ChevronsDownUp"),
    ChevronsUpDown: createIcon("ChevronsUpDown"),
    Eye: createIcon("Eye"),
    FastForward: createIcon("FastForward"),
    MinusCircle: createIcon("MinusCircle"),
    MoreVertical: createIcon("MoreVertical"),
    PlusCircle: createIcon("PlusCircle"),
    RefreshCw: createIcon("RefreshCw"),
    Search: createIcon("Search"),
    Trash2: createIcon("Trash2"),
    X: createIcon("X"),
  };
});

import TodayScreen from "@/app/(tabs)/index";
import {
  resolveBulkActionBarEnterShift,
  resolveTodayView,
  shouldRedirectGoalsTab,
} from "@/app/(tabs)/index";

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
    vi.useRealTimers();
    mockRouterPush.mockReset();
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
    uiState.selectedDate = "2026-04-07";
    uiState.followToday = true;
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
    expect(uiState.setActiveView).toHaveBeenCalledWith("today");
  });

  it("advances a followed today selection after midnight without reopening the screen", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T23:59:55"));
    uiState.selectedDate = "2026-04-07";
    uiState.followToday = true;

    await renderTodayScreen();

    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });

    expect(uiState.selectedDate).toBe("2026-04-08");
    expect(syncSelectedDateWithToday).toHaveBeenCalled();
  });

  it("keeps a manually pinned date fixed after midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T23:59:55"));
    uiState.selectedDate = "2026-04-06";
    uiState.followToday = false;

    await renderTodayScreen();

    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });

    expect(uiState.selectedDate).toBe("2026-04-06");
  });
});
