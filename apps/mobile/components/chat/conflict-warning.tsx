import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { ConflictWarning as ConflictWarningType } from "@orbit/shared/types/chat";
import { createTokensV2, tintFromPrimary } from '@/lib/theme';
import { useAppTheme } from "@/lib/use-app-theme";

type AppTokens = ReturnType<typeof createTokensV2>

function severityColors(
  severity: ConflictWarningType["severity"],
  tokens: AppTokens,
): {
  text: string;
  bg: string;
  border: string;
} {
  switch (severity) {
    case "HIGH":
      return {
        text: tokens.statusBadText,
        bg: `${tokens.statusBad}1A`,
        border: `${tokens.statusBad}4D`,
      };
    case "MEDIUM":
      return {
        text: tokens.statusOverdueText,
        bg: `${tokens.statusOverdue}1A`,
        border: `${tokens.statusOverdue}4D`,
      };
    case "LOW":
      return {
        text: tokens.primary,
        bg: tintFromPrimary(tokens, 0.1),
        border: tintFromPrimary(tokens, 0.3),
      };
    default:
      return {
        text: tokens.fg2,
        bg: tokens.bgElev,
        border: tokens.hairline,
      };
  }
}

interface ConflictWarningProps {
  warning: ConflictWarningType;
}

export function ConflictWarning({ warning }: Readonly<ConflictWarningProps>) {
  const { t } = useTranslation();
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const sColors = severityColors(warning.severity, tokens);

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

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
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
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 12,
  },
  habitsList: {
    gap: 2,
    marginBottom: 6,
  },
  habitText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    lineHeight: 16,
  },
  habitName: {
    fontFamily: 'Rubik_500Medium',
  },
  recommendation: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 11,
    opacity: 0.8,
  },
});
