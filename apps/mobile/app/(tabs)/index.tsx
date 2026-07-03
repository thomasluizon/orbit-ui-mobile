import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  type ReactElement,
} from "react";
import {
  Animated,
  AppState,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { FlatList } from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addDays, subDays, isToday, isYesterday, isTomorrow } from "date-fns";
import { useTranslation } from "react-i18next";
import {
  computeDayProgress,
  formatAPIDate,
  formatLocaleDate,
  isHabitVisibleInAllView,
  parseShowGeneralOnTodayPreference,
} from "@orbit/shared/utils";
import { useHabitVisibility } from "@/hooks/use-habit-visibility";
import type { HabitsFilter, NormalizedHabit } from "@orbit/shared/types/habit";
import type { Goal } from "@orbit/shared/types/goal";
import { plural } from "@/lib/plural";
import { useAdMob } from "@/hooks/use-ad-mob";
import { useProfile } from "@/hooks/use-profile";
import {
  EMPTY_CHILDREN_BY_PARENT,
  EMPTY_HABITS_BY_ID,
  EMPTY_NORMALIZED_HABITS,
  useHabits,
  useDeleteHabit,
} from "@/hooks/use-habits";
import { useTags } from "@/hooks/use-tags";
import { useCoachTour } from "@/hooks/use-coach-tour";
import { useUIStore } from "@/stores/ui-store";
import { useReferralPromptStore } from "@/stores/referral-prompt-store";
import { HabitList, type HabitListHandle } from "@/components/habit-list";
import { CreateHabitModal } from "@/components/habits/create-habit-modal";
import { HabitDetailDrawer } from "@/components/habits/habit-detail-drawer";
import { EditHabitModal } from "@/components/habits/edit-habit-modal";
import { BulkActionBarV2 } from "@/components/habits/bulk-action-bar-v2";
import { GoalsView } from "@/components/goals/goals-view";
import { CreateGoalModal } from "@/components/goals/create-goal-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { GradientTop } from "@/components/ui/gradient-top";
import { PillButton } from "@/components/ui/pill-button";
import { SatelliteGlyph } from "@/components/ui/satellite-glyph";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { TrialBanner } from "@/components/ui/trial-banner";
import { DismissibleCard } from "@/components/today/dismissible-card";
import { TodayHabitsHeader } from "@/components/today/today-habits-header";
import { ReviewReminderCard } from "@/components/review-reminder-card";
import { ReferralCard } from "@/components/referral/referral-card";
import { SocialEntryCard } from "@/components/social/social-entry-card";
import { ReferralDrawer } from "@/components/referral/referral-drawer";
import { SetupChecklistCard } from "@/components/today/setup-checklist-card";
import { useHorizontalSwipe } from "@/hooks/use-horizontal-swipe";
import { useAnchoredMenu } from "@/components/ui/anchored-menu";
import { useBulkActions } from "@/hooks/use-bulk-actions";
import { shouldResetSelectionForViewChange } from "@/lib/habit-selection-state";
import {
  createAnimatedTimingConfig,
  toAnimatedEasing,
  useResolvedMotionPreset,
} from "@/lib/motion";
import { createTokensV2, easings } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";
import { useEngagementSlot } from "@/hooks/use-engagement-slot";
import { useTourScrollContainer } from "@/hooks/use-tour-scroll-container";
import { useTourTarget } from "@/hooks/use-tour-target";
import { TodayHeader, TodayTabs, type TodayTabItem } from "./today-shell";

const TAB_VIEWS = ["today", "all", "general", "goals"] as const;
type TodayView = (typeof TAB_VIEWS)[number];

function getMillisecondsUntilNextLocalMidnight(): number {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  return Math.max(nextMidnight.getTime() - now.getTime(), 1_000);
}

function getTodayDate(): string {
  return formatAPIDate(new Date());
}

export function resolveTodayView(
  activeView: TodayView,
  hasProAccess: boolean,
): TodayView {
  return !hasProAccess && activeView === "goals" ? "today" : activeView;
}

export function shouldRedirectGoalsTab(
  nextView: TodayView,
  hasProAccess: boolean,
): boolean {
  return nextView === "goals" && !hasProAccess;
}

export function resolveBulkActionBarEnterShift(selectionMotion: {
  shift: number;
  reducedMotionEnabled: boolean;
}): number {
  return selectionMotion.reducedMotionEnabled
    ? selectionMotion.shift
    : Math.max(12, selectionMotion.shift);
}

type FreqKey = "Day" | "Week" | "Month" | "Year" | "none";

