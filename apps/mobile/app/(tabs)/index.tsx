import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type ReactElement,
} from "react";
// react-doctor-disable-next-line rn-prefer-reanimated -- Deliberate React Native Animated API; migrating to reanimated risks the pinned worklets 0.10.0 / reanimated 4.5.0 ABI (SDK 57) and would require rewriting the shared lib/motion.ts Animated helpers + cross-component Animated.Value props. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import {
  Animated,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import type { FlatList } from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isToday } from "date-fns";
import { useTranslation } from "react-i18next";
import {
  computeDayProgress,
  formatAPIDate,
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
} from "@/hooks/use-habits";
import { useTags } from "@/hooks/use-tags";
import { useCoachTour } from "@/hooks/use-coach-tour";
import { useUIStore } from "@/stores/ui-store";
import { useReferralPromptStore } from "@/stores/referral-prompt-store";
import { type HabitListHandle } from "@/components/habit-list";
import { BulkActionBarV2 } from "@/components/habits/bulk-action-bar-v2";
import { GradientTop } from "@/components/ui/gradient-top";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { TrialBanner } from "@/components/ui/trial-banner";
import { DismissibleCard } from "@/components/today/dismissible-card";
import { TodayHabitsHeader } from "@/components/today/today-habits-header";
import { ReferralCard } from "@/components/referral/referral-card";
import { SocialEntryCard } from "@/components/social/social-entry-card";
import { SetupChecklistCard } from "@/components/today/setup-checklist-card";
import { useAnchoredMenu } from "@/components/ui/anchored-menu";
import { createTokensV2 } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";
import { useEngagementSlot } from "@/hooks/use-engagement-slot";
import { useTourScrollContainer } from "@/hooks/use-tour-scroll-container";
import { useTourTarget } from "@/hooks/use-tour-target";
import { TodayHeader, TodayTabs, type TodayTabItem } from "./today-shell";
import { buildTodayFilters } from "./today-model";
import { useTodayViewSync } from "./use-today-view-sync";
import { TodayScreenBody } from "./today-sections";
import { useTodayDate } from "./use-today-date";
import { useTodayMotion } from "./use-today-motion";
import { useTodaySelection } from "./use-today-selection";
import { TodayModals } from "./today-modals";

export { resolveBulkActionBarEnterShift } from "./today-model";

const TAB_VIEWS = ["today", "all", "general", "goals"] as const;
export type TodayView = (typeof TAB_VIEWS)[number];

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

type FreqKey = "Day" | "Week" | "Month" | "Year" | "none";

