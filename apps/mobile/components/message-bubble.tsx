import { useState, useMemo } from "react";
import { View, Text, Image, StyleSheet, Pressable } from "react-native";
import Animated, { FadeInUp, ReduceMotion } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Sparkles, ArrowUpRight } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "@orbit/shared/types/chat";
import type { AgentExecuteOperationResponse } from "@orbit/shared/types";
import { getRelatedSurfaces, stripHabitListDirective } from "@orbit/shared/chat";
import { resolveUpgradeEntitlementFromPolicyDenial } from "@orbit/shared/utils";
import { ActionChips } from "@/components/chat/action-chips";
import { BreakdownSuggestion } from "@/components/chat/breakdown-suggestion";
import { ClarificationCard } from "@/components/chat/clarification-card";
import { HabitListCard } from "@/components/chat/habit-list-card";
import { PendingOperationCard } from "@/components/chat/pending-operation-card";
import { Markdown } from "@/components/ui/markdown";
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from "@/lib/use-app-theme";

interface MessageBubbleProps {
  message: ChatMessage;
  onBreakdownConfirmed?: () => void;
  onActionChipClick?: (entityId: string, actionType: string) => void;
  onPendingOperationConfirmExecute?: (
    pendingOperationId: string,
  ) => Promise<{ ok: boolean; error?: string; response?: AgentExecuteOperationResponse }>;
  onPendingOperationPrepareStepUp?: (
    pendingOperationId: string,
  ) => Promise<{ ok: boolean; error?: string; challengeId?: string; confirmationToken?: string }>;
  onPendingOperationVerifyStepUp?: (
    pendingOperationId: string,
    challengeId: string,
    code: string,
    confirmationToken: string,
  ) => Promise<{ ok: boolean; error?: string; response?: AgentExecuteOperationResponse }>;
  onUpgradeClick?: () => void;
}

