import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTourUIState,
  getPersistedUIState,
  getTourSessionUIState,
} from "@orbit/shared/stores";

import { TodayHabitsHeader } from "@/components/today/today-habits-header";
import { TourProvider } from "@/components/tour/tour-provider";
import { useTourStore } from "@/stores/tour-store";
import { useUIStore } from "@/stores/ui-store";
import { Animated } from "@/test-mocks/react-native";

const TestRenderer: typeof import("react-test-renderer") = require("react-test-renderer");
type RenderedTree = import("react-test-renderer").ReactTestRenderer;

vi.mock("@/components/today/today-shell", () => ({
  TodayDateNavigation: () => null,
}));

vi.mock("@/components/habits/today-ai-summary", () => ({
  TodayAISummary: () => null,
}));

vi.mock("expo-router", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/hooks/use-profile", () => ({
  useProfile: () => ({ profile: { hasProAccess: true } }),
}));

vi.mock("@/hooks/use-tour-mock-data", () => ({
  useTourMockData: () => ({ inject: vi.fn(), restore: vi.fn() }),
}));

vi.mock("@/components/ui/icons", () => {
  const Icon = () => null;
  return {
    AdjustmentsHorizontal: Icon,
    AlertTriangle: Icon,
    ArrowLeft: Icon,
    Check: Icon,
    CheckCircle2: Icon,
    ChevronLeft: Icon,
    ChevronRight: Icon,
    ChevronsDownUp: Icon,
    ChevronsUpDown: Icon,
    Eye: Icon,
    Filter: Icon,
    Home: Icon,
    Minus: Icon,
    MoreVertical: Icon,
    Plus: Icon,
    RefreshCw: Icon,
    Search: Icon,
    Snowflake: Icon,
    Target: Icon,
    WifiOff: Icon,
    X: Icon,
  };
});

const asyncStorageState = vi.hoisted(() => ({
  data: new Map<string, string>(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) =>
      Promise.resolve(asyncStorageState.data.get(key) ?? null),
    ),
    setItem: vi.fn((key: string, value: string) => {
      asyncStorageState.data.set(key, value);
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      asyncStorageState.data.delete(key);
      return Promise.resolve();
    }),
  },
}));