// react-doctor-disable-next-line no-giant-component -- Screen orchestration is already decomposed into today-sections / today-shell / today-modals and the use-today-* hooks; the remaining wiring + JSX tree is inherently long, and further splitting is a regression-prone refactor with cross-platform parity cost. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export default function TodayScreen() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const tokens = useMemo(
    () => createTokensV2(theme.currentScheme, theme.currentTheme),
    [theme.currentScheme, theme.currentTheme],
  );
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const { showInterstitialIfDue } = useAdMob();
  const { profile } = useProfile();
  const { tags } = useTags();
  useCoachTour();

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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const habitListRef = useRef<HabitListHandle>(null);
  const [habitListAllCollapsed, setHabitListAllCollapsed] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
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
  const scrollGoalsToTop = useCallback(() => {
    goalsScrollTo(0);
  }, [goalsScrollTo]);
  const handleGoalsScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      onGoalsTourScroll(event);
      setShowScrollTop(event.nativeEvent.contentOffset.y > 600);
    },
    [onGoalsTourScroll],
  );
  const isGoalsView = currentActiveView === "goals";
  const [scrollTopResetGoalsView, setScrollTopResetGoalsView] =
    useState(isGoalsView);
  if (isGoalsView !== scrollTopResetGoalsView) {
    setScrollTopResetGoalsView(isGoalsView);
    setShowScrollTop(false);
  }

  const [detailHabit, setDetailHabit] = useState<NormalizedHabit | null>(null);
  const [editHabit, setEditHabit] = useState<NormalizedHabit | null>(null);
  const [editHabitOnSaved, setEditHabitOnSaved] = useState<
    (() => void | Promise<void>) | null
  >(null);

  const {
    pinnedDateStr,
    selectedDateStr,
    selectedDate,
    dateStr,
    dateLabel,
    slideDirection,
    dateLabelAnim,
    goToPreviousDay,
    goToNextDay,
    goToToday,
    swipeGesture,
  } = useTodayDate();

  const { slot: engagementSlot } = useEngagementSlot({
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
      if (shouldRedirectGoalsTab(nextView, profile?.hasProAccess ?? false)) {
        router.push("/upgrade");
        return;
      }

      setActiveView(nextView);
      setSearchQueryStore("");
    },
    [profile?.hasProAccess, router, setActiveView, setSearchQueryStore],
  );

  const tabItems = useMemo<TodayTabItem[]>(
    () =>
      TAB_VIEWS.map((view) => {
        let label: string;
        if (view === "today") label = t("habits.viewToday");
        else if (view === "all") label = t("habits.viewAll");
        else if (view === "general") label = t("habits.viewGeneral");
        else label = t("goals.tab");
        return { view, label };
      }),
    [t],
  );

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

  const filters = useMemo<HabitsFilter>(
    () =>
      buildTodayFilters({
        view: currentActiveView,
        dateStr,
        isTodayDate: isToday(selectedDate),
        searchQuery: searchQueryStore,
        selectedFrequency,
        selectedTagIds,
        showGeneralOnToday,
      }),
    [
      currentActiveView,
      dateStr,
      selectedDate,
      searchQueryStore,
      selectedFrequency,
      selectedTagIds,
      showGeneralOnToday,
    ],
  );

  const habitsQuery = useHabits(filters);
  const hasFetchedHabits = habitsQuery.data !== undefined;
  const isRefetching = habitsQuery.isFetching && hasFetchedHabits;
  const showHabitsLoadError = habitsQuery.isError && !hasFetchedHabits;
  const habitsById = habitsQuery.data?.habitsById ?? EMPTY_HABITS_BY_ID;
  const childrenByParent =
    habitsQuery.data?.childrenByParent ?? EMPTY_CHILDREN_BY_PARENT;

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
    () => computeDayProgress(habitsQuery.data?.habitsById ?? EMPTY_HABITS_BY_ID, dateStr),
    [habitsQuery.data?.habitsById, dateStr],
  );
  const showDayProgress = currentActiveView === "today" && dayProgress.total > 0;

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
    clearSelection,
    allSelected,
    selectedCount,
    handleToggleSelectMode,
    handleSelectAll,
    handleDeselectAll,
    handleOpenBulkDelete,
    handleOpenBulkLog,
    handleOpenBulkSkip,
  } = useTodaySelection({
    habitsById,
    habitListRef,
    habitListAllLoadedIds,
    visibleHabitIds,
    closeControlsMenu,
  });

  const {
    filtersAnimatedStyle,
    listAnimatedStyle,
    refetchAnimatedStyle,
    bulkBarAnimatedStyle,
    renderBulkActionBar,
    setRenderBulkActionBar,
  } = useTodayMotion({ filterMotionKey, isRefetching });

  const setFilters = useUIStore((s) => s.setFilters);
  const showCreateModal = useUIStore((s) => s.showCreateModal);
  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal);
  const showCreateGoalModal = useUIStore((s) => s.showCreateGoalModal);
  const setShowCreateGoalModal = useUIStore((s) => s.setShowCreateGoalModal);
  const dismissHomeEntry = useReferralPromptStore((s) => s.dismissHomeEntry);
  const [showReferral, setShowReferral] = useState(false);

  useTodayViewSync({
    currentActiveView,
    isSelectMode,
    pinnedDateStr,
    filters,
    setShowScrollTop,
    setRenderBulkActionBar,
    setActiveView,
    setFilters,
    setSearchQuery: setSearchQueryStore,
  });

  const showSummary = currentActiveView === "today" && isToday(selectedDate);

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
          currentStreak={profile?.currentStreak ?? 0}
          onGoToToday={goToToday}
          goToTodayLabel={t("dates.goToToday")}
          topInset={insets.top}
        />

        {engagementSlot === "trial" ? <TrialBanner /> : null}

        <DismissibleCard visible={engagementSlot === "setupChecklist"}>
          <SetupChecklistCard />
        </DismissibleCard>

        <DismissibleCard visible={engagementSlot === "referral"}>
          <ReferralCard
            onOpen={() => setShowReferral(true)}
            onDismiss={dismissHomeEntry}
          />
        </DismissibleCard>

        <DismissibleCard visible={engagementSlot === "socialEntry"}>
          <SocialEntryCard />
        </DismissibleCard>

        <TodayTabs
          tabs={tabItems}
          activeView={currentActiveView}
          hasProAccess={profile?.hasProAccess ?? false}
          onChangeView={handleChangeView}
          viewsLabel={t("habits.viewsLabel")}
        />
      </>
    ),
    [
      currentActiveView,
      profile?.currentStreak,
      engagementSlot,
      profile?.hasProAccess,
      insets.top,
      goToToday,
      handleChangeView,
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
      <TodayScreenBody
        currentActiveView={currentActiveView}
        showHabitsLoadError={showHabitsLoadError}
        sharedHeader={sharedHeader}
        habitsHeader={habitsHeader}
        styles={styles}
        goalsScrollRef={goalsScrollRef}
        habitsTourRef={habitsTourRef}
        habitListRef={habitListRef}
        isSelectMode={isSelectMode}
        listAnimatedStyle={listAnimatedStyle}
        refetchAnimatedStyle={refetchAnimatedStyle}
        filters={filters}
        selectedDate={selectedDate}
        showCompleted={showCompleted}
        searchQuery={searchQueryStore}
        selectedHabitIds={selectedHabitIds}
        onGoalsScroll={handleGoalsScroll}
        onScrollBeginDrag={handleListScrollBeginDrag}
        onRetry={() => {
          void habitsQuery.refetch();
        }}
        onCreatePress={() => setShowCreateModal(true)}
        onSeeUpcoming={goToNextDay}
        onDetailHabit={setDetailHabit}
        onEditHabit={handleEditHabit}
        onScroll={handleHabitListScroll}
        onAllCollapsedChange={setHabitListAllCollapsed}
        onAllLoadedIdsChange={setHabitListAllLoadedIds}
      />

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

      <ScrollToTopButton
        visible={showScrollTop && !isSelectMode}
        onPress={isGoalsView ? scrollGoalsToTop : scrollHabitsToTop}
        bottom={insets.bottom + 24}
      />

      <TodayModals
        showCreateModal={showCreateModal}
        onCloseCreateModal={() => setShowCreateModal(false)}
        createInitialDate={
          currentActiveView === "today" ? formatAPIDate(selectedDate) : null
        }
        detailHabit={detailHabit}
        onCloseDetail={() => setDetailHabit(null)}
        onHabitLogged={handleHabitLogged}
        editHabit={editHabit}
        editHabitParentIsGeneral={
          editHabit?.parentId
            ? (habitsById.get(editHabit.parentId)?.isGeneral ?? null)
            : null
        }
        onCloseEdit={handleEditHabitClose}
        editHabitOnSaved={editHabitOnSaved}
        showBulkDeleteConfirm={showBulkDeleteConfirm}
        onBulkDeleteOpenChange={setShowBulkDeleteConfirm}
        onConfirmBulkDelete={() => void confirmBulkDelete()}
        showBulkLogConfirm={showBulkLogConfirm}
        onBulkLogOpenChange={setShowBulkLogConfirm}
        onConfirmBulkLog={() => void confirmBulkLog()}
        showBulkSkipConfirm={showBulkSkipConfirm}
        onBulkSkipOpenChange={setShowBulkSkipConfirm}
        onConfirmBulkSkip={() => void confirmBulkSkip()}
        selectedCount={selectedCount}
        showCreateGoalModal={showCreateGoalModal}
        onCloseCreateGoal={() => setShowCreateGoalModal(false)}
        showReferral={showReferral}
        onCloseReferral={() => setShowReferral(false)}
      />
    </View>
  );
}

export function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: tokens.bg,
    },
    scrollContentWithBulkBar: {
      paddingBottom: 220,
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
