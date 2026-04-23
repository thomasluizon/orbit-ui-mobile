import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Sparkles } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useProfile } from "@/hooks/use-profile";
import { useSummary } from "@/hooks/use-habits";
import { ProBadge } from "@/components/ui/pro-badge";
import { gradients, radius, shadows } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";

interface HabitSummaryCardProps {
  date: string;
}

export function HabitSummaryCard({ date }: Readonly<HabitSummaryCardProps>) {
  const { t, i18n } = useTranslation();
  const { profile } = useProfile();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const hasProAccess = profile?.hasProAccess ?? false;
  const aiSummaryEnabled = profile?.aiSummaryEnabled ?? false;

  // DB is the source of truth for language. Fall back to the UI locale only
  // until the profile hydrates, so pt-BR users never see an English summary.
  const locale = profile?.language ?? i18n.language;

  const { summary, isLoading, error, refetch } = useSummary({
    date,
    locale,
    hasProAccess,
    aiSummaryEnabled,
  });

  const showCard = useMemo(
    () => hasProAccess && aiSummaryEnabled,
    [aiSummaryEnabled, hasProAccess],
  );

  if (!showCard) return null;

  if (isLoading) {
    return (
      <View style={[styles.card, styles.loadingCard]}>
        <LinearGradient
          colors={gradients.surfaceSheen}
          locations={gradients.surfaceSheenLocations}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.25, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <View style={styles.insetHighlight} pointerEvents="none" />
        <View style={styles.header}>
          <Sparkles size={18} color={colors.primary} />
          <Text style={styles.title}>{t("summary.title")}</Text>
          <ProBadge />
        </View>
        <Text style={styles.loadingText}>{t("summary.loading")}</Text>
        <View style={styles.loadingSkeleton}>
          <View style={styles.loadingLineFull} />
          <View style={styles.loadingLineShort} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorCard}>
        <Text style={styles.errorText}>{t("summary.error")}</Text>
        <TouchableOpacity onPress={() => void refetch()} activeOpacity={0.7}>
          <Text style={styles.retryText}>{t("summary.retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!summary) return null;

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={gradients.surfaceSheen}
        locations={gradients.surfaceSheenLocations}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.25, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <View style={styles.insetHighlight} pointerEvents="none" />
      <View style={styles.header}>
        <Sparkles size={18} color={colors.primary} />
        <Text style={styles.title}>{t("summary.title")}</Text>
        <ProBadge />
      </View>
      <Text style={styles.summary}>{summary}</Text>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius["2xl"],
      borderWidth: 1,
      borderColor: colors.borderMuted,
      padding: 20,
      gap: 14,
      overflow: "hidden",
      ...shadows.cardParent,
      elevation: 6,
    },
    loadingCard: {
      borderColor: colors.primaryTintBorder,
    },
    insetHighlight: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: "rgba(255,255,255,0.06)",
    },
    errorCard: {
      backgroundColor: colors.surface,
      borderRadius: radius["2xl"],
      borderWidth: 1,
      borderColor: colors.borderMuted,
      padding: 20,
      gap: 10,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    title: {
      fontSize: 15,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    loadingText: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textSecondary,
    },
    loadingSkeleton: {
      gap: 10,
    },
    loadingLineFull: {
      height: 14,
      width: "100%",
      borderRadius: radius.full,
      backgroundColor: colors.surfaceElevated,
    },
    loadingLineShort: {
      height: 14,
      width: "72%",
      borderRadius: radius.full,
      backgroundColor: colors.surfaceElevated,
    },
    errorText: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textSecondary,
    },
    retryText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.primary,
    },
    summary: {
      fontSize: 15,
      lineHeight: 29,
      color: colors.textSecondary,
    },
  });
}
