import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createUIStoreState,
  getPersistedUIState,
  migratePersistedUIState,
  type UIStoreState,
} from "../stores/ui-store";
import { createMockHabit } from './factories';

function createStoreHarness() {
  let state = {} as UIStoreState;

  const set = (
    partial:
      | Partial<UIStoreState>
      | ((current: UIStoreState) => Partial<UIStoreState>),
  ) => {
    const next = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...next };
  };

  const get = () => state;
  state = createUIStoreState(set, get);

  return {
    getState: () => state,
    setState: (patch: Partial<UIStoreState>) => {
      state = { ...state, ...patch };
    },
  };
}

describe("shared ui store", () => {
  it("keeps the Calendar error signal outside persisted UI state", () => {
    const store = createStoreHarness();
    store.getState().setCalendarHasError(true);
    expect(store.getState().calendarHasError).toBe(true);
    expect(getPersistedUIState(store.getState())).not.toHaveProperty('calendarHasError');
  });

  it("reserves only one prompt while an overlay or create form is open", () => {
    const store = createStoreHarness();
    expect(store.getState().tryReservePromptOverlay("calendar")).toBe(true);
    expect(store.getState().tryReservePromptOverlay("consent")).toBe(false);
    store.getState().unregisterOpenOverlay("calendar");
    store.getState().setShowCreateModal(true);
    expect(store.getState().tryReservePromptOverlay("consent")).toBe(false);
    store.getState().setShowCreateModal(false);
    store.getState().setAstraConversationOpen(true);
    expect(store.getState().tryReservePromptOverlay("consent")).toBe(false);
    store.getState().setAstraConversationOpen(false);
    expect(store.getState().tryReservePromptOverlay("consent")).toBe(true);
  });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-06T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("merges filters and updates view and search state", () => {
    const store = createStoreHarness();
    const { setFilters, setSearchQuery, setActiveView } = store.getState();

    setFilters({ dateFrom: "2026-04-06" });
    setFilters({ dateTo: "2026-04-06" });
    setSearchQuery("focus");
    setActiveView("all");

    expect(store.getState()).toMatchObject({
      activeFilters: { dateFrom: "2026-04-06", dateTo: "2026-04-06" },
      searchQuery: "focus",
      activeView: "all",
    });
  });

  it("toggles cascaded selection and clears it when toggled again", () => {
    const store = createStoreHarness();
    const { toggleSelectMode, toggleSelectionCascade } = store.getState();

    toggleSelectMode();
    toggleSelectionCascade(
      "parent",
      () => ["child-1", "child-2"],
    );

    expect(store.getState().selectedHabitIds).toEqual(
      new Set(["parent", "child-1", "child-2"]),
    );

    toggleSelectionCascade(
      "parent",
      () => ["child-1", "child-2"],
    );

    expect(store.getState().selectedHabitIds.size).toBe(0);
  });

  it("shows all-done celebration for a logged habit due today", () => {
    const store = createStoreHarness();
    const habit = createMockHabit({ id: 'habit', isCompleted: false, isLoggedInRange: true, scheduledDates: ['2026-04-06'] });
    store.getState().checkAllDoneCelebration(
      new Map([[habit.id, habit]]), new Map(), '2026-04-06',
    );

    expect(store.getState().allDoneCelebration).toBe(true);
    expect(store.getState().allDoneCelebratedDate).toBe("2026-04-06");
    expect(store.getState().activeCelebration?.payload).toEqual({ count: 1 });
  });

  it('retains the completed day across reload and a later added habit', () => {
    const store = createStoreHarness();
    const date = '2026-04-06';
    const habit = createMockHabit({ id: 'first', scheduledDates: [date], isLoggedInRange: true });
    const habits = new Map([[habit.id, habit]]);
    store.getState().checkAllDoneCelebration(habits, new Map(), date);
    const restored = createStoreHarness();
    restored.setState(migratePersistedUIState(getPersistedUIState(store.getState())));
    habits.set('later', { ...habit, id: 'later', isLoggedInRange: false });
    restored.getState().checkAllDoneCelebration(habits, new Map(), date);
    habits.set('later', { ...habit, id: 'later' });
    restored.getState().checkAllDoneCelebration(habits, new Map(), date);
    expect(restored.getState().activeCelebration).toBeNull();
    expect(restored.getState().allDoneCelebratedDate).toBe(date);
  });

  it('uses one panel when the final log also extends the daily streak', () => {
    const store = createStoreHarness();
    const date = '2026-04-06';
    store.getState().showStreakMoment(5, 4, { date, intent: 'log', countsTowardStreak: true });
    const habit = createMockHabit({ scheduledDates: [date], isLoggedInRange: true });
    store.getState().checkAllDoneCelebration(new Map([[habit.id, habit]]), new Map(), date);
    expect(store.getState().activeCelebration?.kind).toBe('all-done');
    expect(store.getState().queuedCelebrations).toEqual([]);
  });

  it('celebrates a confirmed skip of the last pending habit', () => {
    const store = createStoreHarness();
    const date = '2026-04-06';
    const habit = createMockHabit({ id: 'skipped', scheduledDates: ['2026-04-07'] });
    const habits = new Map([[habit.id, habit]]);
    store.getState().checkAllDoneCelebration(habits, new Map(), date, 'UTC');
    expect(store.getState().activeCelebration).toBeNull();
    store.getState().checkAllDoneCelebration(habits, new Map(), date, 'UTC', new Set([habit.id]));
    expect(store.getState().activeCelebration?.kind).toBe('all-done');
    expect(store.getState().activeCelebration?.payload).toEqual({ count: 1 });
  });

  it("clears the last created habit id after the timeout", async () => {
    const store = createStoreHarness();

    store.getState().setLastCreatedHabitId("habit-1");
    expect(store.getState().lastCreatedHabitId).toBe("habit-1");

    await vi.advanceTimersByTimeAsync(1500);

    expect(store.getState().lastCreatedHabitId).toBeNull();
  });

  it("tracks celebration priority, de-duplicates queued items, and advances by id", () => {
    const store = createStoreHarness();
    const {
      enqueueCelebration,
      completeActiveCelebration,
      hasCelebrationInFlight,
    } = store.getState();

    enqueueCelebration("streak", { streak: 7 });
    enqueueCelebration("level-up", { level: 2 });
    enqueueCelebration("level-up", { level: 2 });

    expect(hasCelebrationInFlight()).toBe(true);
    expect(store.getState().activeCelebration?.kind).toBe("streak");
    expect(store.getState().queuedCelebrations).toHaveLength(1);

    completeActiveCelebration("different-id");
    expect(store.getState().activeCelebration?.kind).toBe("streak");

    completeActiveCelebration(store.getState().activeCelebration?.id);
    expect(store.getState().activeCelebration?.kind).toBe("level-up");

    completeActiveCelebration(store.getState().activeCelebration?.id);
    expect(hasCelebrationInFlight()).toBe(false);
  });

  it("removes queued goal celebrations when they are cleared before becoming active", () => {
    const store = createStoreHarness();

    store.getState().setStreakCelebration({ streak: 7 });
    store
      .getState()
      .setGoalCompletedCelebration({
        name: "Ship Orbit",
        count: 12,
        unit: "releases",
      });

    expect(
      store.getState().queuedCelebrations.map((item) => item.kind),
    ).toEqual(["goal-completed"]);

    store.getState().setGoalCompletedCelebration(null);

    expect(store.getState().queuedCelebrations).toEqual([]);
    expect(store.getState().goalCompletedCelebration).toBeNull();
    expect(store.getState().streakCelebration).toEqual({ streak: 7 });
  });

  it("returns cloned persisted ui state snapshots", () => {
    const store = createStoreHarness();

    store.getState().setFilters({ dateFrom: "2026-04-06" });
    store.setState({
      activeFilters: { dateFrom: "2026-04-06", includeOverdue: true },
      searchQuery: "focus",
    });

    const snapshot = getPersistedUIState(store.getState());

    store.setState({
      activeFilters: { dateFrom: "2026-04-07" },
    });

    expect(snapshot.activeFilters).toEqual({
      dateFrom: "2026-04-06",
      includeOverdue: true,
    });
    expect(snapshot).not.toHaveProperty("searchQuery");
  });

  it("excludes the day selection from the persisted snapshot", () => {
    const store = createStoreHarness();

    const snapshot = getPersistedUIState(store.getState());

    expect(snapshot).not.toHaveProperty("selectedDate");
    expect(snapshot).not.toHaveProperty("followToday");
  });

  it("excludes active search filters from the persisted snapshot", () => {
    const store = createStoreHarness();
    store.setState({
      activeFilters: { dateFrom: "2026-04-06", search: "focus" },
    });

    expect(getPersistedUIState(store.getState()).activeFilters).toEqual({
      dateFrom: "2026-04-06",
    });
  });

  it("drops legacy day-selection, search, and retired control keys when migrating persisted state", () => {
    const migrated = migratePersistedUIState({
      activeFilters: { search: "focus" },
      selectedDate: "2000-01-01",
      followToday: false,
      activeView: "all",
      searchQuery: "focus",
      selectedFrequency: "Month",
      selectedTagIds: ["deep-work"],
      showCompleted: true,
    });

    expect(migrated).not.toHaveProperty("selectedDate");
    expect(migrated).not.toHaveProperty("followToday");
    expect(migrated).not.toHaveProperty("searchQuery");
    expect(migrated).not.toHaveProperty("selectedFrequency");
    expect(migrated).not.toHaveProperty("selectedTagIds");
    expect(migrated).not.toHaveProperty("showCompleted");
    expect(migrated.setupChecklistDismissed).toBe(false);
    expect(migrated).toEqual({
      activeFilters: {},
      activeView: "all",
      calendarShowRecurring: true,
      habitComposerCollapsed: false,
      todayComposerCollapsed: false,
      allDoneCelebratedDate: "",
      dailyStreakMomentDate: "",
      setupChecklistDismissed: false,
    });
  });

  it("persists the habit composer disclosure and defaults invalid values to expanded", () => {
    const store = createStoreHarness();
    expect(store.getState().habitComposerCollapsed).toBe(false);
    store.getState().setHabitComposerCollapsed(true);
    expect(migratePersistedUIState(getPersistedUIState(store.getState())).habitComposerCollapsed).toBe(true);
    for (const value of [undefined, null, "true", 1, false]) {
      expect(migratePersistedUIState({ habitComposerCollapsed: value }).habitComposerCollapsed).toBe(false);
    }
  });

  it("persists the Hoje disclosure independently and expands missing or invalid preferences", () => {
    const store = createStoreHarness();
    expect(store.getState().todayComposerCollapsed).toBe(false);
    store.getState().setTodayComposerCollapsed(true);
    expect(migratePersistedUIState(getPersistedUIState(store.getState()))).toMatchObject({
      todayComposerCollapsed: true, habitComposerCollapsed: false,
    });
    store.getState().setHabitComposerCollapsed(true);
    store.getState().setTodayComposerCollapsed(false);
    expect(migratePersistedUIState(getPersistedUIState(store.getState()))).toMatchObject({
      todayComposerCollapsed: false, habitComposerCollapsed: true,
    });
    for (const value of [undefined, null, "true", 1, false]) {
      expect(migratePersistedUIState({ todayComposerCollapsed: value, habitComposerCollapsed: true })).toMatchObject({
        todayComposerCollapsed: false, habitComposerCollapsed: true,
      });
    }
  });

  it("persists the recurring calendar filter and defaults invalid stored values", () => {
    const store = createStoreHarness();
    expect(store.getState().calendarShowRecurring).toBe(true);
    store.getState().setCalendarShowRecurring(false);
    const snapshot = getPersistedUIState(store.getState());
    expect(migratePersistedUIState(snapshot).calendarShowRecurring).toBe(false);
    expect(migratePersistedUIState({ calendarShowRecurring: true }).calendarShowRecurring).toBe(true);
    expect(migratePersistedUIState({ calendarShowRecurring: "false" }).calendarShowRecurring).toBe(true);
    expect(migratePersistedUIState({}).calendarShowRecurring).toBe(true);
  });

  it("preserves a production setup checklist dismissal through migration", () => {
    expect(migratePersistedUIState({ setupChecklistDismissed: true }).setupChecklistDismissed).toBe(true);
    expect(migratePersistedUIState({ setupChecklistDismissed: "true" }).setupChecklistDismissed).toBe(false);
  });

  it("maps every retired active view to today", () => {
    expect(migratePersistedUIState({ activeView: "goals" }).activeView).toBe("today");
    expect(migratePersistedUIState({ activeView: "retrospective" }).activeView).toBe("today");
  });
});


describe('daily streak moment lifetime', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps the once-per-day receipt through hydration and allows the next day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12));
    const store = createStoreHarness();
    const log = { intent: 'log' as const, countsTowardStreak: true };
    store.getState().showStreakMoment(5, 4, log);
    expect(store.getState().activeCelebration?.kind).toBe('daily-streak');
    const restored = createStoreHarness();
    restored.setState(migratePersistedUIState(getPersistedUIState(store.getState())));
    restored.getState().showStreakMoment(5, 4, log);
    expect(restored.getState().activeCelebration).toBeNull();
    vi.setSystemTime(new Date(2026, 5, 16, 12));
    restored.getState().showStreakMoment(6, 5, log);
    expect(restored.getState().activeCelebration).toMatchObject({ kind: 'daily-streak', payload: { streak: 6 } });
  });

  it.each([undefined, null])('does not invent an unavailable previous streak: %s', (previousStreak) => {
    const store = createStoreHarness();
    store.getState().showStreakMoment(1, previousStreak, { intent: 'log', countsTowardStreak: true });
    expect(store.getState().activeCelebration).toBeNull();
    expect(store.getState().queuedCelebrations).toEqual([]);
    expect(store.getState().dailyStreakMomentDate).toBe('');
  });
});
