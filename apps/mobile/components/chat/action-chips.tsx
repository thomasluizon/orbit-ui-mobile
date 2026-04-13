import { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { CheckCircle, XCircle, Info } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { ActionResult } from "@orbit/shared/types/chat";
import { ConflictWarning } from "./conflict-warning";
import { radius } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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
  // Legacy names (backward compat)
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
};

const NON_NAVIGABLE_ACTION_TYPES = new Set([
  "delete_habit",
  "DeleteHabit",
  "DeleteGoal",
  "delete_sub_habit",
  "DeleteSubHabit",
  "suggest_breakdown",
  "SuggestBreakdown",
]);

type ChipStyleEntry = {
  text: string;
  bg: string;
  border: string;
  Icon: typeof CheckCircle;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  function actionLabel(action: ActionResult): string {
    const name = action.entityName || t("chat.unknownEntity");
    const labelKey = ACTION_LABELS[action.type];
    if (labelKey) return t(labelKey, { name });
    // Fallback: humanize the tool name
    return `${action.type.replaceAll("_", " ")}: ${name}`;
  }

  return (
    <View style={styles.container}>
      {actions.map((action, index) => {
        if (action.status === "Suggestion") return null;
        const style = chipStyle(action, colors);
        const IconComponent = style.Icon;
        const navigable = isNavigable(action, !!onChipClick);
        const label = actionLabel(action);

        return (
          <View key={`${action.type}-${action.entityId || index}`}>
            {navigable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("chat.action.openEntity", { name: label })}
                onPress={() => onChipClick!(action.entityId!, action.type)}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: style.bg,
                    borderColor: style.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <IconComponent size={10} color={style.text} />
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
                <IconComponent size={10} color={style.text} />
                <Text style={[styles.chipText, { color: style.text }]}>{label}</Text>
              </View>
            )}

            {action.status === "Failed" && action.error && (
              <Text style={styles.errorText}>{action.error}</Text>
            )}

            {action.conflictWarning?.hasConflict && (
              <ConflictWarning warning={action.conflictWarning} />
            )}
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function chipStyle(
  action: ActionResult,
  colors: ReturnType<typeof useAppTheme>["colors"],
): ChipStyleEntry {
  switch (action.status) {
    case "Success":
      return {
        text: colors.emerald400,
        bg: colors.emerald500_10,
        border: colors.emerald500_30,
        Icon: CheckCircle,
      };
    case "Failed":
      return {
        text: colors.red400,
        bg: colors.red500_10,
        border: colors.red500_30,
        Icon: XCircle,
      };
    default:
      return {
        text: colors.blue400,
        bg: "rgba(59,130,246,0.10)",
        border: "rgba(59,130,246,0.30)",
        Icon: Info,
      };
  }
}

function createStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    container: {
      gap: 8,
      marginTop: 8,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: radius.full,
      borderWidth: 1,
      alignSelf: "flex-start",
    },
    chipText: {
      fontSize: 10,
      fontWeight: "600",
    },
    errorText: {
      fontSize: 12,
      color: colors.red400,
      marginTop: 4,
      paddingLeft: 4,
    },
  });
}
