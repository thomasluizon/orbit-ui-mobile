import type { HabitsFilter } from "../types/habit";
import { formatAPIDate } from "../utils/dates";
import { isRecord } from "../utils/is-record";
import {
  activateNextCelebration,
  clearCelebrationKind,
  createCelebrationItem,
  enqueueCelebrationItem,
  type CelebrationKind,
  type CelebrationPayloadMap,
  type CelebrationQueueItem,
  type CelebrationState,
} from "./celebration-queue";

export type {
  CelebrationKind,
  CelebrationPayloadMap,
  CelebrationQueueItem,
} from "./celebration-queue";

type UIStoreSet = {
  (
    partial:
      | Partial<UIStoreState>
      | ((state: UIStoreState) => Partial<UIStoreState>),
    replace?: false,
  ): void;
  (
    state: UIStoreState | ((state: UIStoreState) => UIStoreState),
    replace: true,
  ): void;
};

type UIStoreGet = () => UIStoreState;

export type HabitFrequencyFilter = "Day" | "Week" | "Month" | "Year" | "none";
export type ActiveView = "today" | "all" | "general";

function isActiveView(value: unknown): value is ActiveView {
  return (
    value === "today" ||
    value === "all" ||
    value === "general"
  );
}

export interface PersistedUIState {
  activeFilters: HabitsFilter;
  activeView: ActiveView;
}

export interface TourUIState extends PersistedUIState {
  searchQuery: string;
}

export function migratePersistedUIState(
  persistedState: unknown,
): PersistedUIState {
  const state = isRecord(persistedState) ? persistedState : {};
  const activeFilters = isRecord(state.activeFilters)
    ? { ...state.activeFilters }
    : {};
  delete activeFilters.search;

  return {
    activeFilters,
    activeView: isActiveView(state.activeView) ? state.activeView : "today",
  };
}

export interface UIStoreState {
  activeFilters: HabitsFilter;
  setFilters: (filters: Partial<HabitsFilter>) => void;

  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;

  activeCelebration: CelebrationQueueItem | null;
  queuedCelebrations: CelebrationQueueItem[];
  enqueueCelebration: <TKind extends CelebrationKind>(
    kind: TKind,
    payload: CelebrationPayloadMap[TKind],
  ) => void;
  completeActiveCelebration: (id?: string) => void;
  hasCelebrationInFlight: () => boolean;

  streakCelebration: { streak: number } | null;
  allDoneCelebration: boolean;
  allDoneCelebratedDate: string;
  goalCompletedCelebration: { name: string } | null;
  setStreakCelebration: (data: { streak: number } | null) => void;
  setAllDoneCelebration: (value: boolean) => void;
  setGoalCompletedCelebration: (data: { name: string } | null) => void;
  checkAllDoneCelebration: (
    habitsById: Map<string, { parentId: string | null; isCompleted: boolean }>,
  ) => void;

  isSelectMode: boolean;
  selectedHabitIds: Set<string>;
  manuallySelectedIds: Set<string>;
  lastCreatedHabitId: string | null;
  toggleSelectMode: () => void;
  toggleHabitSelection: (id: string) => void;
  toggleSelectionCascade: (
    habitId: string,
    getDescendantIds: (id: string) => string[],
    isAncestorSelected: (id: string) => boolean,
  ) => void;
  selectAllHabits: (allIds: string[]) => void;
  clearSelection: () => void;
  setLastCreatedHabitId: (id: string | null) => void;

  showCreateModal: boolean;
  setShowCreateModal: (show: boolean) => void;
  showCreateGoalModal: boolean;
  setShowCreateGoalModal: (show: boolean) => void;

  /** Transient shell state. These values are deliberately excluded from persistence. */
  todayFabHidden: boolean;
  setTodayFabHidden: (hidden: boolean) => void;
  astraConversationOpen: boolean;
  setAstraConversationOpen: (open: boolean) => void;

  searchQuery: string;
  setSearchQuery: (query: string) => void;

}

export function getPersistedUIState(state: UIStoreState): PersistedUIState {
  const activeFilters = { ...state.activeFilters };
  delete activeFilters.search;

  return {
    activeFilters,
    activeView: state.activeView,
  };
}

export function getTourSessionUIState(state: UIStoreState): TourUIState {
  return {
    ...getPersistedUIState(state),
    searchQuery: state.searchQuery,
  };
}

export function createTourUIState(): TourUIState {
  return {
    activeFilters: {},
    activeView: "today",
    searchQuery: "",
  };
}

