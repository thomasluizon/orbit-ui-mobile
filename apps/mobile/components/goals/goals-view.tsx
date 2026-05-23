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
import { createTokensV2, radius } from '@/lib/theme';
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
        keyboardShouldPersistTaps="always"
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
            <Flag size={32} color={tokens.fg3} />
          </View>
          <Text style={styles.emptyTitle}>{t("goals.empty")}</Text>
          <Text style={styles.emptySubtitle}>{t("goals.emptyHint")}</Text>
        </View>
      )}
    </View>
  );
}

function createStyles(tokens: AppTokens) {
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
      paddingVertical: 10,
      minHeight: 42,
      borderRadius: radius.lg,
      backgroundColor: tokens.bgSunk,
      borderWidth: 1,
      borderColor: tokens.hairline,
      flexShrink: 0,
      justifyContent: "center",
    },
    filterChipActive: {
      backgroundColor: tokens.bgElev,
      borderColor: tokens.hairlineStrong,
    },
    filterChipText: {
      fontSize: 12,
      fontWeight: "600",
      color: tokens.fg3,
    },
    filterChipTextActive: {
      color: tokens.primary,
    },
    skeletonContainer: {
      gap: 12,
    },
    skeletonCard: {
      backgroundColor: tokens.bgSunk,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: tokens.hairline,
      padding: 20,
      gap: 10,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 10,
      elevation: 3,
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
    emptyState: {
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
      paddingVertical: 56,
      borderRadius: radius.xl,
      backgroundColor: tokens.bgSunk,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    emptyIconContainer: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: tokens.bgSunk,
      borderWidth: 1,
      borderColor: tokens.hairline,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: tokens.fg2,
      marginBottom: 4,
    },
    emptySubtitle: {
      fontSize: 14,
      color: tokens.fg3,
      textAlign: "center",
      marginBottom: 24,
    },
  });
}
