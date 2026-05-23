import { useMemo, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
      {suggestions.map((suggestion) => (
        <TouchableOpacity
          key={suggestion}
          style={styles.chip}
          onPress={() => onSelect(suggestion)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={suggestion}
        >
          <Text style={styles.chipText}>{suggestion}</Text>
        </TouchableOpacity>
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
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 9999,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    chipText: {
      fontSize: 12,
      fontWeight: "500",
      color: tokens.fg1,
    },
  });
}
