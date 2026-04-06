import { View, Text, StyleSheet } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { ConflictWarning as ConflictWarningType } from "@orbit/shared/types/chat";
import { radius } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severityColors(
  severity: ConflictWarningType["severity"],
  colors: ReturnType<typeof useAppTheme>["colors"],
): {
  text: string;
  bg: string;
  border: string;
} {
  switch (severity) {
    case "HIGH":
      return {
        text: colors.red400,
        bg: colors.red500_10,
        border: colors.red500_30,
      };
    case "MEDIUM":
      return {
        text: colors.amber400,
        bg: "rgba(245,158,11,0.10)",
        border: "rgba(245,158,11,0.30)",
      };
    case "LOW":
      return {
        text: colors.blue400,
        bg: "rgba(59,130,246,0.10)",
        border: "rgba(59,130,246,0.30)",
      };
    default:
      return {
        text: colors.textSecondary,
        bg: colors.surface,
        border: colors.border,
      };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ConflictWarningProps {
  warning: ConflictWarningType;
}

export function ConflictWarning({ warning }: Readonly<ConflictWarningProps>) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const sColors = severityColors(warning.severity, colors);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: sColors.bg,
          borderColor: sColors.border,
        },
      ]}
    >
      <View style={styles.titleRow}>
        <AlertTriangle size={14} color={sColors.text} />
        <Text style={[styles.title, { color: sColors.text }]}>
          {t("chat.conflict.title")}
        </Text>
      </View>

      {warning.conflictingHabits.length > 0 && (
        <View style={styles.habitsList}>
          {warning.conflictingHabits.map((habit) => (
            <Text
              key={habit.habitId}
              style={[styles.habitText, { color: sColors.text }]}
            >
              <Text style={styles.habitName}>{habit.habitTitle}</Text>
              {": "}
              {habit.conflictDescription}
            </Text>
          ))}
        </View>
      )}

      {warning.recommendation && (
        <Text style={[styles.recommendation, { color: sColors.text }]}>
          {warning.recommendation}
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
  },
  habitsList: {
    gap: 2,
    marginBottom: 6,
  },
  habitText: {
    fontSize: 12,
    lineHeight: 16,
  },
  habitName: {
    fontWeight: "600",
  },
  recommendation: {
    fontSize: 11,
    opacity: 0.8,
  },
});
