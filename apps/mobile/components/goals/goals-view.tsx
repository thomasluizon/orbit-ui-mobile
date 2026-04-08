import { useCallback, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Flag } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { GoalStatus } from "@orbit/shared/types/goal";
import { useGoals } from "@/hooks/use-goals";
import { GoalList } from "./goal-list";
import { radius } from "@/lib/theme";
import type { ThemeContextValue } from "@/lib/theme-provider";
import { useAppTheme } from "@/lib/use-app-theme";

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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeFilter, setActiveFilter] = useState<GoalStatus | null>(null);

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
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        contentContainerStyle={styles.filtersRow}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {statusFilters.map((filter) => {
          const active = activeFilter === filter.key;
          return (
            <TouchableOpacity
              key={filter.key ?? "all"}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => handleFilterChange(filter.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterChipText,
                  active && styles.filterChipTextActive,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {!isFetched ? (
        <View style={styles.skeletonContainer}>
          <SkeletonCard styles={styles} />
          <SkeletonCard styles={styles} />
          <SkeletonCard styles={styles} />
        </View>
      ) : filteredGoals.length > 0 ? (
        <GoalList goals={filteredGoals} />
      ) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconContainer}>
            <Flag size={32} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>{t("goals.empty")}</Text>
          <Text style={styles.emptySubtitle}>{t("goals.emptyHint")}</Text>
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeContextValue["colors"]) {
  return StyleSheet.create({
    container: {
      paddingTop: 16,
    },
    filtersRow: {
      gap: 8,
      paddingBottom: 16,
      paddingRight: 20,
    },
    filterChip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      flexShrink: 0,
    },
    filterChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterChipText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textFaded,
    },
    filterChipTextActive: {
      color: colors.white,
    },
    skeletonContainer: {
      gap: 12,
    },
    skeletonCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      padding: 20,
      gap: 10,
    },
    skeletonTitle: {
      height: 20,
      width: "66%",
      borderRadius: 999,
      backgroundColor: colors.surfaceElevated,
    },
    skeletonBody: {
      height: 12,
      width: "100%",
      borderRadius: 999,
      backgroundColor: colors.surfaceElevated,
    },
    skeletonBar: {
      height: 8,
      width: "100%",
      borderRadius: 999,
      backgroundColor: colors.surfaceElevated,
    },
    emptyState: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 64,
    },
    emptyIconContainer: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.surfaceGround,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textSecondary,
      marginBottom: 4,
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: "center",
      marginBottom: 24,
    },
  });
}
