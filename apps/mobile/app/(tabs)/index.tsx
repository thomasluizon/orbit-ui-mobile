import {
  memo,
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
  Easing,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Search,
  X,
  MoreVertical,
  CheckCircle2,
  RefreshCw,
  ChevronsDownUp,
  ChevronsUpDown,
  Check,
  Eye,
  Filter,
} from "lucide-react-native";
import { addDays, subDays, isToday, isYesterday, isTomorrow } from "date-fns";
import { useTranslation } from "react-i18next";
import {
  formatAPIDate,
  formatLocaleDate,
  isHabitVisibleInAllView,
  parseShowGeneralOnTodayPreference,
} from "@orbit/shared/utils";
import { useHabitVisibility } from "@/hooks/use-habit-visibility";
import type { HabitsFilter, NormalizedHabit } from "@orbit/shared/types/habit";
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
import { useStreakInfo } from "@/hooks/use-gamification";
import { useUIStore } from "@/stores/ui-store";
import { HabitList, type HabitListHandle } from "@/components/habit-list";
import { CreateHabitModal } from "@/components/habits/create-habit-modal";
import { HabitDetailDrawer } from "@/components/habits/habit-detail-drawer";
import { EditHabitModal } from "@/components/habits/edit-habit-modal";
import { TodayAISummary } from "@/components/habits/today-ai-summary";
import { BulkActionBarV2 } from "@/components/habits/bulk-action-bar-v2";
import { GoalsView } from "@/components/goals/goals-view";
import { CreateGoalModal } from "@/components/goals/create-goal-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AppTextInput } from "@/components/ui/app-text-input";
import { TagChip } from "@/components/ui/tag-chip";
import { SectionLabel } from "@/components/ui/section-label";
import { TrialBanner } from "@/components/ui/trial-banner";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { ReviewReminderCard } from "@/components/review-reminder-card";
import { useHorizontalSwipe } from "@/hooks/use-horizontal-swipe";
import type { MenuAnchorRect } from "@/lib/anchored-menu";
import { useBulkActions } from "@/hooks/use-bulk-actions";
import { shouldResetSelectionForViewChange } from "@/lib/habit-selection-state";
import { useResolvedMotionPreset } from "@/lib/motion";
import { createTokensV2 } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";
import { useReviewReminder } from "@/hooks/use-review-reminder";
import { useTourScrollContainer } from "@/hooks/use-tour-scroll-container";
import { useTourTarget } from "@/hooks/use-tour-target";
import {
  TodayHeader,
  TodayTabs,
  TodayDateNavigation,
  type TodayTabItem,
} from "./today-shell";

const TAB_VIEWS = ["today", "all", "general", "goals"] as const;
type TodayView = (typeof TAB_VIEWS)[number];

