import { type ComponentProps, type ReactElement, type RefObject } from "react";
import {
  // react-doctor-disable-next-line rn-prefer-reanimated -- Deliberate React Native Animated API; migrating to reanimated risks the pinned worklets 0.10.0 / reanimated 4.5.0 ABI (SDK 57) and would require rewriting the shared lib/motion.ts Animated helpers + cross-component Animated.Value props. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  Animated,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTranslation } from "react-i18next";
import type { HabitsFilter } from "@orbit/shared/types/habit";
import { HabitList, type HabitListHandle } from "@/components/habit-list";
import { PillButton } from "@/components/ui/pill-button";
import { SatelliteGlyph } from "@/components/ui/satellite-glyph";
import type { createStyles, TodayView } from "@/app/(tabs)";

type TodayScreenStyles = ReturnType<typeof createStyles>;
type AnimatedViewStyle = Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
type HabitListProps = ComponentProps<typeof HabitList>;

interface TodayScreenBodyProps {
  currentActiveView: TodayView;
  showHabitsLoadError: boolean;
  sharedHeader: ReactElement;
  habitsHeader: ReactElement;
  styles: TodayScreenStyles;
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
 * Renders the Today screen's main content region: habits load-error state or
 * the animated habit list. Presentational, extracted verbatim from
 * TodayScreen so the screen stays under the cognitive-complexity threshold.
 */
export function TodayScreenBody({
  currentActiveView,
  showHabitsLoadError,
  sharedHeader,
  habitsHeader,
  styles,
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

  if (showHabitsLoadError) {
    return (
      <ScrollView style={styles.listShell} showsVerticalScrollIndicator={false}>
        {sharedHeader}
        <View style={styles.loadErrorState}>
          <SatelliteGlyph size={96} />
          <Text style={styles.loadErrorText}>{t("habits.loadError")}</Text>
          <PillButton
            variant="ghost"


            onClick={onRetry}
          >
            {t("common.retry")}
          </PillButton>
        </View>
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
