import { useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { AppTokens } from "./styles";
import type { HabitFormControl, HabitFormStyles } from "./types";

interface MoreOptionsToggleProps {
  control: HabitFormControl;
  selectedGoalIds: string[];
  expanded: boolean;
  onToggle: () => void;
  styles: HabitFormStyles;
  tokens: AppTokens;
}

export function MoreOptionsToggle({
  control,
  selectedGoalIds,
  expanded,
  onToggle,
  styles,
  tokens,
}: Readonly<MoreOptionsToggleProps>) {
  const { t } = useTranslation();
  const description = useWatch({ control, name: "description" });
  const checklistItems = useWatch({ control, name: "checklistItems" });
  const endDate = useWatch({ control, name: "endDate" });
  const reminderEnabled = useWatch({ control, name: "reminderEnabled" });
  const isBadHabit = useWatch({ control, name: "isBadHabit" });

  const advancedFieldCount = useMemo(() => {
    return [
      (description ?? "").length > 0,
      (checklistItems ?? []).length > 0,
      (endDate ?? "").length > 0,
      reminderEnabled ?? false,
      selectedGoalIds.length > 0,
      isBadHabit ?? false,
    ].filter(Boolean).length;
  }, [
    description,
    checklistItems,
    endDate,
    reminderEnabled,
    selectedGoalIds,
    isBadHabit,
  ]);

  return (
    <View style={styles.moreOptionsDivider}>
      <TouchableOpacity
        style={styles.moreOptionsButton}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={expanded ? styles.chevronRotated : undefined}>
          <ChevronDown size={16} color={tokens.fg2} />
        </View>
        <Text style={styles.moreOptionsLabel}>
          {t("habits.form.moreOptions")}
        </Text>
        {advancedFieldCount > 0 && (
          <Text style={styles.moreOptionsBadge}>
            {t("habits.form.moreOptionsCount", { count: advancedFieldCount })}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
