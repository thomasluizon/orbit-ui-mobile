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
import { Check, Filter } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { Goal, GoalStatus } from "@orbit/shared/types/goal";
import { useGoals } from "@/hooks/use-goals";
import { GoalList } from "./goal-list";
import {
  AnchoredMenu,
  MenuAnchorHost,
  useAnchoredMenu,
} from "@/components/ui/anchored-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionLabel } from "@/components/ui/section-label";
import { SkeletonLine } from "@/components/ui/skeleton";
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
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollBeginDrag?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

function SkeletonCard({
  styles,
}: Readonly<{
  styles: Record<string, object>;
}>) {
  return (
    <View style={styles.skeletonCard}>
      <SkeletonLine width="66%" height={20} />
      <SkeletonLine width="100%" height={12} />
      <SkeletonLine width="100%" height={8} />
    </View>
  );
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

  const {
    anchorRef: filterMenuButtonRef,
    visible: showFilterMenu,
    anchorRect: filterMenuAnchorRect,
    close: closeFilterMenu,
    toggle: toggleFilterMenu,
  } = useAnchoredMenu();

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
            <MenuAnchorHost anchorRef={filterMenuButtonRef}>
              <Pressable
                onPress={toggleFilterMenu}
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
            </MenuAnchorHost>
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
      description={t("goals.filters.emptyFilteredHint")}
      action={{
        label: t("goals.filters.clearFilter"),
        onPress: () => handleFilterChange(null),
        variant: "secondary",
      }}
    />
  ) : (
    <EmptyState
      title={t("goals.empty")}
      description={t("goals.emptyHint")}
      action={{
        label: t("goals.create"),
        onPress: () => setShowCreateGoalModal(true),
      }}
    />
  );

  const listEmptyElement = !isFetched ? (
    <View style={styles.skeletonContainer}>
      <SkeletonCard styles={styles} />
      <SkeletonCard styles={styles} />
      <SkeletonCard styles={styles} />
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

      <AnchoredMenu
        visible={showFilterMenu}
        anchorRect={filterMenuAnchorRect}
        onClose={closeFilterMenu}
        width={200}
        estimatedHeight={200}
      >
        {statusFilters.map((filter) => {
          const active = activeFilter === filter.key;
          return (
            <Pressable
              key={filter.key ?? "all"}
              style={({ pressed }) => [
                styles.menuItem,
                {
                  backgroundColor: pressed ? tokens.bgSunk : "transparent",
                },
              ]}
              onPress={() => handleFilterChange(filter.key)}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: active }}
            >
              <View style={styles.menuCheck}>
                {active ? (
                  <Check size={14} color={tokens.primary} strokeWidth={2} />
                ) : null}
              </View>
              <Text
                style={[
                  styles.menuLabel,
                  active ? styles.menuLabelActive : null,
                  { color: active ? tokens.fg1 : tokens.fg2 },
                ]}
              >
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </AnchoredMenu>
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
