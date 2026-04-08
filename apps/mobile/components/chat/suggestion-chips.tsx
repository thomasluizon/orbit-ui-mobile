import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "@/lib/use-app-theme";

interface SuggestionChipsProps {
  onSelect: (suggestion: string) => void;
}

export function SuggestionChips({ onSelect }: Readonly<SuggestionChipsProps>) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const styles = useMemo(() => createStyles(colors), [colors]);

  const suggestions = useMemo(
    () => [
      t("chat.suggestion.meditated"),
      t("chat.suggestion.exercise"),
      t("chat.suggestion.groceries"),
    ],
    [t],
  );

  return (
    <View style={styles.container}>
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

function createStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
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
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.borderMuted,
    },
    chipText: {
      fontSize: 12,
      fontWeight: "500",
      color: colors.textPrimary,
    },
  });
}
