import { type ComponentProps, type ReactElement, type RefObject } from "react";
import {
  // react-doctor-disable-next-line rn-prefer-reanimated -- Deliberate React Native Animated API; migrating to reanimated risks the pinned worklets 0.10.0 / reanimated 4.5.0 ABI (SDK 57) and would require rewriting the shared lib/motion.ts Animated helpers + cross-component Animated.Value props. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  Animated,
  ScrollView,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTranslation } from "react-i18next";
import type { HabitsFilter } from "@orbit/shared/types/habit";
import { HabitList, type HabitListHandle } from "@/components/habit-list";
import { GoalsView } from "@/components/goals/goals-view";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertTriangle } from "@/components/ui/icons";
import type { createStyles, TodayView } from "./index";

type TodayScreenStyles = ReturnType<typeof createStyles>;
type AnimatedViewStyle = Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
type GoalsViewProps = ComponentProps<typeof GoalsView>;
type HabitListProps = ComponentProps<typeof HabitList>;

interface TodayScreenBodyProps {
  currentActiveView: TodayView;
  showHabitsLoadError: boolean;
  sharedHeader: ReactElement;
  habitsHeader: ReactElement;
  styles: TodayScreenStyles;
  goalsScrollRef: GoalsViewProps["scrollRef"];
  habitsTourRef: RefObject<View | null>;
  habitListRef: RefObject<HabitListHandle | null>;
  isSelectMode: boolean;
  listAnimatedStyle: AnimatedViewStyle;
  refetchAnimatedStyle: AnimatedViewStyle;
  filters: HabitsFilter;
  selectedDate: Date;
  showCompleted: boolean;
  searchQuery: string;
  selectedHabitIds: Set<string>;
  onGoalsScroll: GoalsViewProps["onScroll"];
  onScrollBeginDrag: () => void;
  onRetry: () => void;
  onCreatePress: () => void;
  onSeeUpcoming: () => void;
  onDetailHabit: HabitListProps["onDetailHabit"];
  onEditHabit: HabitListProps["onEditHabit"];
  onScroll: HabitListProps["onScroll"];
  onAllCollapsedChange: HabitListProps["onAllCollapsedChange"];
  onAllLoadedIdsChange: HabitListProps["onAllLoadedIdsChange"];
}

/**
 * Renders the Today screen's main content region: goals view, habits load-error
 * state, or the animated habit list. Presentational — extracted verbatim from
 * TodayScreen so the screen stays under the cognitive-complexity threshold.
 */
export function TodayScreenBody({
  currentActiveView,
  showHabitsLoadError,
  sharedHeader,
  habitsHeader,
  styles,
  goalsScrollRef,
  habitsTourRef,
  habitListRef,
  isSelectMode,
  listAnimatedStyle,
  refetchAnimatedStyle,
  filters,
  selectedDate,
  showCompleted,
  searchQuery,
  selectedHabitIds,
  onGoalsScroll,
  onScrollBeginDrag,
  onRetry,
  onCreatePress,
  onSeeUpcoming,
  onDetailHabit,
  onEditHabit,
  onScroll,
  onAllCollapsedChange,
  onAllLoadedIdsChange,
}: Readonly<TodayScreenBodyProps>) {
  const { t } = useTranslation();

  if (currentActiveView === "goals") {
    return (
      <GoalsView
        listHeader={sharedHeader}
        scrollRef={goalsScrollRef}
        contentContainerStyle={
          isSelectMode ? styles.scrollContentWithBulkBar : undefined
        }
        onScroll={onGoalsScroll}
        onScrollBeginDrag={onScrollBeginDrag}
      />
    );
  }

  if (showHabitsLoadError) {
    return (
      <ScrollView style={styles.listShell} showsVerticalScrollIndicator={false}>
        {sharedHeader}
        <EmptyState
          icon={AlertTriangle}
          description={t("habits.loadError")}
          action={{
            label: t("common.retry"),
            onPress: onRetry,
            variant: "secondary",
          }}
        />
      </ScrollView>
    );
  }

  return (
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
          selectedDate={currentActiveView === "today" ? selectedDate : undefined}
          showCompleted={showCompleted}
          searchQuery={searchQuery}
          isSelectMode={isSelectMode}
          selectedHabitIds={selectedHabitIds}
          listHeader={habitsHeader}
          onCreatePress={onCreatePress}
          onSeeUpcoming={onSeeUpcoming}
          onDetailHabit={onDetailHabit}
          onEditHabit={onEditHabit}
          onScrollBeginDrag={onScrollBeginDrag}
          onScroll={onScroll}
          onAllCollapsedChange={onAllCollapsedChange}
          onAllLoadedIdsChange={onAllLoadedIdsChange}
        />
      </Animated.View>
    </Animated.View>
  );
}
