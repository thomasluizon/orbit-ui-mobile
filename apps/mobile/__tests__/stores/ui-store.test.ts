import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTourUIState, getPersistedUIState } from "@orbit/shared/stores";
const asyncStorageState = vi.hoisted(() => ({
  data: new Map<string, string>(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(
      async (key: string) => asyncStorageState.data.get(key) ?? null,
    ),
    setItem: vi.fn(async (key: string, value: string) => {
      asyncStorageState.data.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      asyncStorageState.data.delete(key);
    }),
  },
}));

import { useUIStore } from "@/stores/ui-store";

describe("mobile ui store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-06T12:00:00Z"));
    asyncStorageState.data.clear();
    useUIStore.setState({
      activeFilters: {},
      selectedDate: "2026-04-06",
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
    setActiveView("goals");
    setSelectedFrequency("Week");
    setSelectedTagIds(["tag-1"]);
    setShowCompleted(true);

    expect(useUIStore.getState()).toMatchObject({
      activeFilters: { dateFrom: "2026-04-06", dateTo: "2026-04-06" },
      searchQuery: "focus",
      activeView: "goals",
      selectedFrequency: "Week",
      selectedTagIds: ["tag-1"],
      showCompleted: true,
    });
  });

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

  it("rehydrates the durable today context from async storage", async () => {
    asyncStorageState.data.set(
      "orbit-ui-store",
      JSON.stringify({
        state: {
          activeFilters: { search: "focus" },
          selectedDate: "2026-04-08",
          activeView: "general",
          searchQuery: "focus",
          selectedFrequency: "Month",
          selectedTagIds: ["tag-2"],
          showCompleted: true,
        },
        version: 0,
      }),
    );

    await useUIStore.persist.rehydrate();

    expect(useUIStore.getState()).toMatchObject({
      activeFilters: { search: "focus" },
      selectedDate: "2026-04-08",
      activeView: "general",
      searchQuery: "focus",
      selectedFrequency: "Month",
      selectedTagIds: ["tag-2"],
      showCompleted: true,
    });
  });

  it("creates the canonical tour ui state for a fresh session", () => {
    expect(createTourUIState("2026-04-06")).toEqual({
      activeFilters: {},
      selectedDate: "2026-04-06",
      activeView: "today",
      searchQuery: "",
      selectedFrequency: null,
      selectedTagIds: [],
      showCompleted: true,
    });
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
