import { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated, { FadeInLeft, ReduceMotion } from "react-native-reanimated";
import { CheckCircle, XCircle, Info } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { ActionResult } from "@orbit/shared/types/chat";
import { ConflictWarning } from "./conflict-warning";
import { createTokensV2, radius } from '@/lib/theme';
import { useAppTheme } from "@/lib/use-app-theme"

type AppTokens = ReturnType<typeof createTokensV2>;

const ACTION_LABELS: Record<string, string> = {
  log_habit: "chat.action.logged",
  create_habit: "chat.action.created",
  update_habit: "chat.action.updated",
  delete_habit: "chat.action.deleted",
  skip_habit: "chat.action.skipped",
  create_sub_habit: "chat.action.createdSubHabit",
  suggest_breakdown: "chat.action.breakdown",
  assign_tags: "chat.action.tagsUpdated",
  duplicate_habit: "chat.action.duplicated",
  move_habit: "chat.action.moved",
  LogHabit: "chat.action.logged",
  CreateHabit: "chat.action.created",
  UpdateHabit: "chat.action.updated",
  DeleteHabit: "chat.action.deleted",
  SkipHabit: "chat.action.skipped",
  CreateSubHabit: "chat.action.createdSubHabit",
  SuggestBreakdown: "chat.action.breakdown",
  AssignTags: "chat.action.tagsUpdated",
  BulkLogHabits: "chat.action.logged",
  BulkSkipHabits: "chat.action.skipped",
  CreateGoal: "chat.action.createdGoal",
  UpdateGoal: "chat.action.updatedGoal",
  DeleteGoal: "chat.action.deletedGoal",
  UpdateGoalProgress: "chat.action.updatedGoalProgress",
  UpdateGoalStatus: "chat.action.updatedGoalStatus",
  LinkHabitsToGoal: "chat.action.linkedGoalHabits",
  create_tag: "chat.action.createdTag",
  update_tag: "chat.action.updatedTag",
  delete_tag: "chat.action.deletedTag",
  reorder_goals: "chat.action.reorderedGoals",
  reorder_habits: "chat.action.reorderedHabits",
  CreateTag: "chat.action.createdTag",
  UpdateTag: "chat.action.updatedTag",
  DeleteTag: "chat.action.deletedTag",
  ReorderGoals: "chat.action.reorderedGoals",
  ReorderHabits: "chat.action.reorderedHabits",
};

const NON_NAVIGABLE_ACTION_TYPES = new Set([
  "delete_habit",
  "DeleteHabit",
  "DeleteGoal",
  "delete_sub_habit",
  "DeleteSubHabit",
  "suggest_breakdown",
  "SuggestBreakdown",
  "create_tag",
  "CreateTag",
  "update_tag",
  "UpdateTag",
  "delete_tag",
  "DeleteTag",
]);

type ChipStyleEntry = {
  text: string;
  bg: string;
  border: string;
  Icon: typeof CheckCircle;
};

interface ActionChipsProps {
  actions: ActionResult[];
  onChipClick?: (entityId: string, actionType: string) => void;
}

function isNavigable(action: ActionResult, hasHandler: boolean): boolean {
  return (
    hasHandler &&
    action.status === "Success" &&
    !!action.entityId &&
    !NON_NAVIGABLE_ACTION_TYPES.has(action.type)
  );
}

export function ActionChips({ actions, onChipClick }: Readonly<ActionChipsProps>) {
  const { t } = useTranslation();
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  function actionLabel(action: ActionResult): string {
    const name = action.entityName || t("chat.unknownEntity");
    const labelKey = ACTION_LABELS[action.type];
    if (labelKey) return t(labelKey, { name });
    return `${action.type.replaceAll("_", " ")}: ${name}`;
  }

  return (
    <View style={styles.container}>
      {actions.map((action, index) => {
        if (action.status === "Suggestion") return null;
        const style = chipStyle(action, tokens);
        const IconComponent = style.Icon;
        const navigable = isNavigable(action, !!onChipClick);
        const label = actionLabel(action);

        return (
          <Animated.View
            key={`${action.type}-${action.entityId || index}`}
            entering={FadeInLeft.duration(280)
              .delay(index * 80)
              .reduceMotion(ReduceMotion.System)}
          >
            {navigable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("chat.action.openEntity", { name: label })}
                onPress={() => onChipClick!(action.entityId!, action.type)}
                hitSlop={{ top: 4, bottom: 4 }}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: style.bg,
                    borderColor: style.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <IconComponent size={16} color={style.text} strokeWidth={1.8} />
                <Text style={[styles.chipText, { color: style.text }]}>{label}</Text>
              </Pressable>
            ) : (
              <View
                style={[
                  styles.chip,
                  {
                    backgroundColor: style.bg,
                    borderColor: style.border,
                  },
                ]}
              >
                <IconComponent size={16} color={style.text} strokeWidth={1.8} />
                <Text style={[styles.chipText, { color: style.text }]}>{label}</Text>
              </View>
            )}

            {action.status === "Failed" && action.error && (
              <Text style={styles.errorText}>{action.error}</Text>
            )}

            {action.conflictWarning?.hasConflict && (
              <ConflictWarning warning={action.conflictWarning} />
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

function chipStyle(
  action: ActionResult,
  tokens: AppTokens,
): ChipStyleEntry {
  switch (action.status) {
    case "Success":
      return {
        text: tokens.statusDone,
        bg: tokens.bgElev,
        border: tokens.hairline,
        Icon: CheckCircle,
      };
    case "Failed":
      return {
        text: tokens.statusBadText,
        bg: `${tokens.statusBad}1A`,
        border: `${tokens.statusBad}4D`,
        Icon: XCircle,
      };
    default:
      return {
        text: tokens.fg2,
        bg: tokens.bgElev,
        border: tokens.hairline,
        Icon: Info,
      };
  }
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    container: {
      gap: 8,
      marginTop: 8,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 36,
      paddingHorizontal: 14,
      borderRadius: radius.full,
      borderWidth: 1,
      alignSelf: "flex-start",
    },
    chipText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
    },
    errorText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
      color: tokens.statusBadText,
      marginTop: 4,
      paddingLeft: 4,
    },
  });
}
