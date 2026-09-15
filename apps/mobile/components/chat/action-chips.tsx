import { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated, { FadeInLeft, ReduceMotion } from "react-native-reanimated";
import { CheckCircle, XCircle, Info } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { ActionResult } from "@orbit/shared/types/chat";
import { resolveActionLabelKey } from "@orbit/shared/chat";
import { ConflictWarning } from "./conflict-warning";
import { createTokensV2, radius } from '@/lib/theme';
import { useAppTheme } from "@/lib/use-app-theme"

type AppTokens = ReturnType<typeof createTokensV2>;

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
    const name = action.entityName || (action.status === "Failed" ? undefined : t("chat.unknownEntity"));
    const labelKey = resolveActionLabelKey(action.type, action.status, action.entityName);
    if (labelKey) return name ? t(labelKey, { name }) : t(labelKey);
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
                  },
                  pressed && styles.chipPressed,
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
    chipPressed: {
      transform: [{ scale: 0.96 }],
      backgroundColor: tokens.bgElev2,
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
