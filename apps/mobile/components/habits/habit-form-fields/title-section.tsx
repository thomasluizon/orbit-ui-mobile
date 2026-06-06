import { View, Text } from "react-native";
import { useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { BufferedSheetInput } from "./buffered-sheet-input";
import type { AppTokens } from "./styles";
import type { HabitFormControl, HabitFormStyles } from "./types";

interface TitleSectionProps {
  control: HabitFormControl;
  error: string | undefined;
  registerFlush: (flush: () => void) => () => void;
  onCommit: (value: string) => void;
  onDraftChange?: (value: string) => void;
  styles: HabitFormStyles;
  tokens: AppTokens;
}

export function TitleSection({
  control,
  error,
  registerFlush,
  onCommit,
  onDraftChange,
  styles,
  tokens,
}: Readonly<TitleSectionProps>) {
  const { t } = useTranslation();
  const watchedTitle = useWatch({ control, name: "title" }) ?? "";

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{t("habits.form.title")}</Text>
      <BufferedSheetInput
        value={watchedTitle}
        registerFlush={registerFlush}
        maxLength={200}
        placeholder={t("habits.form.titlePlaceholder")}
        placeholderTextColor={tokens.fg3}
        style={styles.input}
        onCommit={onCommit}
        onDraftChange={onDraftChange}
        accessibilityLabel={t("habits.form.title")}
      />
      {error && (
        <Text style={styles.fieldError} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}
