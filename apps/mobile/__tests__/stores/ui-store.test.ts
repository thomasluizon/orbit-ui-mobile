import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockHabit } from "@orbit/shared/__tests__/factories";
import {
  getPersistedUIState,
} from "@orbit/shared/stores";

import { setUIAccountScope, useUIStore } from "@/stores/ui-store";


vi.mock("expo-router", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/hooks/use-profile", () => ({
  useProfile: () => ({ profile: { hasProAccess: true } }),
}));


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
      astraConversationOpen: false,
      astraEntryPointIntent: undefined,
      searchQuery: "",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    asyncStorageState.data.clear();
  });

  it("keeps an opened create form through first account rehydration and clears it on account replacement", async () => {
    useUIStore.getState().setShowCreateModal(true);
    await setUIAccountScope("first-account");
    expect(useUIStore.getState().showCreateModal).toBe(true);

    await setUIAccountScope("replacement-account");
    expect(useUIStore.getState().showCreateModal).toBe(false);
    useUIStore.persist.setOptions({ name: "orbit-ui-store" });
  });

  it("merges filters and updates search state", () => {
    const {
      setFilters,
      setSearchQuery,
      setActiveView,
    } = useUIStore.getState();

    setFilters({ dateFrom: "2026-04-06" });
    setFilters({ dateTo: "2026-04-06" });
    setSearchQuery("focus");
    setActiveView("all");

    expect(useUIStore.getState()).toMatchObject({
      activeFilters: { dateFrom: "2026-04-06", dateTo: "2026-04-06" },
      searchQuery: "focus",
      activeView: "all",
    });
  });

  it("keeps Support intent only while its conversation is open", () => {
    const { setAstraConversationOpen } = useUIStore.getState();
    setAstraConversationOpen(true, "support");
    expect(useUIStore.getState().astraEntryPointIntent).toBe("support");
    setAstraConversationOpen(false);
    setAstraConversationOpen(true);
    expect(useUIStore.getState().astraEntryPointIntent).toBeUndefined();
  });

  it("toggles selection mode and cascades descendant selection", () => {
    const { toggleSelectMode, toggleSelectionCascade } = useUIStore.getState();

    toggleSelectMode();
    toggleSelectionCascade(
      "parent",
      () => ["child-1", "child-2"],
    );

    expect(useUIStore.getState().selectedHabitIds).toEqual(
      new Set(["parent", "child-1", "child-2"]),
    );

    toggleSelectionCascade(
      "parent",
      () => ["child-1", "child-2"],
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
    );

    expect(useUIStore.getState().isSelectMode).toBe(true);
    expect(useUIStore.getState().selectedHabitIds).toEqual(
      new Set(["habit-1", "child-1", "child-2"]),
    );
  });

  it("shows all-done celebration for a logged habit due today", () => {
    const habit = createMockHabit({ id: 'habit', scheduledDates: ['2026-04-06'], isLoggedInRange: true });
    useUIStore.getState().checkAllDoneCelebration(
      new Map([[habit.id, habit]]), new Map(), '2026-04-06',
    );

    expect(useUIStore.getState().allDoneCelebration).toBe(true);
    expect(useUIStore.getState().activeCelebration?.payload).toEqual({ count: 1 });
  });

  it("clears the last created habit id after the timeout", async () => {
    useUIStore.getState().setLastCreatedHabitId("habit-1");
    expect(useUIStore.getState().lastCreatedHabitId).toBe("habit-1");

    await vi.advanceTimersByTimeAsync(1500);

    expect(useUIStore.getState().lastCreatedHabitId).toBeNull();
  });

  it("rehydrates an existing payload without restoring retired Today controls", async () => {
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
        version: 4,
      }),
    );

    await useUIStore.persist.rehydrate();

    expect(useUIStore.getState()).toMatchObject({
      activeFilters: {},
      activeView: "general",
      searchQuery: "",
    });
    expect(useUIStore.getState()).not.toHaveProperty("selectedFrequency");
    expect(useUIStore.getState()).not.toHaveProperty("selectedTagIds");
    expect(useUIStore.getState()).not.toHaveProperty("showCompleted");
    expect(asyncStorageState.data.get("orbit-ui-store")).not.toContain(
      "searchQuery",
    );
    expect(asyncStorageState.data.get("orbit-ui-store")).not.toContain(
      "showCompleted",
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

  it("returns cloned persisted ui state snapshots", () => {
    useUIStore.setState({
      activeFilters: { dateFrom: "2026-04-06", includeOverdue: true },
    });

    const snapshot = getPersistedUIState(useUIStore.getState());

    useUIStore.setState({
      activeFilters: { dateFrom: "2026-04-07" },
    });

    expect(snapshot.activeFilters).toEqual({
      dateFrom: "2026-04-06",
      includeOverdue: true,
    });
  });
});