describe("mobile ui store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-06T12:00:00Z"));
    asyncStorageState.data.clear();
    useTourStore.getState().endTour();
    useTourStore.getState().setHiddenSections([]);
    useUIStore.setState({
      activeFilters: {},
      activeView: "today",
      streakCelebration: null,
      allDoneCelebration: false,
      allDoneCelebratedDate: "",
      goalCompletedCelebration: null,
      isSelectMode: false,
      selectedHabitIds: new Set<string>(),
      manuallySelectedIds: new Set<string>(),
      lastCreatedHabitId: null,
      showCreateModal: false,
      showCreateGoalModal: false,
      searchQuery: "",
      selectedFrequency: null,
      selectedTagIds: [],
      showCompleted: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    asyncStorageState.data.clear();
  });

  it("merges filters and updates search state", () => {
    const {
      setFilters,
      setSearchQuery,
      setActiveView,
      setSelectedFrequency,
      setSelectedTagIds,
      setShowCompleted,
    } = useUIStore.getState();

    setFilters({ dateFrom: "2026-04-06" });
    setFilters({ dateTo: "2026-04-06" });
    setSearchQuery("focus");
    setActiveView("all");
    setSelectedFrequency("Week");
    setSelectedTagIds(["tag-1"]);
    setShowCompleted(true);

    expect(useUIStore.getState()).toMatchObject({
      activeFilters: { dateFrom: "2026-04-06", dateTo: "2026-04-06" },
      searchQuery: "focus",
      activeView: "all",
      selectedFrequency: "Week",
      selectedTagIds: ["tag-1"],
      showCompleted: true,
    });
  });

  it.each([
    { query: "focus", isSearchOpen: false, selected: true },
    { query: "   ", isSearchOpen: false, selected: false },
    { query: "   ", isSearchOpen: true, selected: false },
  ])(
    "marks the search control selected only for a trimmed query",
    ({ query, isSearchOpen, selected }) => {
      const emptyCallback = vi.fn();
      let tree: RenderedTree | undefined;

      void TestRenderer.act(() => {
        tree = TestRenderer.create(
          React.createElement(TodayHabitsHeader, {
            header: null,
            showSummary: false,
            dateStr: "2026-04-06",
            currentActiveView: "all",
            dateLabel: "April 6",
            selectedDate: new Date("2026-04-06T12:00:00Z"),
            slideDirection: "left",
            dateLabelAnim: new Animated.Value(
              0,
            ) as unknown as import("react-native").Animated.Value,
            isSearchFocused: false,
            showDayProgress: false,
            dayProgress: { done: 0, total: 0 },
            isSearchOpen,
            searchQuery: query,
            selectedFrequency: null,
            selectedTagIds: [],
            tags: [],
            frequencyOptions: [],
            isSelectMode: false,
            showCompleted: false,
            isFetching: false,
            allCollapsed: false,
            showControlsMenu: false,
            showFreqMenu: false,
            controlsButtonRef:
              React.createRef<import("react-native").View | null>(),
            freqMenuButtonRef:
              React.createRef<import("react-native").View | null>(),
            filtersAnimatedStyle: {},
            onGoToPreviousDay: emptyCallback,
            onGoToToday: emptyCallback,
            onGoToNextDay: emptyCallback,
            onSearchToggle: emptyCallback,
            onSearchChange: emptyCallback,
            onSearchFocusChange: emptyCallback,
            onTagToggle: emptyCallback,
            onToggleFreqMenu: emptyCallback,
            onToggleControlsMenu: emptyCallback,
            onCloseControlsMenu: emptyCallback,
            onCloseFreqMenu: emptyCallback,
            onToggleSelect: emptyCallback,
            onToggleCollapse: emptyCallback,
            onRefresh: emptyCallback,
            onToggleCompleted: emptyCallback,
            onSelectFrequency: emptyCallback,
          }),
        );
      });

      const searchButton = tree?.root.findAll(
        (node) =>
          node.props.accessibilityLabel === "habits.searchPlaceholder" &&
          typeof node.props.onPress === "function",
      )[0];

      expect(searchButton?.props.accessibilityState).toEqual({ selected });

      const resolveStyle = searchButton?.props.style as (state: {
        pressed: boolean;
      }) => unknown[];
      const restingStyle = resolveStyle({ pressed: false });
      const pressedStyle = resolveStyle({ pressed: true });
      const hasActiveIndicator = restingStyle.some(
        (layer) =>
          typeof layer === "object" &&
          layer !== null &&
          "borderColor" in layer,
      );

      expect(hasActiveIndicator).toBe(selected);
      expect(restingStyle.at(-1)).toBeNull();
      expect(pressedStyle.at(-1)).not.toBeNull();
    },
  );

  it("toggles selection mode and cascades descendant selection", () => {
    const { toggleSelectMode, toggleSelectionCascade } = useUIStore.getState();

    toggleSelectMode();
    toggleSelectionCascade(
      "parent",
      () => ["child-1", "child-2"],
      () => false,
    );

    expect(useUIStore.getState().selectedHabitIds).toEqual(
      new Set(["parent", "child-1", "child-2"]),
    );

    toggleSelectionCascade(
      "parent",
      () => ["child-1", "child-2"],
      () => false,
    );

    expect(useUIStore.getState().selectedHabitIds.size).toBe(0);
  });

  it("enters bulk select mode without selecting habits", () => {
    useUIStore.getState().toggleSelectMode();

    expect(useUIStore.getState().isSelectMode).toBe(true);
    expect(useUIStore.getState().selectedHabitIds.size).toBe(0);
  });

  it("enters select mode with the tapped habit and descendants selected", () => {
    const { toggleSelectMode, toggleSelectionCascade } = useUIStore.getState();

    if (!useUIStore.getState().isSelectMode) {
      toggleSelectMode();
    }

    toggleSelectionCascade(
      "habit-1",
      () => ["child-1", "child-2"],
      () => false,
    );

    expect(useUIStore.getState().isSelectMode).toBe(true);
    expect(useUIStore.getState().selectedHabitIds).toEqual(
      new Set(["habit-1", "child-1", "child-2"]),
    );
  });

  it("shows all-done celebration only for completed top-level habits on today filters", () => {
    useUIStore.setState({
      activeFilters: { dateFrom: "2026-04-06", dateTo: "2026-04-06" },
    });

    useUIStore.getState().checkAllDoneCelebration(
      new Map([
        ["parent-1", { parentId: null, isCompleted: true }],
        ["child-1", { parentId: "parent-1", isCompleted: false }],
      ]),
    );

    expect(useUIStore.getState().allDoneCelebration).toBe(true);
  });

  it("clears the last created habit id after the timeout", async () => {
    useUIStore.getState().setLastCreatedHabitId("habit-1");
    expect(useUIStore.getState().lastCreatedHabitId).toBe("habit-1");

    await vi.advanceTimersByTimeAsync(1500);

    expect(useUIStore.getState().lastCreatedHabitId).toBeNull();
  });

  it("rehydrates durable today context without restoring search", async () => {
    asyncStorageState.data.set(
      "orbit-ui-store",
      JSON.stringify({
        state: {
          activeFilters: { search: "focus" },
          activeView: "general",
          searchQuery: "focus",
          selectedFrequency: "Month",
          selectedTagIds: ["tag-2"],
          showCompleted: true,
        },
        version: 2,
      }),
    );

    await useUIStore.persist.rehydrate();

    expect(useUIStore.getState()).toMatchObject({
      activeFilters: {},
      activeView: "general",
      searchQuery: "",
      selectedFrequency: "Month",
      selectedTagIds: ["tag-2"],
      showCompleted: true,
    });
    expect(asyncStorageState.data.get("orbit-ui-store")).not.toContain(
      "searchQuery",
    );
  });

  it("migrates the retired goals view from the previous persistence version", async () => {
    asyncStorageState.data.set(
      "orbit-ui-store",
      JSON.stringify({
        state: {
          activeFilters: {},
          activeView: "goals",
          selectedFrequency: null,
          selectedTagIds: [],
          showCompleted: false,
        },
        version: 3,
      }),
    );

    await useUIStore.persist.rehydrate();

    expect(useUIStore.getState().activeView).toBe("today");
  });

  it("drops legacy day-selection keys when rehydrating an old snapshot", async () => {
    asyncStorageState.data.set(
      "orbit-ui-store",
      JSON.stringify({
        state: {
          activeFilters: {},
          selectedDate: "2026-04-06",
          followToday: false,
          activeView: "today",
          searchQuery: "",
          selectedFrequency: null,
          selectedTagIds: [],
          showCompleted: false,
        },
        version: 2,
      }),
    );

    await useUIStore.persist.rehydrate();

    const persisted = asyncStorageState.data.get("orbit-ui-store");
    expect(persisted).not.toContain("selectedDate");
    expect(persisted).not.toContain("followToday");
  });

  it("creates the canonical tour ui state for a fresh session", () => {
    expect(createTourUIState()).toEqual({
      activeFilters: {},
      activeView: "today",
      searchQuery: "",
      selectedFrequency: null,
      selectedTagIds: [],
      showCompleted: true,
      setupChecklistDismissed: false,
    });
  });

  it("restores an active search after applying the tour ui state", () => {
    useUIStore.setState({ searchQuery: "focus" });
    const snapshot = getTourSessionUIState(useUIStore.getState());

    useUIStore.setState(createTourUIState());
    expect(useUIStore.getState().searchQuery).toBe("");

    useUIStore.setState(snapshot);
    expect(useUIStore.getState().searchQuery).toBe("focus");
  });

  it("clears an active search during the mobile tour and restores it afterward", () => {
    useUIStore.setState({ searchQuery: "focus" });
    let tree: { unmount: () => void } | undefined;

    void TestRenderer.act(() => {
      tree = TestRenderer.create(
        React.createElement(TourProvider, null),
      ) as unknown as { unmount: () => void };
    });
    void TestRenderer.act(() => {
      useTourStore.getState().startSectionReplay("habits");
    });
    expect(useUIStore.getState().searchQuery).toBe("");

    void TestRenderer.act(() => {
      useTourStore.getState().endTour();
    });
    expect(useUIStore.getState().searchQuery).toBe("focus");

    void TestRenderer.act(() => tree?.unmount());
  });

  it("returns cloned persisted ui state snapshots", () => {
    useUIStore.setState({
      activeFilters: { dateFrom: "2026-04-06", includeOverdue: true },
      selectedTagIds: ["focus"],
    });

    const snapshot = getPersistedUIState(useUIStore.getState());

    useUIStore.setState({
      activeFilters: { dateFrom: "2026-04-07" },
      selectedTagIds: ["health"],
    });

    expect(snapshot.activeFilters).toEqual({
      dateFrom: "2026-04-06",
      includeOverdue: true,
    });
    expect(snapshot.selectedTagIds).toEqual(["focus"]);
  });
});
