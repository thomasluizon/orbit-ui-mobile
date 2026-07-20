import { useMemo } from "react";
import { Text, Pressable } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
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

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: withTiming(expanded ? "180deg" : "0deg", {
          duration: 220,
          reduceMotion: ReduceMotion.System,
        }),
      },
    ],
  }), [expanded]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.moreOptionsButton,
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onToggle}
    >
      <Animated.View style={chevronStyle}>
        <ChevronDown size={16} color={tokens.fg2} strokeWidth={1.8} />
      </Animated.View>
      <Text style={styles.moreOptionsLabel}>
        {t("habits.form.moreOptions")}
      </Text>
      {advancedFieldCount > 0 && (
        <Text style={styles.moreOptionsBadge}>
          {t("habits.form.moreOptionsCount", { count: advancedFieldCount })}
        </Text>
      )}
    </Pressable>
  );
}
