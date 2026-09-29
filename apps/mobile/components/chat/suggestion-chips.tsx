import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInLeft, ReduceMotion } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { useAstraSuggestionHabits } from "@/hooks/use-astra-suggestions";
import { createTokensV2 } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";

type AppTokens = ReturnType<typeof createTokensV2>;

interface SuggestionChipsProps {
  onSelect: (suggestion: string) => void;
  contextualAction?: { label: string; onSelect: () => void };
}

/** The four drawn openers for an empty thread. Each one asks for a different kind
 *  of answer, and the two that name a habit drop out when no habit qualifies. */
export function SuggestionChips({ onSelect, contextualAction }: Readonly<SuggestionChipsProps>) {
  const { t } = useTranslation();
  const { currentScheme, currentTheme } = useAppTheme();
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );

  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { logHabitTitle, splitHabitTitle } = useAstraSuggestionHabits();

  const suggestions = useMemo(
    () => [
      ...(logHabitTitle === null ? [] : [t("chat.suggestion.logHabit", { habit: logHabitTitle })]),
      t("chat.suggestion.week"),
      ...(splitHabitTitle === null ? [] : [t("chat.suggestion.splitHabit", { habit: splitHabitTitle })]),
      t("chat.suggestion.goals"),
    ],
    [logHabitTitle, splitHabitTitle, t],
  );

  return (
    <View style={styles.container}>
      {contextualAction ? (
        <Pressable
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
          onPress={contextualAction.onSelect}
          accessibilityRole="button"
          accessibilityLabel={contextualAction.label}
        >
          <Text style={styles.chipText}>{contextualAction.label}</Text>
        </Pressable>
      ) : null}
      {suggestions.map((suggestion, index) => (
        <Animated.View
          key={suggestion}
          entering={FadeInLeft.duration(280)
            .delay(index * 60)
            .reduceMotion(ReduceMotion.System)}
        >
          {/* eslint-disable-next-line local/max-button-words -- granted canvas suggestions, Orbit Astra Conversation.dc.html:177 (D42) */}
          <Pressable
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            onPress={() => onSelect(suggestion)}
            accessibilityRole="button"
            accessibilityLabel={suggestion}
          >
            <Text style={styles.chipText}>{suggestion}</Text>
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: 8,
    },
    chip: {
      height: 44,
      justifyContent: "center",
      paddingHorizontal: 16,
      borderRadius: 999,
      backgroundColor: tokens.bgWell,
      boxShadow: `inset 0 0 0 1px ${tokens.hairline}`,
    },
    chipPressed: {
      backgroundColor: tokens.bgHover,
      transform: [{ scale: 0.96 }],
    },
    chipText: {
      fontFamily: 'Geist_500Medium',
      fontSize: 14,
      color: tokens.fg2,
    },
  });
}
