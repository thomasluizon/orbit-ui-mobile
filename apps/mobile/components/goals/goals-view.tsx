import { useCallback, useMemo, useState, type ReactElement } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import type { FlatList } from "react-native-gesture-handler";
import { Filter } from "@/components/ui/icons";
import { useTranslation } from "react-i18next";
import type { Goal, GoalStatus } from "@orbit/shared/types/goal";
import { useGoals } from "@/hooks/use-goals";
import { GoalList } from "./goal-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PillButton } from "@/components/ui/pill-button";
import { RadioRow } from "@/components/ui/select-check";
import { Sheet, useSheetHost } from "@/components/ui/sheet";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { createTokensV2 } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";
import { useUIStore } from "@/stores/ui-store";

type AppTokens = ReturnType<typeof createTokensV2>;

interface StatusFilter {
  key: GoalStatus | null;
  label: string;
}

interface GoalsViewProps {
  listHeader?: ReactElement;
  scrollRef?: React.Ref<FlatList<Goal>>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  onScroll?: (offsetY: number) => void;
  onScrollBeginDrag?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

export function GoalsView({
  listHeader,
  scrollRef,
  contentContainerStyle,
  onScroll,
  onScrollBeginDrag,
}: Readonly<GoalsViewProps>) {
  const { t } = useTranslation();
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const setShowCreateGoalModal = useUIStore((s) => s.setShowCreateGoalModal);
  const [activeFilter, setActiveFilter] = useState<GoalStatus | null>(null);

  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const closeFilterMenu = useCallback(() => setShowFilterMenu(false), []);

  const { data, isFetched } = useGoals(activeFilter);

  const statusFilters = useMemo<StatusFilter[]>(
    () => [
      { key: null, label: t("goals.filters.all") },
      { key: "Active", label: t("goals.filters.active") },
      { key: "Completed", label: t("goals.filters.completed") },
      { key: "Abandoned", label: t("goals.filters.abandoned") },
    ],
    [t],
  );

  const filteredGoals = useMemo(() => {
    if (!data) return [];
    if (!activeFilter) return data.allGoals;
    return data.allGoals.filter((goal) => goal.status === activeFilter);
  }, [activeFilter, data]);

  const handleFilterChange = useCallback(
    (status: GoalStatus | null) => {
      setActiveFilter(status);
      closeFilterMenu();
    },
    [closeFilterMenu],
  );

  const listHeaderElement = (
    <>
      {listHeader}
      <SectionLabel
        top={16}
        bottom={12}
        trailing={
          <View style={styles.headerActions}>
            {activeFilter != null ? (
              <Text style={styles.activeFilterLabel}>
                {statusFilters.find((filter) => filter.key === activeFilter)?.label}
              </Text>
            ) : null}
            <Pressable
              onPress={() => setShowFilterMenu(true)}
              accessibilityRole="button"
              accessibilityLabel={t("goals.filters.statusFilter")}
              accessibilityState={{ selected: activeFilter != null }}
              hitSlop={4}
              style={({ pressed }) => [
                styles.iconBtn,
                activeFilter != null && styles.iconBtnActive,
                pressed && styles.iconBtnPressed,
              ]}
            >
              <Filter
                size={18}
                color={activeFilter != null ? tokens.fg1 : tokens.fg3}
                strokeWidth={1.8}
              />
            </Pressable>
          </View>
        }
      >
        {t("goals.tab")}
      </SectionLabel>
    </>
  );

  const filteredEmptyElement = activeFilter != null ? (
    <EmptyState
      title={t("goals.filters.emptyFiltered")}
      action={
        <PillButton variant="ghost" onClick={() => handleFilterChange(null)}>
          {t("goals.filters.clearFilter")}
        </PillButton>
      }
    />
  ) : (
    <EmptyState
      title={t("goals.empty")}
      action={
        <PillButton onClick={() => setShowCreateGoalModal(true)}>
          {t("goals.create")}
        </PillButton>
      }
    />
  );

  const listEmptyElement = !isFetched ? (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3].map((unit) => (
        <Skeleton key={unit} variant="stat-tile" label={t("common.loading")} />
      ))}
    </View>
  ) : (
    filteredEmptyElement
  );

  return (
    <View style={styles.container}>
      <GoalList
        ref={scrollRef}
        goals={filteredGoals}
        ListHeaderComponent={listHeaderElement}
        ListEmptyComponent={listEmptyElement}
        contentContainerStyle={contentContainerStyle}
        onScroll={onScroll}
        onScrollBeginDrag={onScrollBeginDrag}
      />

      {showFilterMenu ? (
        <StatusFilterSheet
          title={t("goals.filters.statusFilter")}
          filters={statusFilters}
          activeFilter={activeFilter}
          onClose={closeFilterMenu}
          onSelect={setActiveFilter}
        />
      ) : null}
    </View>
  );
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    iconBtnActive: {
      backgroundColor: tokens.bgElev,
      borderWidth: 1.5,
      borderColor: tokens.hairlineStrong,
    },
    iconBtnPressed: {
      backgroundColor: tokens.bgElev,
      transform: [{ scale: 0.96 }],
    },
    activeFilterLabel: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg2,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 44,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    menuCheck: {
      width: 14,
      height: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    menuLabel: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      flex: 1,
    },
    menuLabelActive: {
      fontFamily: 'Rubik_600SemiBold',
    },
    skeletonContainer: {
      gap: 12,
      paddingHorizontal: 20,
    },
    skeletonCard: {
      backgroundColor: tokens.bgCard,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: tokens.hairline,
      padding: 20,
      gap: 10,
    },
  });
}

interface StatusFilterSheetProps {
  title: string;
  filters: readonly StatusFilter[];
  activeFilter: GoalStatus | null;
  onClose: () => void;
  onSelect: (status: GoalStatus | null) => void;
}

/** A single-choice picker, so the chosen status reads as a checked radio. */
function StatusFilterSheet({
  title,
  filters,
  activeFilter,
  onClose,
  onSelect,
}: Readonly<StatusFilterSheetProps>) {
  const { sheetRef, closeSheet } = useSheetHost();

  return (
    <Sheet ref={sheetRef} open title={title} onClose={onClose}>
      <View accessibilityRole="radiogroup">
        {filters.map((filter, index) => (
          <RadioRow
            key={filter.key ?? "all"}
            label={filter.label}
            selected={activeFilter === filter.key}
            divider={index < filters.length - 1}
            onPress={() =>
              closeSheet(() => {
                onClose();
                onSelect(filter.key);
              })
            }
          />
        ))}
      </View>
    </Sheet>
  );
}
