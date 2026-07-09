import { type ReactNode } from "react";
import { View, Text } from "react-native";
import { useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { MAX_HABIT_TITLE_LENGTH } from "@orbit/shared/validation";
import { coalesceFormText } from "@orbit/shared/utils";
import { BufferedSheetInput } from "./buffered-sheet-input";
import type { HabitFormControl, HabitFormStyles } from "./types";

interface TitleSectionProps {
  control: HabitFormControl;
  error: string | undefined;
  registerFlush: (flush: () => void) => () => void;
  onCommit: (value: string) => void;
  onDraftChange?: (value: string) => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  styles: HabitFormStyles;
}

export function TitleSection({
  control,
  error,
  registerFlush,
  onCommit,
  onDraftChange,
  leading,
  trailing,
  styles,
}: Readonly<TitleSectionProps>) {
  const { t } = useTranslation();
  const watchedTitle = coalesceFormText(useWatch({ control, name: "title" }));

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{t("habits.form.title")}</Text>
      <View style={styles.titleRow}>
        {leading}
        <View style={styles.titleInputWrap}>
          <BufferedSheetInput
            value={watchedTitle}
            registerFlush={registerFlush}
            maxLength={MAX_HABIT_TITLE_LENGTH}
            placeholder={t("habits.form.titlePlaceholder")}
            onCommit={onCommit}
            onDraftChange={onDraftChange}
            accessibilityLabel={t("habits.form.title")}
            style={trailing ? styles.titleInputWithTrailing : undefined}
          />
          {trailing ? <View style={styles.titleTrailing}>{trailing}</View> : null}
        </View>
      </View>
      {error && (
        <Text style={styles.fieldError} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}