export function MessageBubble({
  message,
  onBreakdownConfirmed,
  onActionChipClick,
  onPendingOperationConfirmExecute,
  onPendingOperationPrepareStepUp,
  onPendingOperationVerifyStepUp,
  onUpgradeClick,
}: Readonly<MessageBubbleProps>) {
  const { t } = useTranslation();
  const router = useRouter();
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [dismissedBreakdowns, setDismissedBreakdowns] = useState<Set<string>>(
    new Set(),
  );

  const isUser = message.role === "user";

  const suggestionActions = useMemo(
    () =>
      message.actions?.filter(
        (a) => a.status === "Suggestion" && a.suggestedSubHabits?.length,
      ) ?? [],
    [message.actions],
  );

  const clarificationActions = useMemo(
    () =>
      (message.actions ?? []).filter(
        (a): a is typeof a & { clarificationRequest: NonNullable<typeof a.clarificationRequest> } =>
          a.status === "NeedsClarification" && a.clarificationRequest != null,
      ),
    [message.actions],
  );

  const hasUpgradeDenial = useMemo(
    () =>
      (message.policyDenials ?? []).some(
        (denial) => resolveUpgradeEntitlementFromPolicyDenial(denial).shouldUpgrade,
      ),
    [message.policyDenials],
  );

  const nonSuggestionActions = useMemo(
    () =>
      message.actions?.filter(
        (a) =>
          a.status !== "Suggestion" &&
          a.status !== "NeedsClarification" &&
          !(hasUpgradeDenial && a.status === "Failed"),
      ) ?? [],
    [message.actions, hasUpgradeDenial],
  );
  const relatedSurfaces = useMemo(
    () => getRelatedSurfaces(message.relatedSurfaces),
    [message.relatedSurfaces],
  );

  function dismissBreakdown(key: string) {
    setDismissedBreakdowns((prev) => new Set([...prev, key]));
  }

  return (
    <Animated.View
      entering={FadeInUp.duration(220).reduceMotion(ReduceMotion.System)}
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.aiContainer,
      ]}
      accessibilityLabel={isUser ? t("chat.senderYou") : t("chat.senderOrbit")}
    >
      {!isUser && (
        <View style={styles.aiAvatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Sparkles size={16} color={tokens.primarySoft} strokeWidth={1.8} />
        </View>
      )}

      <View
        style={isUser ? styles.bubbleColumnUser : styles.bubbleColumnAI}
      >
        <View
          style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}
        >
          {message.imageUrl && (
            <Image
              source={{ uri: message.imageUrl }}
              accessibilityLabel={t("chat.attachmentPreview")}
              style={styles.imageAttachment}
              resizeMode="cover"
              resizeMethod="resize"
            />
          )}

          <Markdown tone={isUser ? "onPrimary" : "default"}>
            {stripHabitListDirective(message.content ?? "")}
          </Markdown>
        </View>

        {!isUser && message.habitList ? (
          <HabitListCard habitList={message.habitList} />
        ) : null}

        {!isUser && relatedSurfaces.length > 0 ? (
          <View style={styles.relatedContainer}>
            <Text style={styles.relatedTitle}>{t("chat.related.title")}</Text>
            <View style={styles.relatedChips}>
              {relatedSurfaces.map((surface) => (
                <Pressable
                  key={surface.id}
                  accessibilityRole="button"
                  accessibilityLabel={t(surface.labelKey)}
                  onPress={() => router.push(surface.mobileRoute)}
                  style={({ pressed }) => [
                    styles.relatedChip,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={styles.relatedChipText}>{t(surface.labelKey)}</Text>
                  <ArrowUpRight size={16} color={tokens.fg3} strokeWidth={1.8} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {!isUser && nonSuggestionActions.length > 0 && (
          <ActionChips actions={nonSuggestionActions} onChipClick={onActionChipClick} />
        )}

        {!isUser && suggestionActions.length > 0 && (
          <View style={styles.breakdownContainer}>
            {suggestionActions.map((action) => {
              const actionKey =
                action.entityId ?? action.entityName ?? "suggestion";
              if (dismissedBreakdowns.has(actionKey)) return null;
              return (
                <BreakdownSuggestion
                  key={actionKey}
                  parentName={action.entityName || "Habit"}
                  subHabits={action.suggestedSubHabits ?? []}
                  onConfirmed={() => onBreakdownConfirmed?.()}
                  onCancelled={() => dismissBreakdown(actionKey)}
                />
              );
            })}
          </View>
        )}

        {!isUser && clarificationActions.length > 0 && (
          <View style={styles.breakdownContainer}>
            {clarificationActions.map((action) => (
              <ClarificationCard
                key={action.clarificationRequest.operationId}
                clarificationRequest={action.clarificationRequest}
                entityName={action.entityName}
              />
            ))}
          </View>
        )}

        {!isUser &&
          message.pendingOperations &&
          message.pendingOperations.length > 0 &&
          onPendingOperationConfirmExecute &&
          onPendingOperationPrepareStepUp &&
          onPendingOperationVerifyStepUp && (
            <View style={styles.operationStack}>
              {message.pendingOperations.map((pendingOperation) => (
                <PendingOperationCard
                  key={pendingOperation.id}
                  pendingOperation={pendingOperation}
                  onConfirmExecute={onPendingOperationConfirmExecute}
                  onPrepareStepUp={onPendingOperationPrepareStepUp}
                  onVerifyStepUp={onPendingOperationVerifyStepUp}
                />
              ))}
            </View>
          )}

        {!isUser && message.policyDenials && message.policyDenials.length > 0 && (
          <View style={styles.operationStack}>
            {message.policyDenials.map((denial) => {
              const upgradeResolution = resolveUpgradeEntitlementFromPolicyDenial(
                denial,
              );

              return (
                <View
                  key={`${denial.operationId}-${denial.pendingOperationId ?? denial.reason}`}
                  style={styles.denialCard}
                >
                  <Text style={styles.denialTitle}>
                    {upgradeResolution.shouldUpgrade
                      ? t("chat.proGate.title")
                      : denial.sourceName}
                  </Text>
                  <Text style={styles.denialReason}>
                    {upgradeResolution.shouldUpgrade
                      ? t("chat.proGate.body")
                      : denial.reason}
                  </Text>
                  {upgradeResolution.shouldUpgrade && onUpgradeClick ? (
                    <Text
                      style={styles.denialUpgrade}
                      onPress={onUpgradeClick}
                      accessibilityRole="button"
                    >
                      {t("upgrade.subscribe")}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

type AppTokens = ReturnType<typeof createTokensV2>;

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      marginBottom: 16,
      paddingHorizontal: 16,
      gap: 10,
    },
    userContainer: {
      justifyContent: "flex-end",
    },
    aiContainer: {
      justifyContent: "flex-start",
    },

    aiAvatar: {
      width: 30,
      height: 30,
      borderRadius: 999,
      backgroundColor: tintFromPrimary(tokens, 0.18),
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "flex-start",
    },

    bubbleColumnUser: {
      maxWidth: "82%",
      flexDirection: "column",
      alignItems: "flex-end",
    },
    bubbleColumnAI: {
      flex: 1,
      minWidth: 0,
      flexDirection: "column",
      alignItems: "flex-start",
    },

    bubble: {
      paddingHorizontal: 15,
      paddingVertical: 12,
    },
    userBubble: {
      backgroundColor: tokens.primary,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 4,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 18,
    },
    aiBubble: {
      backgroundColor: tokens.bgElev,
      maxWidth: "100%",
      borderTopLeftRadius: 4,
      borderTopRightRadius: 18,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 18,
    },

    imageAttachment: {
      width: 200,
      height: 192,
      borderRadius: 12,
      marginBottom: 8,
    },

    relatedContainer: {
      marginTop: 8,
      width: "100%",
    },
    relatedTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 11,
      color: tokens.fg3,
      marginBottom: 6,
      paddingHorizontal: 4,
    },
    relatedChips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    relatedChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
      alignSelf: "flex-start",
    },
    relatedChipText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg1,
    },

    breakdownContainer: {
      gap: 12,
      marginTop: 12,
      width: "100%",
    },
    operationStack: {
      gap: 12,
      marginTop: 12,
      width: "100%",
    },
    denialCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: `${tokens.statusBad}33`,
      backgroundColor: `${tokens.statusBad}14`,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 4,
    },
    denialTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      color: tokens.statusBadText,
    },
    denialReason: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 11,
      lineHeight: 16,
      color: tokens.statusBadText,
    },
    denialUpgrade: {
      fontFamily: 'Rubik_600SemiBold',
      fontSize: 11,
      color: tokens.primary,
      marginTop: 8,
    },
  });
}
