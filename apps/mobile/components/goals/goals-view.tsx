import { useCallback, useMemo, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Check, Filter } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { GoalStatus } from "@orbit/shared/types/goal";
import { useGoals } from "@/hooks/use-goals";
import { GoalList } from "./goal-list";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { EmptyState } from "@/components/ui/empty-state";
import type { MenuAnchorRect } from "@/lib/anchored-menu";
import { createTokensV2 } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";

type AppTokens = ReturnType<typeof createTokensV2>;

interface StatusFilter {
  key: GoalStatus | null;
  label: string;
}

function SkeletonCard({
  styles,
}: Readonly<{
  styles: Record<string, object>;
}>) {
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonTitle} />
      <View style={styles.skeletonBody} />
      <View style={styles.skeletonBar} />
    </View>
  );
}

export function GoalsView() {
  const { t } = useTranslation();
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [activeFilter, setActiveFilter] = useState<GoalStatus | null>(null);

  const filterMenuButtonRef = useRef<View>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [filterMenuAnchorRect, setFilterMenuAnchorRect] =
    useState<MenuAnchorRect | null>(null);

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

  const handleFilterChange = useCallback((status: GoalStatus | null) => {
    setActiveFilter(status);
    setShowFilterMenu(false);
  }, []);

  const handleToggleFilterMenu = useCallback(() => {
    if (showFilterMenu) {
      setShowFilterMenu(false);
      return;
    }
    filterMenuButtonRef.current?.measureInWindow((x, y, width, height) => {
      setFilterMenuAnchorRect({ x, y, width, height });
      setShowFilterMenu(true);
    });
  }, [showFilterMenu]);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View ref={filterMenuButtonRef} collapsable={false}>
          <Pressable
            onPress={handleToggleFilterMenu}
            accessibilityRole="button"
            accessibilityLabel={t("goals.filters.statusFilter")}
            accessibilityState={{ selected: activeFilter != null }}
            hitSlop={6}
            style={[
              styles.iconBtn,
              activeFilter != null && styles.iconBtnActive,
            ]}
          >
            <Filter
              size={15}
              color={activeFilter != null ? tokens.fg1 : tokens.fg3}
              strokeWidth={1.6}
            />
          </Pressable>
        </View>
      </View>

      {!isFetched ? (
        <View style={styles.skeletonContainer}>
          <SkeletonCard styles={styles} />
          <SkeletonCard styles={styles} />
          <SkeletonCard styles={styles} />
        </View>
      ) : filteredGoals.length > 0 ? (
        <GoalList goals={filteredGoals} />
      ) : (
        <EmptyState
          title={t("goals.empty")}
          description={t("goals.emptyHint")}
        />
      )}

      <AnchoredMenu
        visible={showFilterMenu}
        anchorRect={filterMenuAnchorRect}
        onClose={() => setShowFilterMenu(false)}
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
                  {
                    color: active ? tokens.fg1 : tokens.fg2,
                    fontWeight: active ? "600" : "500",
                  },
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
      paddingTop: 8,
    },
    toolbar: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    iconBtn: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    iconBtnActive: {
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairlineStrong,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
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
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      flex: 1,
    },
    skeletonContainer: {
      gap: 12,
      paddingHorizontal: 20,
    },
    skeletonCard: {
      backgroundColor: tokens.bgSunk,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: tokens.hairline,
      padding: 20,
      gap: 10,
    },
    skeletonTitle: {
      height: 20,
      width: "66%",
      borderRadius: 999,
      backgroundColor: tokens.bgElev,
    },
    skeletonBody: {
      height: 12,
      width: "100%",
      borderRadius: 999,
      backgroundColor: tokens.bgElev,
    },
    skeletonBar: {
      height: 8,
      width: "100%",
      borderRadius: 999,
      backgroundColor: tokens.bgElev,
    },
  });
}