export function createUIStoreState(
  set: UIStoreSet,
  get: UIStoreGet,
): UIStoreState {
  let createdHabitTimer: ReturnType<typeof setTimeout> | undefined;
  let celebrationSequence = 0;

  function nextCelebrationSequence(): number {
    const sequence = celebrationSequence;
    celebrationSequence += 1;
    return sequence;
  }

  function createCelebrationSetter<TKind extends "streak" | "goal-completed">(
    kind: TKind,
    clearedLegacyState: Partial<CelebrationState>,
  ): (payload: CelebrationPayloadMap[TKind] | null) => void {
    return (payload) =>
      set((state) => {
        if (payload) {
          return enqueueCelebrationItem(
            state,
            createCelebrationItem(kind, payload, nextCelebrationSequence()),
          );
        }

        return clearCelebrationKind(state, kind, clearedLegacyState);
      });
  }

  return {
    activeFilters: {},
    setFilters: (filters) =>
      set((state) => ({
        activeFilters: { ...state.activeFilters, ...filters },
      })),

    activeView: "today",
    setActiveView: (view) => set({ activeView: view }),

    activeCelebration: null,
    queuedCelebrations: [],
    streakCelebration: null,
    allDoneCelebration: false,
    allDoneCelebratedDate: "",
    goalCompletedCelebration: null,

    enqueueCelebration: (kind, payload) =>
      set((state) =>
        enqueueCelebrationItem(
          state,
          createCelebrationItem(kind, payload, nextCelebrationSequence()),
        ),
      ),

    completeActiveCelebration: (id) =>
      set((state) => {
        if (!state.activeCelebration) return {};
        if (id && state.activeCelebration.id !== id) return {};
        return activateNextCelebration(state.queuedCelebrations);
      }),

    hasCelebrationInFlight: () => {
      const state = get();
      return (
        state.activeCelebration !== null || state.queuedCelebrations.length > 0
      );
    },

    setStreakCelebration: createCelebrationSetter("streak", {
      streakCelebration: null,
    }),

    setAllDoneCelebration: (value) =>
      set((state) => {
        if (value) {
          return enqueueCelebrationItem(
            state,
            createCelebrationItem("all-done", {}, nextCelebrationSequence()),
          );
        }

        return clearCelebrationKind(state, "all-done", {
          allDoneCelebration: false,
        });
      }),

    setGoalCompletedCelebration: createCelebrationSetter("goal-completed", {
      goalCompletedCelebration: null,
    }),

    checkAllDoneCelebration: (habitsById) => {
      const { activeFilters, allDoneCelebratedDate, enqueueCelebration } =
        get();
      const today = formatAPIDate(new Date());

      if (activeFilters.dateFrom !== today || activeFilters.dateTo !== today)
        return;
      if (allDoneCelebratedDate === today) return;
      if (habitsById.size === 0) return;

      const topLevel = Array.from(habitsById.values()).filter(
        (h) => h.parentId === null,
      );
      const allDone = topLevel.every((h) => h.isCompleted);
      const hasCompletion = topLevel.some((h) => h.isCompleted);

      if (allDone && hasCompletion) {
        set({ allDoneCelebratedDate: today });
        enqueueCelebration("all-done", {});
      }
    },

    isSelectMode: false,
    selectedHabitIds: new Set<string>(),
    manuallySelectedIds: new Set<string>(),
    lastCreatedHabitId: null,

    toggleSelectMode: () =>
      set((state) => ({
        isSelectMode: !state.isSelectMode,
        selectedHabitIds: state.isSelectMode
          ? new Set<string>()
          : state.selectedHabitIds,
        manuallySelectedIds: state.isSelectMode
          ? new Set<string>()
          : state.manuallySelectedIds,
      })),

    toggleHabitSelection: (id) =>
      set((state) => {
        const next = new Set(state.selectedHabitIds);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return { selectedHabitIds: next };
      }),

    toggleSelectionCascade: (habitId, getDescendantIds, isAncestorSelected) =>
      set((state) => {
        if (isAncestorSelected(habitId)) return state;

        const selected = new Set(state.selectedHabitIds);
        const manual = new Set(state.manuallySelectedIds);
        const descendants = getDescendantIds(habitId);

        if (selected.has(habitId)) {
          selected.delete(habitId);
          manual.delete(habitId);
          for (const id of descendants) {
            if (!manual.has(id)) selected.delete(id);
          }
        } else {
          selected.add(habitId);
          manual.add(habitId);
          for (const id of descendants) selected.add(id);
        }

        return { selectedHabitIds: selected, manuallySelectedIds: manual };
      }),

    selectAllHabits: (allIds) =>
      set({
        selectedHabitIds: new Set(allIds),
        manuallySelectedIds: new Set(allIds),
      }),

    clearSelection: () =>
      set({
        isSelectMode: false,
        selectedHabitIds: new Set<string>(),
        manuallySelectedIds: new Set<string>(),
      }),

    setLastCreatedHabitId: (id) => {
      if (createdHabitTimer) clearTimeout(createdHabitTimer);
      set({ lastCreatedHabitId: id });
      if (id) {
        createdHabitTimer = setTimeout(
          () => set({ lastCreatedHabitId: null }),
          1500,
        );
      }
    },

    showCreateModal: false,
    setShowCreateModal: (show) => set({ showCreateModal: show }),
    showCreateGoalModal: false,
    setShowCreateGoalModal: (show) => set({ showCreateGoalModal: show }),
    todayFabHidden: false,
    setTodayFabHidden: (hidden) => set({ todayFabHidden: hidden }),
    astraConversationOpen: false,
    setAstraConversationOpen: (open) => set({ astraConversationOpen: open }),

    searchQuery: "",
    setSearchQuery: (query) => set({ searchQuery: query }),

  };
}
