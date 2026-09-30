import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { AstraSuggestion } from "@orbit/shared/utils";
import { MotionPressable } from "@/components/ui/motion-pressable";
import { createTokensV2 } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";

type AppTokens = ReturnType<typeof createTokensV2>;

interface SuggestionChipsProps {
  suggestions: readonly AstraSuggestion[];
  onSelect: (suggestion: string) => void;
  contextualAction?: { label: string; onSelect: () => void };
}

/** The drawn openers for an empty thread, in the order given, each kept to one line.
 *  A press sends the label the person read. */
export function SuggestionChips({ suggestions, onSelect, contextualAction }: Readonly<SuggestionChipsProps>) {
  const { t } = useTranslation();
  const { currentScheme, currentTheme } = useAppTheme();
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const renderSuggestion = (key: string, label: string, onPress: () => void) => (
    <MotionPressable
      key={key}
      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.chipText} numberOfLines={1}>{label}</Text>
    </MotionPressable>
  );

  return (
    <View style={styles.container}>
      {contextualAction
        ? renderSuggestion("contextual", contextualAction.label, contextualAction.onSelect)
        : null}
      {suggestions.map((suggestion) => {
        const label = t(suggestion.key, suggestion.params);
        return renderSuggestion(suggestion.id, label, () => onSelect(label));
      })}
    </View>
  );
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    container: {
      maxWidth: "100%",
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: 8,
    },
    chip: {
      minHeight: 44,
      maxWidth: "100%",
      justifyContent: "center",
      paddingHorizontal: 16,
      borderRadius: 999,
      overflow: "hidden",
      backgroundColor: tokens.bgWell,
      boxShadow: `inset 0 0 0 1px ${tokens.hairline}`,
    },
    chipPressed: {
      borderRadius: 999,
      overflow: "hidden",
      backgroundColor: tokens.bgHover,
    },
    chipText: {
      fontFamily: 'Geist_500Medium',
      fontSize: 14,
      includeFontPadding: false,
      color: tokens.fg2,
    },
  });
}