export default function TodayScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const theme = useAppTheme();
  const tokens = useMemo(
    () => createTokensV2(theme.currentScheme, theme.currentTheme),
    [theme.currentScheme, theme.currentTheme],
  );
  const listMotion = useResolvedMotionPreset("list-enter");
  const selectionMotion = useResolvedMotionPreset("selection");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { date } = useLocalSearchParams<{ date?: string | string[] }>();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const { showInterstitialIfDue } = useAdMob();
  const { profile } = useProfile();
  const { tags } = useTags();
  useCoachTour();
  const deleteHabit = useDeleteHabit();

  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const searchQueryStore = useUIStore((s) => s.searchQuery);
  const setSearchQueryStore = useUIStore((s) => s.setSearchQuery);
  const selectedFrequency = useUIStore((s) => s.selectedFrequency);
  const setSelectedFrequency = useUIStore((s) => s.setSelectedFrequency);
  const selectedTagIds = useUIStore((s) => s.selectedTagIds);
  const setSelectedTagIds = useUIStore((s) => s.setSelectedTagIds);
  const showCompleted = useUIStore((s) => s.showCompleted);
  const setShowCompleted = useUIStore((s) => s.setShowCompleted);
  const isSelectMode = useUIStore((s) => s.isSelectMode);
  const selectedHabitIds = useUIStore((s) => s.selectedHabitIds);
  const toggleSelectMode = useUIStore((s) => s.toggleSelectMode);
  const selectAllHabits = useUIStore((s) => s.selectAllHabits);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const hasProAccess = profile?.hasProAccess ?? false;
  const currentActiveView = resolveTodayView(activeView, hasProAccess);

  const [showGeneralOnToday, setShowGeneralOnToday] = useState(false);
  const {
    anchorRef: controlsButtonRef,
    visible: showControlsMenu,
    anchorRect: controlsMenuAnchorRect,
    close: closeControlsMenu,
    toggle: toggleControlsMenu,
  } = useAnchoredMenu();
  const {
    anchorRef: freqMenuButtonRef,
    visible: showFreqMenu,
    anchorRect: freqMenuAnchorRect,
    close: closeFreqMenu,
    toggle: toggleFreqMenu,
  } = useAnchoredMenu();
  const [showHabitDeleteConfirm, setShowHabitDeleteConfirm] = useState(false);
  const [slideDirection, setSlideDirection] = useState<"left" | "right">(
    "right",
  );
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const habitListRef = useRef<HabitListHandle>(null);
  const [habitListAllCollapsed, setHabitListAllCollapsed] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [prevScrollTopView, setPrevScrollTopView] = useState(currentActiveView);
  if (currentActiveView !== prevScrollTopView) {
    setPrevScrollTopView(currentActiveView);
    setShowScrollTop(false);
  }
  const handleHabitListScroll = useCallback((offsetY: number) => {
    setShowScrollTop(offsetY > 600);
  }, []);
  const scrollHabitsToTop = useCallback(() => {
    habitListRef.current?.scrollToOffset(0);
  }, []);
  const [habitListAllLoadedIds, setHabitListAllLoadedIds] = useState<
    Set<string>
  >(() => new Set());
  const habitsTourRef = useRef<View>(null);
  useTourTarget("tour-habit-list", habitsTourRef);
  const goalsScrollRef = useRef<FlatList<Goal>>(null);
  const goalsScrollTo = useCallback((y: number) => {
    goalsScrollRef.current?.scrollToOffset({ offset: y, animated: true });
  }, []);
  const { onTourScroll: onGoalsTourScroll } = useTourScrollContainer(
    "/",
    goalsScrollTo,
  );
  const previousActiveViewRef = useRef(activeView);
  const hasAnimatedDateLabelRef = useRef(false);
  const dateLabelAnim = useMemo(() => new Animated.Value(1), []);
  const filtersTransitionAnim = useMemo(() => new Animated.Value(1), []);
  const listTransitionAnim = useMemo(() => new Animated.Value(1), []);
  const refetchTransitionAnim = useMemo(() => new Animated.Value(0), []);
  const bulkBarAnimRef = useRef<Animated.Value | null>(null);
  if (bulkBarAnimRef.current === null) {
    bulkBarAnimRef.current = new Animated.Value(isSelectMode ? 1 : 0);
  }
  const bulkBarAnim = bulkBarAnimRef.current;
  const hasAnimatedFiltersRef = useRef(false);
  const [renderBulkActionBar, setRenderBulkActionBar] = useState(isSelectMode);
  const [prevIsSelectMode, setPrevIsSelectMode] = useState(isSelectMode);
  if (isSelectMode !== prevIsSelectMode) {
    setPrevIsSelectMode(isSelectMode);
    if (isSelectMode) setRenderBulkActionBar(true);
  }

  const [detailHabit, setDetailHabit] = useState<NormalizedHabit | null>(null);
  const [editHabit, setEditHabit] = useState<NormalizedHabit | null>(null);
  const [editHabitOnSaved, setEditHabitOnSaved] = useState<
    (() => void | Promise<void>) | null
  >(null);
  const [habitPendingDelete, setHabitPendingDelete] =
    useState<NormalizedHabit | null>(null);

  const dateParam = Array.isArray(date) ? date[0] : date;
  const pinnedDateStr =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;

  const [today, setToday] = useState(getTodayDate);
  const handleTodayRollover = useCallback(() => {
    setToday(getTodayDate());
  }, []);

  const selectedDateStr = pinnedDateStr ?? today;
  const selectedDate = useMemo(
    () => new Date(selectedDateStr + "T00:00:00"),
    [selectedDateStr],
  );

  const { slot: engagementSlot, reviewReminder } = useEngagementSlot({
    isTodayView: currentActiveView === "today",
    isTodayDate: isToday(selectedDate),
  });
  const filterMotionKey = useMemo(
    () =>
      [
        currentActiveView,
        selectedDateStr,
        searchQueryStore,
        selectedFrequency ?? "",
        selectedTagIds.join(","),
      ].join("|"),
    [
      currentActiveView,
      searchQueryStore,
      selectedDateStr,
      selectedFrequency,
      selectedTagIds,
    ],
  );

  useEffect(() => {
    AsyncStorage.getItem("orbit_show_general_on_today")
      .then((storedValue) => {
        setShowGeneralOnToday(parseShowGeneralOnTodayPreference(storedValue));
      })
      .catch(() => {
        setShowGeneralOnToday(false);
      });
  }, []);

  const [previousPinnedDateStr, setPreviousPinnedDateStr] =
    useState(pinnedDateStr);
  if (pinnedDateStr !== previousPinnedDateStr) {
    setPreviousPinnedDateStr(pinnedDateStr);
    if (pinnedDateStr) setActiveView("today");
  }

  const frequencyOptions = useMemo<{ key: FreqKey; label: string }[]>(
    () => [
      { key: "Day", label: t("habits.filter.daily") },
      { key: "Week", label: t("habits.filter.weekly") },
      { key: "Month", label: t("habits.filter.monthly") },
      { key: "Year", label: t("habits.filter.yearly") },
      { key: "none", label: t("habits.filter.oneTime") },
    ],
    [t],
  );

  const handleChangeView = useCallback(
    (nextView: TodayView) => {
      if (shouldRedirectGoalsTab(nextView, hasProAccess)) {
        router.push("/upgrade");
        return;
      }

      setActiveView(nextView);
    },
    [hasProAccess, router, setActiveView],
  );

  const tabItems = useMemo<TodayTabItem[]>(
    () =>
      TAB_VIEWS.map((view) => ({
        view,
        label:
          view === "today"
            ? t("habits.viewToday")
            : view === "all"
              ? t("habits.viewAll")
              : view === "general"
                ? t("habits.viewGeneral")
                : t("goals.tab"),
      })),
    [t],
  );

  const goToPreviousDay = useCallback(() => {
    setSlideDirection("left");
    router.push(`/?date=${formatAPIDate(subDays(selectedDate, 1))}`);
  }, [router, selectedDate]);

  const goToNextDay = useCallback(() => {
    setSlideDirection("right");
    router.push(`/?date=${formatAPIDate(addDays(selectedDate, 1))}`);
  }, [router, selectedDate]);

  const goToToday = useCallback(() => {
    setSlideDirection(selectedDate > new Date() ? "left" : "right");
    setActiveView("today");
    router.navigate("/");
  }, [router, selectedDate, setActiveView]);

  useEffect(() => {
    let rolloverTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

    const resetRolloverTimer = () => {
      if (rolloverTimer) {
        globalThis.clearTimeout(rolloverTimer);
      }

      rolloverTimer = globalThis.setTimeout(() => {
        handleTodayRollover();
        resetRolloverTimer();
      }, getMillisecondsUntilNextLocalMidnight());
    };

    resetRolloverTimer();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState !== "active") return;
      handleTodayRollover();
      resetRolloverTimer();
    });

    return () => {
      if (rolloverTimer) {
        globalThis.clearTimeout(rolloverTimer);
      }
      subscription.remove();
    };
  }, [handleTodayRollover]);

  const swipeGesture = useHorizontalSwipe({
    onSwipeLeft: goToNextDay,
    onSwipeRight: goToPreviousDay,
  });

  const dateLabel = useMemo(() => {
    if (isToday(selectedDate)) return t("dates.today");
    if (isYesterday(selectedDate)) return t("dates.yesterday");
    if (isTomorrow(selectedDate)) return t("dates.tomorrow");
    return formatLocaleDate(selectedDate, locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [selectedDate, t, locale]);

  useEffect(() => {
    if (!hasAnimatedDateLabelRef.current) {
      hasAnimatedDateLabelRef.current = true;
      return;
    }

    dateLabelAnim.setValue(0);
    Animated.timing(dateLabelAnim, {
      toValue: 1,
      duration: 180,
      easing: toAnimatedEasing(easings.out),
      useNativeDriver: true,
    }).start();
  }, [dateLabelAnim, selectedDateStr, slideDirection]);

  useEffect(() => {
    if (!hasAnimatedFiltersRef.current) {
      hasAnimatedFiltersRef.current = true;
      return;
    }

    const startValue = listMotion.reducedMotionEnabled ? 1 : 0;
    const timingConfig = createAnimatedTimingConfig(
      listMotion.enterDuration,
      listMotion.enterEasing,
    );

    filtersTransitionAnim.stopAnimation?.();
    listTransitionAnim.stopAnimation?.();
    filtersTransitionAnim.setValue(startValue);
    listTransitionAnim.setValue(startValue);

    Animated.parallel([
      Animated.timing(filtersTransitionAnim, timingConfig),
      Animated.timing(listTransitionAnim, timingConfig),
    ]).start();
  }, [
    filterMotionKey,
    filtersTransitionAnim,
    listMotion.enterDuration,
    listMotion.enterEasing,
    listMotion.reducedMotionEnabled,
    listTransitionAnim,
  ]);

  const toggleTagFilter = useCallback(
    (tagId: string) => {
      const idx = selectedTagIds.indexOf(tagId);
      if (idx >= 0) {
        setSelectedTagIds(selectedTagIds.filter((id) => id !== tagId));
        return;
      }

      setSelectedTagIds([...selectedTagIds, tagId]);
    },
    [selectedTagIds, setSelectedTagIds],
  );

  const dateStr = formatAPIDate(selectedDate);
  const filters = useMemo<HabitsFilter>(() => {
    if (currentActiveView === "general") {
      const f: HabitsFilter = { isGeneral: true };
      if (searchQueryStore.trim()) f.search = searchQueryStore.trim();
      if (selectedTagIds.length > 0) f.tagIds = selectedTagIds;
      return f;
    }
    if (currentActiveView === "today") {
      const f: HabitsFilter = {
        dateFrom: dateStr,
        dateTo: dateStr,
        includeOverdue: isToday(selectedDate),
        includeGeneral: showGeneralOnToday || undefined,
      };
      if (searchQueryStore.trim()) f.search = searchQueryStore.trim();
      if (selectedFrequency) f.frequencyUnit = selectedFrequency;
      if (selectedTagIds.length > 0) f.tagIds = selectedTagIds;
      return f;
    }
    const f: HabitsFilter = {};
    if (searchQueryStore.trim()) f.search = searchQueryStore.trim();
    if (selectedFrequency) f.frequencyUnit = selectedFrequency;
    if (selectedTagIds.length > 0) f.tagIds = selectedTagIds;
    return f;
  }, [
    currentActiveView,
    dateStr,
    selectedDate,
    searchQueryStore,
    selectedFrequency,
    selectedTagIds,
    showGeneralOnToday,
  ]);

  const habitsQuery = useHabits(filters);
  const hasFetchedHabits = habitsQuery.data !== undefined;
  const isRefetching = habitsQuery.isFetching && hasFetchedHabits;
  const showHabitsLoadError = habitsQuery.isError && !hasFetchedHabits;
  const habitsById = habitsQuery.data?.habitsById ?? EMPTY_HABITS_BY_ID;
  const childrenByParent =
    habitsQuery.data?.childrenByParent ?? EMPTY_CHILDREN_BY_PARENT;

  const bulkActions = useBulkActions({
    selectedHabitIds,
    habitsById,
    habitListRef,
    onSuccess: clearSelection,
  });
  const {
    showBulkDeleteConfirm,
    showBulkLogConfirm,
    showBulkSkipConfirm,
    setShowBulkDeleteConfirm,
    setShowBulkLogConfirm,
    setShowBulkSkipConfirm,
    confirmBulkDelete,
    confirmBulkLog,
    confirmBulkSkip,
  } = bulkActions;

  const visibility = useHabitVisibility({
    habitsById,
    childrenByParent,
    selectedDate: dateStr,
    searchQuery: searchQueryStore,
    showCompleted,
    recentlyCompletedIds: useMemo(() => new Set<string>(), []),
  });

  const visibleTopLevelHabits = useMemo(() => {
    const habits = habitsQuery.data?.topLevelHabits ?? EMPTY_NORMALIZED_HABITS;
    if (currentActiveView === "today") {
      if (showCompleted) return habits;
      return habits.filter((habit) => visibility.hasVisibleContent(habit));
    }
    if (currentActiveView === "all") {
      return habits.filter((habit) =>
        isHabitVisibleInAllView(habit, showCompleted),
      );
    }
    if (showCompleted) return habits;
    return habits.filter((habit) => !habit.isCompleted);
  }, [
    currentActiveView,
    habitsQuery.data?.topLevelHabits,
    showCompleted,
    visibility,
  ]);

  const visibleHabitIds = useMemo(() => {
    const ids = new Set<string>();

    const visit = (habit: NormalizedHabit) => {
      ids.add(habit.id);
      for (const child of habitsQuery.getChildren(habit.id)) {
        visit(child);
      }
    };

    for (const habit of visibleTopLevelHabits) {
      visit(habit);
    }

    return ids;
  }, [habitsQuery, visibleTopLevelHabits]);

  const dayProgress = useMemo(
    () => computeDayProgress(habitsById, dateStr),
    [habitsById, dateStr],
  );
  const showDayProgress = currentActiveView === "today" && dayProgress.total > 0;

  useEffect(() => {
    Animated.timing(refetchTransitionAnim, {
      toValue: isRefetching ? 1 : 0,
      duration: isRefetching
        ? listMotion.enterDuration
        : listMotion.exitDuration,
      easing: toAnimatedEasing(
        isRefetching ? listMotion.enterEasing : listMotion.exitEasing,
      ),
      useNativeDriver: true,
    }).start();
  }, [
    isRefetching,
    listMotion.enterDuration,
    listMotion.enterEasing,
    listMotion.exitDuration,
    listMotion.exitEasing,
    refetchTransitionAnim,
  ]);

  useEffect(() => {
    if (isSelectMode) {
      bulkBarAnim.stopAnimation?.();
      bulkBarAnim.setValue(selectionMotion.reducedMotionEnabled ? 1 : 0);
      Animated.timing(
        bulkBarAnim,
        createAnimatedTimingConfig(
          selectionMotion.enterDuration,
          selectionMotion.enterEasing,
        ),
      ).start();
      return;
    }

    bulkBarAnim.stopAnimation?.();
    Animated.timing(bulkBarAnim, {
      toValue: 0,
      duration: selectionMotion.exitDuration,
      easing: toAnimatedEasing(selectionMotion.exitEasing),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setRenderBulkActionBar(false);
      }
    });
  }, [
    bulkBarAnim,
    isSelectMode,
    selectionMotion.enterDuration,
    selectionMotion.enterEasing,
    selectionMotion.exitDuration,
    selectionMotion.exitEasing,
    selectionMotion.reducedMotionEnabled,
  ]);

  const allLoadedIds =
    habitListAllLoadedIds.size > 0 ? habitListAllLoadedIds : visibleHabitIds;

  const allSelected =
    allLoadedIds.size > 0 &&
    Array.from(allLoadedIds).every((id) => selectedHabitIds.has(id));

  const selectedCount = selectedHabitIds.size;

  const setFilters = useUIStore((s) => s.setFilters);
  const showCreateModal = useUIStore((s) => s.showCreateModal);
  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal);
  const showCreateGoalModal = useUIStore((s) => s.showCreateGoalModal);
  const setShowCreateGoalModal = useUIStore((s) => s.setShowCreateGoalModal);
  const dismissHomeEntry = useReferralPromptStore((s) => s.dismissHomeEntry);
  const [showReferral, setShowReferral] = useState(false);
  const [prevFilters, setPrevFilters] = useState(filters);
  if (filters !== prevFilters) {
    setPrevFilters(filters);
    setFilters(filters);
  }

  const showSummary = currentActiveView === "today" && isToday(selectedDate);

  const filtersAnimatedStyle = useMemo(
    () => ({
      opacity: filtersTransitionAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.86, 1],
      }),
      transform: [
        {
          translateY: filtersTransitionAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [Math.max(4, Math.round(listMotion.shift / 2)), 0],
          }),
        },
      ],
    }),
    [filtersTransitionAnim, listMotion.shift],
  );

  const listAnimatedStyle = useMemo(
    () => ({
      opacity: listTransitionAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.9, 1],
      }),
      transform: [
        {
          translateY: listTransitionAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [Math.max(4, Math.round(listMotion.shift / 2)), 0],
          }),
        },
      ],
    }),
    [listMotion.shift, listTransitionAnim],
  );

  const refetchAnimatedStyle = useMemo(
    () => ({
      flex: 1,
      opacity: refetchTransitionAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.8],
      }),
      transform: [
        {
          translateY: refetchTransitionAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 4],
          }),
        },
      ],
    }),
    [refetchTransitionAnim],
  );

  const bulkBarAnimatedStyle = useMemo(
    () => ({
      opacity: bulkBarAnim,
      transform: [
        {
          translateY: bulkBarAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [resolveBulkActionBarEnterShift(selectionMotion), 0],
          }),
        },
        {
          scale: bulkBarAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [selectionMotion.scaleFrom, 1],
          }),
        },
      ],
    }),
    [bulkBarAnim, selectionMotion],
  );

  useEffect(() => {
    if (
      !shouldResetSelectionForViewChange(
        previousActiveViewRef.current,
        activeView,
      )
    ) {
      return;
    }

    previousActiveViewRef.current = activeView;
    closeControlsMenu();
    if (isSelectMode) clearSelection();
  }, [activeView, clearSelection, closeControlsMenu, isSelectMode]);

  useEffect(() => {
    if (!isSelectMode) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        clearSelection();
        return true;
      },
    );
    return () => subscription.remove();
  }, [clearSelection, isSelectMode]);

  const handleToggleSelectMode = useCallback(() => {
    if (isSelectMode) {
      clearSelection();
    } else {
      toggleSelectMode();
    }
    closeControlsMenu();
  }, [clearSelection, closeControlsMenu, isSelectMode, toggleSelectMode]);

  const handleToggleCollapse = useCallback(() => {
    if (habitListRef.current?.allCollapsed) {
      habitListRef.current.expandAll();
    } else {
      habitListRef.current?.collapseAll();
    }
    closeControlsMenu();
  }, [closeControlsMenu]);

  const handleRefresh = useCallback(() => {
    habitListRef.current?.refetch();
    closeControlsMenu();
  }, [closeControlsMenu]);

  const handleToggleCompleted = useCallback(() => {
    setShowCompleted(!showCompleted);
    closeControlsMenu();
  }, [closeControlsMenu, setShowCompleted, showCompleted]);

  const handleSelectFrequency = useCallback(
    (key: FreqKey | null) => {
      setSelectedFrequency(key);
      closeFreqMenu();
    },
    [closeFreqMenu, setSelectedFrequency],
  );

  const handleSelectAll = useCallback(() => {
    selectAllHabits(Array.from(allLoadedIds));
  }, [allLoadedIds, selectAllHabits]);

  const handleDeselectAll = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const handleOpenBulkDelete = useCallback(() => {
    if (selectedCount === 0) return;
    setShowBulkDeleteConfirm(true);
  }, [selectedCount, setShowBulkDeleteConfirm]);

  const handleOpenBulkLog = useCallback(() => {
    if (selectedCount === 0) return;
    setShowBulkLogConfirm(true);
  }, [selectedCount, setShowBulkLogConfirm]);

  const handleOpenBulkSkip = useCallback(() => {
    if (selectedCount === 0) return;
    setShowBulkSkipConfirm(true);
  }, [selectedCount, setShowBulkSkipConfirm]);

  const confirmHabitDelete = useCallback(async () => {
    if (!habitPendingDelete) return;

    try {
      await deleteHabit.mutateAsync(habitPendingDelete.id);
    } finally {
      setShowHabitDeleteConfirm(false);
      setHabitPendingDelete(null);
      setDetailHabit(null);
    }
  }, [deleteHabit, habitPendingDelete]);

  const currentStreak = profile?.currentStreak ?? 0;
  const handleHabitLogged = useCallback(
    (habitId: string) => {
      habitListRef.current?.markRecentlyCompleted(habitId);
      habitListRef.current?.checkAndPromptParentLog(habitId);
      void showInterstitialIfDue();
    },
    [showInterstitialIfDue],
  );

  const handleEditHabit = useCallback(
    (habit: NormalizedHabit, onSaved?: () => void | Promise<void>) => {
      setEditHabit(habit);
      setEditHabitOnSaved(() => onSaved ?? null);
    },
    [],
  );

  const handleEditHabitClose = useCallback(() => {
    setEditHabit(null);
    setEditHabitOnSaved(null);
  }, []);

  const handleListScrollBeginDrag = useCallback(() => {
    closeControlsMenu();
  }, [closeControlsMenu]);

  const handleToggleSearch = useCallback(() => {
    setIsSearchOpen((open) => {
      if (open) {
        setSearchQueryStore("");
      }
      return !open;
    });
  }, [setSearchQueryStore]);

  const sharedHeader = useMemo(
    () => (
      <>
        <GradientTop height={260} />

        <TodayHeader
          currentStreak={currentStreak}
          onGoToToday={goToToday}
          goToTodayLabel={t("dates.goToToday")}
          topInset={insets.top}
        />

        {engagementSlot === "trial" ? <TrialBanner /> : null}

        <DismissibleCard visible={engagementSlot === "setupChecklist"}>
          <SetupChecklistCard />
        </DismissibleCard>

        <DismissibleCard visible={engagementSlot === "reviewReminder"}>
          <ReviewReminderCard
            onDismiss={reviewReminder.dismiss}
            onRate={() => {
              void reviewReminder.requestReview();
            }}
          />
        </DismissibleCard>

        <DismissibleCard visible={engagementSlot === "referral"}>
          <View style={styles.referralCardSpacing}>
            <ReferralCard
              onOpen={() => setShowReferral(true)}
              onDismiss={dismissHomeEntry}
            />
          </View>
        </DismissibleCard>

        <DismissibleCard visible={engagementSlot === "socialEntry"}>
          <SocialEntryCard />
        </DismissibleCard>

        <TodayTabs
          tabs={tabItems}
          activeView={currentActiveView}
          hasProAccess={hasProAccess}
          onChangeView={handleChangeView}
          viewsLabel={t("habits.viewsLabel")}
        />
      </>
    ),
    [
      currentActiveView,
      currentStreak,
      engagementSlot,
      hasProAccess,
      insets.top,
      goToToday,
      handleChangeView,
      reviewReminder,
      styles.referralCardSpacing,
      tabItems,
      t,
      dismissHomeEntry,
    ],
  );

  const habitsHeader = useMemo<ReactElement>(
    () => (
      <TodayHabitsHeader
        header={sharedHeader}
        showSummary={showSummary}
        dateStr={dateStr}
        currentActiveView={currentActiveView}
        dateLabel={dateLabel}
        selectedDate={selectedDate}
        slideDirection={slideDirection}
        dateLabelAnim={dateLabelAnim}
        isSearchFocused={isSearchFocused}
        swipeGesture={swipeGesture}
        showDayProgress={showDayProgress}
        dayProgress={dayProgress}
        isSearchOpen={isSearchOpen}
        searchQuery={searchQueryStore}
        selectedFrequency={selectedFrequency}
        selectedTagIds={selectedTagIds}
        tags={tags}
        frequencyOptions={frequencyOptions}
        isSelectMode={isSelectMode}
        showCompleted={showCompleted}
        isFetching={habitsQuery.isFetching}
        allCollapsed={habitListAllCollapsed}
        showControlsMenu={showControlsMenu}
        controlsMenuAnchorRect={controlsMenuAnchorRect}
        showFreqMenu={showFreqMenu}
        freqMenuAnchorRect={freqMenuAnchorRect}
        controlsButtonRef={controlsButtonRef}
        freqMenuButtonRef={freqMenuButtonRef}
        filtersAnimatedStyle={filtersAnimatedStyle}
        onGoToPreviousDay={goToPreviousDay}
        onGoToToday={goToToday}
        onGoToNextDay={goToNextDay}
        onSearchToggle={handleToggleSearch}
        onSearchChange={setSearchQueryStore}
        onSearchFocusChange={setIsSearchFocused}
        onTagToggle={toggleTagFilter}
        onToggleFreqMenu={toggleFreqMenu}
        onToggleControlsMenu={toggleControlsMenu}
        onCloseControlsMenu={closeControlsMenu}
        onCloseFreqMenu={closeFreqMenu}
        onToggleSelect={handleToggleSelectMode}
        onToggleCollapse={handleToggleCollapse}
        onRefresh={handleRefresh}
        onToggleCompleted={handleToggleCompleted}
        onSelectFrequency={handleSelectFrequency}
      />
    ),
    [
      controlsMenuAnchorRect,
      controlsButtonRef,
      currentActiveView,
      dateLabel,
      dateLabelAnim,
      dateStr,
      dayProgress,
      filtersAnimatedStyle,
      freqMenuButtonRef,
      frequencyOptions,
      goToNextDay,
      goToPreviousDay,
      goToToday,
      habitListAllCollapsed,
      habitsQuery.isFetching,
      handleRefresh,
      handleSelectFrequency,
      handleToggleCollapse,
      handleToggleCompleted,
      toggleControlsMenu,
      toggleFreqMenu,
      handleToggleSearch,
      handleToggleSelectMode,
      isSearchFocused,
      isSearchOpen,
      isSelectMode,
      searchQueryStore,
      selectedDate,
      selectedFrequency,
      selectedTagIds,
      setIsSearchFocused,
      setSearchQueryStore,
      closeControlsMenu,
      closeFreqMenu,
      sharedHeader,
      showCompleted,
      showControlsMenu,
      showDayProgress,
      showSummary,
      slideDirection,
      swipeGesture,
      tags,
      toggleTagFilter,
      freqMenuAnchorRect,
      showFreqMenu,
    ],
  );

  return (
    <View style={styles.safeArea}>
      {currentActiveView === "goals" ? (
        <GoalsView
          listHeader={sharedHeader}
          scrollRef={goalsScrollRef}
          contentContainerStyle={
            isSelectMode ? styles.scrollContentWithBulkBar : undefined
          }
          onScroll={onGoalsTourScroll}
          onScrollBeginDrag={handleListScrollBeginDrag}
        />
      ) : showHabitsLoadError ? (
        <ScrollView
          style={styles.listShell}
          showsVerticalScrollIndicator={false}
        >
          {sharedHeader}
          <View style={styles.loadErrorState}>
            <SatelliteGlyph size={96} />
            <Text style={styles.loadErrorText}>{t("habits.loadError")}</Text>
            <PillButton
              variant="ghost"
              style={styles.loadErrorRetry}
              accessibilityLabel={t("common.retry")}
              onPress={() => {
                void habitsQuery.refetch();
              }}
            >
              {t("common.retry")}
            </PillButton>
          </View>
        </ScrollView>
      ) : (
        <Animated.View
          ref={habitsTourRef}
          collapsable={false}
          testID="today-list-shell"
          style={[styles.listShell, listAnimatedStyle]}
        >
          <Animated.View style={refetchAnimatedStyle}>
            <HabitList
              ref={habitListRef}
              view={currentActiveView}
              filters={filters}
              selectedDate={
                currentActiveView === "today" ? selectedDate : undefined
              }
              showCompleted={showCompleted}
              searchQuery={searchQueryStore}
              isSelectMode={isSelectMode}
              selectedHabitIds={selectedHabitIds}
              listHeader={habitsHeader}
              onCreatePress={() => setShowCreateModal(true)}
              onSeeUpcoming={goToNextDay}
              onDetailHabit={setDetailHabit}
              onEditHabit={handleEditHabit}
              onScrollBeginDrag={handleListScrollBeginDrag}
              onScroll={handleHabitListScroll}
              onAllCollapsedChange={setHabitListAllCollapsed}
              onAllLoadedIdsChange={setHabitListAllLoadedIds}
            />
          </Animated.View>
        </Animated.View>
      )}

      {renderBulkActionBar && (
        <Animated.View
          testID="bulk-action-bar"
          style={[
            styles.bulkActionBarWrap,
            { bottom: 20 + insets.bottom },
            bulkBarAnimatedStyle,
          ]}
        >
          <BulkActionBarV2
            count={selectedCount}
            allSelected={allSelected}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            onLog={handleOpenBulkLog}
            onSkip={handleOpenBulkSkip}
            onDelete={handleOpenBulkDelete}
            onClose={clearSelection}
            countSuffixLabel={plural(
              t("common.selectedSuffix"),
              selectedCount,
            )}
            selectAllLabel={t("common.selectAll")}
            deselectAllLabel={t("common.deselectAll")}
            logLabel={t("habits.bulkBar.log")}
            skipLabel={t("habits.bulkBar.skip")}
            deleteLabel={t("habits.bulkBar.delete")}
            closeLabel={t("common.cancel")}
          />
        </Animated.View>
      )}

      {currentActiveView !== "goals" ? (
        <ScrollToTopButton
          visible={showScrollTop && !isSelectMode}
          onPress={scrollHabitsToTop}
          bottom={insets.bottom + 24}
        />
      ) : null}

      <CreateHabitModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        initialDate={
          currentActiveView === "today" ? formatAPIDate(selectedDate) : null
        }
      />

      <HabitDetailDrawer
        open={!!detailHabit}
        onClose={() => setDetailHabit(null)}
        habit={detailHabit}
        onLogged={handleHabitLogged}
      />

      <EditHabitModal
        open={!!editHabit}
        onClose={handleEditHabitClose}
        habit={editHabit}
        onSaved={editHabitOnSaved ?? undefined}
      />

      <ConfirmDialog
        open={showBulkDeleteConfirm}
        onOpenChange={setShowBulkDeleteConfirm}
        title={t("habits.bulkDeleteTitle")}
        description={plural(
          t("habits.bulkDeleteMessage", { count: selectedCount }),
          selectedCount,
        )}
        confirmLabel={t("habits.bulkDeleteConfirm")}
        onConfirm={confirmBulkDelete}
        variant="danger"
      />

      <ConfirmDialog
        open={showBulkLogConfirm}
        onOpenChange={setShowBulkLogConfirm}
        title={t("habits.bulkLogTitle")}
        description={plural(
          t("habits.bulkLogMessage", { count: selectedCount }),
          selectedCount,
        )}
        confirmLabel={t("habits.bulkLogConfirm")}
        onConfirm={confirmBulkLog}
        variant="success"
      />

      <ConfirmDialog
        open={showBulkSkipConfirm}
        onOpenChange={setShowBulkSkipConfirm}
        title={t("habits.bulkSkipTitle")}
        description={plural(
          t("habits.bulkSkipMessage", { count: selectedCount }),
          selectedCount,
        )}
        confirmLabel={t("habits.bulkSkipConfirm")}
        onConfirm={confirmBulkSkip}
        variant="warning"
      />

      <ConfirmDialog
        open={showHabitDeleteConfirm}
        onOpenChange={(open) => {
          setShowHabitDeleteConfirm(open);
          if (!open) setHabitPendingDelete(null);
        }}
        title={t("habits.deleteConfirmTitle")}
        description={t("habits.deleteConfirmMessage")}
        confirmLabel={t("common.delete")}
        onConfirm={confirmHabitDelete}
        variant="danger"
      />

      <CreateGoalModal
        open={showCreateGoalModal}
        onClose={() => setShowCreateGoalModal(false)}
      />

      <ReferralDrawer
        open={showReferral}
        onClose={() => setShowReferral(false)}
      />
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: tokens.bg,
    },
    scrollContentWithBulkBar: {
      paddingBottom: 220,
    },
    referralCardSpacing: {
      paddingTop: 10,
    },
    listShell: {
      flex: 1,
    },
    loadErrorState: {
      alignItems: "center",
      paddingVertical: 48,
      paddingHorizontal: 24,
    },
    loadErrorText: {
      fontFamily: "Rubik_400Regular",
      fontSize: 14,
      lineHeight: 21,
      color: tokens.fg3,
      marginTop: 14,
      maxWidth: 280,
      textAlign: "center",
    },
    loadErrorRetry: {
      marginTop: 22,
    },
    bulkActionBarWrap: {
      position: "absolute",
      left: 20,
      right: 20,
      zIndex: 20,
    },
  });
}