function getMillisecondsUntilNextLocalMidnight(): number {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  return Math.max(nextMidnight.getTime() - now.getTime(), 1_000);
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

interface TodaySearchBarProps {
  initialValue: string;
  onChange: (value: string) => void;
  onFocusChange: (focused: boolean) => void;
  placeholder: string;
  clearLabel: string;
  focused: boolean;
  tokens: ReturnType<typeof createTokensV2>;
  styles: ReturnType<typeof createStyles>;
}

const TodaySearchBar = memo(function TodaySearchBar({
  initialValue,
  onChange,
  onFocusChange,
  placeholder,
  clearLabel,
  focused,
  tokens,
  styles,
}: Readonly<TodaySearchBarProps>) {
  const [draft, setDraft] = useState(initialValue);
  const focusMotion = useResolvedMotionPreset("selection");
  const focusAnimRef = useRef<Animated.Value | null>(null);
  if (focusAnimRef.current === null) {
    focusAnimRef.current = new Animated.Value(focused ? 1 : 0);
  }
  const focusAnim = focusAnimRef.current;

  // Mirror controlled `initialValue` prop into local draft.
  const [previousInitialValue, setPreviousInitialValue] = useState(initialValue);
  if (initialValue !== previousInitialValue) {
    setPreviousInitialValue(initialValue);
    setDraft(initialValue);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(draft);
    }, 300);

    return () => clearTimeout(timer);
  }, [draft, onChange]);

  useEffect(() => {
    Animated.timing(focusAnim, {
      ...createAnimatedTimingConfig(
        focused ? focusMotion.enterDuration : focusMotion.exitDuration,
        focused ? focusMotion.enterEasing : focusMotion.exitEasing,
      ),
      toValue: focused ? 1 : 0,
    }).start();
  }, [focusAnim, focusMotion, focused]);

  const focusAnimatedStyle = useMemo(
    () => ({
      opacity: focusAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.9, 1],
      }),
    }),
    [focusAnim],
  );

  return (
    <Animated.View style={[styles.searchWrap, focusAnimatedStyle]}>
      <Search size={15} color={tokens.fg3} />
      <AppTextInput
        style={[styles.searchInput, { color: tokens.fg1 }]}
        value={draft}
        onChangeText={setDraft}
        onFocus={() => onFocusChange(true)}
        onBlur={() => onFocusChange(false)}
        placeholder={placeholder}
        placeholderTextColor={tokens.fg3}
        returnKeyType="search"
        selectionColor={tokens.primary}
      />
      {draft.length > 0 ? (
        <Pressable
          onPress={() => setDraft("")}
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          hitSlop={6}
        >
          <X size={15} color={tokens.fg3} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
});

function createAnimatedEasing(
  easing: readonly [number, number, number, number],
): (value: number) => number {
  const easingWithBezier = Easing as typeof Easing & {
    bezier?: (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
    ) => (value: number) => number;
  };

  if (typeof easingWithBezier.bezier === "function") {
    return easingWithBezier.bezier(easing[0], easing[1], easing[2], easing[3]);
  }

  return Easing.out(Easing.cubic);
}

function createAnimatedTimingConfig(
  duration: number,
  easing: readonly [number, number, number, number],
) {
  return {
    toValue: 1,
    duration,
    easing: createAnimatedEasing(easing),
    useNativeDriver: true,
  } as const;
}

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
  const reviewReminder = useReviewReminder(profile);
  const { data: streakInfo } = useStreakInfo();
  const { tags } = useTags();
  const deleteHabit = useDeleteHabit();

  const selectedDateStr = useUIStore((s) => s.selectedDate);
  const setSelectedDate = useUIStore((s) => s.setSelectedDate);
  const goToTodayDate = useUIStore((s) => s.goToToday);
  const syncSelectedDateWithToday = useUIStore(
    (s) => s.syncSelectedDateWithToday,
  );
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
  const [showControlsMenu, setShowControlsMenu] = useState(false);
  const [controlsMenuAnchorRect, setControlsMenuAnchorRect] =
    useState<MenuAnchorRect | null>(null);
  const [showFreqMenu, setShowFreqMenu] = useState(false);
  const [freqMenuAnchorRect, setFreqMenuAnchorRect] =
    useState<MenuAnchorRect | null>(null);
  const [showHabitDeleteConfirm, setShowHabitDeleteConfirm] = useState(false);
  const [slideDirection, setSlideDirection] = useState<"left" | "right">(
    "right",
  );
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const habitListRef = useRef<HabitListHandle>(null);
  const [habitListAllCollapsed, setHabitListAllCollapsed] = useState(false);
  const [habitListAllLoadedIds, setHabitListAllLoadedIds] = useState<
    Set<string>
  >(() => new Set());
  const habitsTourRef = useRef<View>(null);
  useTourTarget("tour-habit-list", habitsTourRef);
  const goalsScrollRef = useRef<ScrollView>(null);
  const goalsScrollTo = useCallback((y: number) => {
    goalsScrollRef.current?.scrollTo({ y, animated: true });
  }, []);
  const { onTourScroll: onGoalsTourScroll } = useTourScrollContainer(
    "/",
    goalsScrollTo,
  );
  const controlsButtonRef = useRef<View>(null);
  const freqMenuButtonRef = useRef<View>(null);
  const previousActiveViewRef = useRef(activeView);
  const dateLabelAnim = useMemo(() => new Animated.Value(0), []);
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

  const [detailHabit, setDetailHabit] = useState<NormalizedHabit | null>(null);
  const [editHabit, setEditHabit] = useState<NormalizedHabit | null>(null);
  const [editHabitOnSaved, setEditHabitOnSaved] = useState<
    (() => void | Promise<void>) | null
  >(null);
  const [habitPendingDelete, setHabitPendingDelete] =
    useState<NormalizedHabit | null>(null);

  const selectedDate = useMemo(
    () => new Date(selectedDateStr + "T00:00:00"),
    [selectedDateStr],
  );
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

  useEffect(() => {
    const dateParam = Array.isArray(date) ? date[0] : date;
    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return;
    setSelectedDate(dateParam);
    setActiveView("today");
  }, [date, setActiveView, setSelectedDate]);

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
    setSelectedDate(formatAPIDate(subDays(selectedDate, 1)));
  }, [selectedDate, setSelectedDate]);

  const goToNextDay = useCallback(() => {
    setSlideDirection("right");
    setSelectedDate(formatAPIDate(addDays(selectedDate, 1)));
  }, [selectedDate, setSelectedDate]);

  const goToToday = useCallback(() => {
    setSlideDirection(
      isToday(selectedDate)
        ? "right"
        : selectedDate > new Date()
          ? "left"
          : "right",
    );
    goToTodayDate();
    setActiveView("today");
  }, [goToTodayDate, selectedDate, setActiveView]);

  useEffect(() => {
    let rolloverTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

    const resetRolloverTimer = () => {
      if (rolloverTimer) {
        globalThis.clearTimeout(rolloverTimer);
      }

      rolloverTimer = globalThis.setTimeout(() => {
        syncSelectedDateWithToday();
        resetRolloverTimer();
      }, getMillisecondsUntilNextLocalMidnight());
    };

    syncSelectedDateWithToday();
    resetRolloverTimer();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState !== "active") return;
      syncSelectedDateWithToday();
      resetRolloverTimer();
    });

    return () => {
      if (rolloverTimer) {
        globalThis.clearTimeout(rolloverTimer);
      }
      subscription.remove();
    };
  }, [syncSelectedDateWithToday]);

  const swipePanResponder = useHorizontalSwipe({
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

  const dateLong = useMemo(
    () =>
      formatLocaleDate(selectedDate, locale, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    [selectedDate, locale],
  );

  useEffect(() => {
    dateLabelAnim.setValue(0);
    Animated.timing(dateLabelAnim, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
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

  useEffect(() => {
    Animated.timing(refetchTransitionAnim, {
      toValue: isRefetching ? 1 : 0,
      duration: isRefetching
        ? listMotion.enterDuration
        : listMotion.exitDuration,
      easing: createAnimatedEasing(
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
       
      setRenderBulkActionBar(true);
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
      easing: createAnimatedEasing(selectionMotion.exitEasing),
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
  useEffect(() => {
    setFilters(filters);
  }, [filters, setFilters]);

  const showSummary =
    currentActiveView === "today" && isToday(selectedDate) && hasProAccess;

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
    if (!hasProAccess && activeView === "goals") {
      setActiveView("today");
    }
  }, [activeView, hasProAccess, setActiveView]);

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
    setShowControlsMenu(false);
    if (isSelectMode) clearSelection();
  }, [activeView, clearSelection, isSelectMode]);

  const handleToggleSelectMode = useCallback(() => {
    if (isSelectMode) {
      clearSelection();
    } else {
      toggleSelectMode();
    }
    setShowControlsMenu(false);
  }, [clearSelection, isSelectMode, toggleSelectMode]);

  const handleToggleCollapse = useCallback(() => {
    if (habitListRef.current?.allCollapsed) {
      habitListRef.current.expandAll();
    } else {
      habitListRef.current?.collapseAll();
    }
    setShowControlsMenu(false);
  }, []);

  const handleRefresh = useCallback(() => {
    habitListRef.current?.refetch();
    setShowControlsMenu(false);
  }, []);

  const handleToggleCompleted = useCallback(() => {
    setShowCompleted(!showCompleted);
    setShowControlsMenu(false);
  }, [setShowCompleted, showCompleted]);

  const measureControlsButton = useCallback(() => {
    controlsButtonRef.current?.measureInWindow((x, y, width, height) => {
      setControlsMenuAnchorRect({ x, y, width, height });
      setShowControlsMenu(true);
    });
  }, []);

  const handleToggleControlsMenu = useCallback(() => {
    if (showControlsMenu) {
      setShowControlsMenu(false);
      return;
    }

    measureControlsButton();
  }, [measureControlsButton, showControlsMenu]);

  const measureFreqMenuButton = useCallback(() => {
    freqMenuButtonRef.current?.measureInWindow((x, y, width, height) => {
      setFreqMenuAnchorRect({ x, y, width, height });
      setShowFreqMenu(true);
    });
  }, []);

  const handleToggleFreqMenu = useCallback(() => {
    if (showFreqMenu) {
      setShowFreqMenu(false);
      return;
    }

    measureFreqMenuButton();
  }, [measureFreqMenuButton, showFreqMenu]);

  const handleSelectFrequency = useCallback(
    (key: FreqKey | null) => {
      setSelectedFrequency(key);
      setShowFreqMenu(false);
    },
    [setSelectedFrequency],
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

  const currentStreak = streakInfo?.currentStreak ?? 0;
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
    setShowControlsMenu(false);
  }, []);

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
        <TodayHeader
          currentStreak={currentStreak}
          onGoToToday={goToToday}
          goToTodayLabel={t("dates.goToToday")}
          dateLong={dateLong}
        />

        <TrialBanner />

        {reviewReminder.shouldShow ? (
          <ReviewReminderCard
            onDismiss={reviewReminder.dismiss}
            onRate={() => {
              void reviewReminder.requestReview();
            }}
          />
        ) : null}

        <TodayTabs
          tabs={tabItems}
          activeView={currentActiveView}
          onChangeView={handleChangeView}
          viewsLabel={t("habits.viewsLabel")}
        />
      </>
    ),
    [
      currentActiveView,
      currentStreak,
      dateLong,
      goToToday,
      handleChangeView,
      reviewReminder,
      tabItems,
      t,
    ],
  );

  const habitsHeader = useMemo<ReactElement>(
    () => (
      <>
        {sharedHeader}

        {showSummary ? <TodayAISummary date={dateStr} /> : null}

        <TodayDateNavigation
          visible={currentActiveView === "today"}
          dateLabel={dateLabel}
          isTodaySelected={isToday(selectedDate)}
          slideDirection={slideDirection}
          onGoToPreviousDay={goToPreviousDay}
          onGoToToday={goToToday}
          onGoToNextDay={goToNextDay}
          previousLabel={t("dates.previousDay")}
          todayLabel={t("dates.goToToday")}
          nextLabel={t("dates.nextDay")}
          dateLabelAnim={dateLabelAnim}
          panHandlers={
            !isSearchFocused ? swipePanResponder.panHandlers : undefined
          }
        />

        <SectionLabel
          trailing={
            <View style={styles.sectionTrailing}>
              <Pressable
                onPress={handleToggleSearch}
                accessibilityRole="button"
                accessibilityLabel={t("habits.searchPlaceholder")}
                hitSlop={6}
                style={styles.iconBtn}
              >
                <Search
                  size={15}
                  color={isSearchOpen ? tokens.fg1 : tokens.fg3}
                  strokeWidth={1.6}
                />
              </Pressable>
              {currentActiveView !== "general" ? (
                <View ref={freqMenuButtonRef} collapsable={false}>
                  <Pressable
                    onPress={handleToggleFreqMenu}
                    accessibilityRole="button"
                    accessibilityLabel={t("habits.frequencyFilter")}
                    accessibilityState={{ selected: selectedFrequency != null }}
                    hitSlop={6}
                    style={[
                      styles.iconBtn,
                      selectedFrequency != null && {
                        backgroundColor: tokens.bgElev,
                        borderWidth: 1,
                        borderColor: tokens.hairlineStrong,
                      },
                    ]}
                  >
                    <Filter
                      size={15}
                      color={
                        selectedFrequency != null ? tokens.fg1 : tokens.fg3
                      }
                      strokeWidth={1.6}
                    />
                  </Pressable>
                </View>
              ) : null}
              <View ref={controlsButtonRef} collapsable={false}>
                <Pressable
                  onPress={handleToggleControlsMenu}
                  accessibilityRole="button"
                  accessibilityLabel={t("habits.actions.more")}
                  hitSlop={6}
                  style={styles.iconBtn}
                >
                  <MoreVertical
                    size={15}
                    color={tokens.fg3}
                    strokeWidth={1.6}
                  />
                </Pressable>
              </View>
            </View>
          }
        >
          {t("habits.sectionLabel")}
        </SectionLabel>

        <Animated.View
          testID="today-filters-shell"
          style={[styles.filtersShell, filtersAnimatedStyle]}
        >
          {isSearchOpen ? (
            <TodaySearchBar
              initialValue={searchQueryStore}
              onChange={setSearchQueryStore}
              onFocusChange={setIsSearchFocused}
              placeholder={t("habits.searchPlaceholder")}
              clearLabel={t("common.clear")}
              focused={isSearchFocused}
              tokens={tokens}
              styles={styles}
            />
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersContent}
          >
            {tags.map((tag) => (
              <TagChip
                key={tag.id}
                tag={tag}
                active={selectedTagIds.includes(tag.id)}
                onPress={() => toggleTagFilter(tag.id)}
              />
            ))}
          </ScrollView>

          <AnchoredMenu
            visible={showControlsMenu}
            anchorRect={controlsMenuAnchorRect}
            onClose={() => setShowControlsMenu(false)}
            width={220}
            estimatedHeight={220}
          >
            <Pressable
              style={({ pressed }) => [
                styles.controlsMenuItem,
                {
                  backgroundColor: pressed ? tokens.bgSunk : "transparent",
                },
              ]}
              onPress={handleToggleSelectMode}
            >
              {isSelectMode ? (
                <X size={15} color={tokens.fg2} strokeWidth={1.6} />
              ) : (
                <CheckCircle2
                  size={15}
                  color={tokens.fg2}
                  strokeWidth={1.6}
                />
              )}
              <Text style={[styles.controlsMenuLabel, { color: tokens.fg1 }]}>
                {isSelectMode ? t("common.cancel") : t("common.select")}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.controlsMenuItem,
                {
                  backgroundColor: pressed ? tokens.bgSunk : "transparent",
                },
              ]}
              onPress={handleToggleCollapse}
            >
              {habitListAllCollapsed ? (
                <ChevronsUpDown
                  size={15}
                  color={tokens.fg2}
                  strokeWidth={1.6}
                />
              ) : (
                <ChevronsDownUp
                  size={15}
                  color={tokens.fg2}
                  strokeWidth={1.6}
                />
              )}
              <Text style={[styles.controlsMenuLabel, { color: tokens.fg1 }]}>
                {habitListAllCollapsed
                  ? t("habits.expandAll")
                  : t("habits.collapseAll")}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.controlsMenuItem,
                {
                  backgroundColor: pressed ? tokens.bgSunk : "transparent",
                },
              ]}
              onPress={handleRefresh}
            >
              <RefreshCw
                size={15}
                color={tokens.fg2}
                strokeWidth={1.6}
                style={habitsQuery.isFetching ? styles.rotatingIcon : undefined}
              />
              <Text style={[styles.controlsMenuLabel, { color: tokens.fg1 }]}>
                {t("habits.refresh")}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.controlsMenuItem,
                {
                  backgroundColor: pressed ? tokens.bgSunk : "transparent",
                },
              ]}
              onPress={handleToggleCompleted}
            >
              {showCompleted ? (
                <Check size={15} color={tokens.fg2} strokeWidth={1.6} />
              ) : (
                <Eye size={15} color={tokens.fg2} strokeWidth={1.6} />
              )}
              <Text style={[styles.controlsMenuLabel, { color: tokens.fg1 }]}>
                {t("habits.showCompleted")}
              </Text>
            </Pressable>
          </AnchoredMenu>

          <AnchoredMenu
            visible={showFreqMenu}
            anchorRect={freqMenuAnchorRect}
            onClose={() => setShowFreqMenu(false)}
            width={200}
            estimatedHeight={260}
          >
            <Pressable
              style={({ pressed }) => [
                styles.controlsMenuItem,
                {
                  backgroundColor: pressed ? tokens.bgSunk : "transparent",
                },
              ]}
              onPress={() => handleSelectFrequency(null)}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: !selectedFrequency }}
            >
              <View style={styles.freqMenuCheck}>
                {!selectedFrequency ? (
                  <Check size={14} color={tokens.primary} strokeWidth={2} />
                ) : null}
              </View>
              <Text
                style={[
                  styles.controlsMenuLabel,
                  {
                    color: !selectedFrequency ? tokens.fg1 : tokens.fg2,
                    fontWeight: !selectedFrequency ? "600" : "500",
                  },
                ]}
              >
                {t("common.all")}
              </Text>
            </Pressable>
            {frequencyOptions.map((opt) => {
              const active = selectedFrequency === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={({ pressed }) => [
                    styles.controlsMenuItem,
                    {
                      backgroundColor: pressed ? tokens.bgSunk : "transparent",
                    },
                  ]}
                  onPress={() => handleSelectFrequency(active ? null : opt.key)}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: active }}
                >
                  <View style={styles.freqMenuCheck}>
                    {active ? (
                      <Check size={14} color={tokens.primary} strokeWidth={2} />
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.controlsMenuLabel,
                      {
                        color: active ? tokens.fg1 : tokens.fg2,
                        fontWeight: active ? "600" : "500",
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </AnchoredMenu>
        </Animated.View>
      </>
    ),
    [
      activeView,
      controlsMenuAnchorRect,
      currentActiveView,
      dateLabel,
      dateLabelAnim,
      dateStr,
      filtersAnimatedStyle,
      frequencyOptions,
      goToNextDay,
      goToPreviousDay,
      goToToday,
      habitListAllCollapsed,
      habitsQuery.isFetching,
      handleRefresh,
      handleToggleCollapse,
      handleToggleCompleted,
      handleToggleControlsMenu,
      handleToggleSearch,
      handleToggleSelectMode,
      isSearchFocused,
      isSearchOpen,
      isSelectMode,
      searchQueryStore,
      selectedDate,
      selectedFrequency,
      selectedTagIds,
      setSearchQueryStore,
      setSelectedFrequency,
      sharedHeader,
      showCompleted,
      showControlsMenu,
      showSummary,
      slideDirection,
      styles,
      swipePanResponder.panHandlers,
      t,
      tags,
      toggleTagFilter,
      tokens,
      freqMenuAnchorRect,
      showFreqMenu,
      handleToggleFreqMenu,
      handleSelectFrequency,
    ],
  );

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      {currentActiveView === "goals" ? (
        <ScrollView
          ref={goalsScrollRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            isSelectMode && styles.scrollContentWithBulkBar,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          onScroll={onGoalsTourScroll}
          scrollEventThrottle={16}
          onScrollBeginDrag={handleListScrollBeginDrag}
        >
          {sharedHeader}
          <GoalsView />
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
            countLabel={plural(
              t("common.selected", { n: selectedCount }),
              selectedCount,
            )}
            selectAllLabel={t("common.selectAll")}
            deselectAllLabel={t("common.deselectAll")}
            logLabel={t("habits.bulkLogConfirm")}
            skipLabel={t("habits.bulkSkipConfirm")}
            deleteLabel={t("habits.bulkDeleteConfirm")}
            closeLabel={t("common.cancel")}
          />
        </Animated.View>
      )}

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
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: tokens.bg,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 120,
    },
    scrollContentWithBulkBar: {
      paddingBottom: 220,
    },
    listShell: {
      flex: 1,
    },

    filtersShell: {
      paddingBottom: 8,
    },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 20,
      paddingVertical: 8,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 0,
      fontFamily: "Geist",
      fontSize: 15,
    },
    filtersContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 20,
      paddingVertical: 4,
    },
    freqMenuCheck: {
      width: 16,
      alignItems: "center",
      justifyContent: "center",
    },

    sectionTrailing: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },

    controlsMenuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 6,
    },
    controlsMenuLabel: {
      fontFamily: "Geist",
      fontSize: 14,
      fontWeight: "500",
    },
    rotatingIcon: {
      transform: [{ rotate: "180deg" }],
    },

    bulkActionBarWrap: {
      position: "absolute",
      left: 20,
      right: 20,
      zIndex: 20,
    },
  });
}
