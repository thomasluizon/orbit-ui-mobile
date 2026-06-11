import { useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInLeft, ReduceMotion } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { createTokensV2 } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";
import { useTourTarget } from "@/hooks/use-tour-target";

type AppTokens = ReturnType<typeof createTokensV2>;

interface SuggestionChipsProps {
  onSelect: (suggestion: string) => void;
}

export function SuggestionChips({ onSelect }: Readonly<SuggestionChipsProps>) {
  const { t } = useTranslation();
  const { currentScheme, currentTheme } = useAppTheme();
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );

  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const suggestionsRef = useRef<View>(null);
  useTourTarget("tour-chat-suggestions", suggestionsRef);

  const suggestions = useMemo(
    () => [
      t("chat.suggestion.meditated"),
      t("chat.suggestion.exercise"),
      t("chat.suggestion.groceries"),
    ],
    [t],
  );

  return (
    <View ref={suggestionsRef} style={styles.container}>
      {suggestions.map((suggestion, index) => (
        <Animated.View
          key={suggestion}
          entering={FadeInLeft.duration(280)
            .delay(index * 60)
            .reduceMotion(ReduceMotion.System)}
        >
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
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 16,
      borderRadius: 999,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    chipPressed: {
      backgroundColor: tokens.bgElev2,
      transform: [{ scale: 0.96 }],
    },
    chipText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg2,
    },
  });
}
