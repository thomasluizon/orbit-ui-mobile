import { useState, useMemo } from "react";
// react-doctor-disable-next-line rn-prefer-expo-image -- expo-image is not a project dependency; the only <Image> is a transient chat-attachment preview (a per-message URI) where expo-image's disk cache brings no benefit, and adding a native image library is out of scope for a React Doctor burn-down (SDK 57 native-ABI/rebuild risk). https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { View, Text, Image, StyleSheet, Pressable } from "react-native";
import Animated, { FadeInUp, ReduceMotion } from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { ArrowUpRight, Check, Copy } from "@/components/ui/icons";
import { useTranslation } from "react-i18next";
import type { MessageBubbleProps } from "@orbit/shared/chat";
import {
  getRelatedSurfaces,
  partitionMessageActions,
  stripChatDirectives,
} from "@orbit/shared/chat";
import { ActionChips } from "@/components/chat/action-chips";
import { BreakdownSuggestion } from "@/components/chat/breakdown-suggestion";
import { ClarificationCard } from "@/components/chat/clarification-card";
import { GoalListCard } from "@/components/chat/goal-list-card";
import { HabitListCard } from "@/components/chat/habit-list-card";
import { PendingOperationCard } from "@/components/chat/pending-operation-card";
import { OperationOutcomes } from "@/components/chat/operation-outcomes";
import { Markdown } from "@/components/ui/markdown";
import { AstraMark } from "@/components/ui/astra-avatar";
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from "@/lib/use-app-theme";

function MessageCopyControl({ sourceText, tokens, styles }: Readonly<{
  sourceText: string;
  tokens: ReturnType<typeof createTokensV2>;
  styles: ReturnType<typeof createStyles>;
}>) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copySourceText() {
    await Clipboard.setStringAsync(sourceText);
    setCopied(true);
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copied ? t("chat.copied") : t("chat.copy")}
      onPress={() => void copySourceText()}
      style={styles.copyControl}
    >
      {copied ? (
        <Check size={16} strokeWidth={1.8} color={tokens.fg3} />
      ) : (
        <Copy size={16} strokeWidth={1.8} color={tokens.fg3} />
      )}
      <Text style={styles.copyText}>{copied ? t("chat.copied") : t("chat.copy")}</Text>
    </Pressable>
  );
}

function MessageDataLists({
  message,
  onActionChipClick,
}: Readonly<Pick<MessageBubbleProps, "message" | "onActionChipClick">>) {
  return (
    <>
      {message.habitList ? <HabitListCard habitList={message.habitList} /> : null}
      {message.goalList ? (
        <GoalListCard
          goalList={message.goalList}
          onOpenGoal={(id) => onActionChipClick?.(id, "CreateGoal")}
        />
      ) : null}
    </>
  );
}

export function MessageBubble({
  message,
  animateEntry,
  isStreaming = false,
  onBreakdownConfirmed,
  onActionChipClick,
  onPendingOperationConfirmExecute,
  onPendingOperationPrepareStepUp,
  onPendingOperationVerifyStepUp,
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
  const sourceText = isUser ? message.content : stripChatDirectives(message.content, false);

  const {
    clarificationActions,
    nonSuggestionActions,
    suggestionActions,
  } = useMemo(
    () => partitionMessageActions(message.actions, message.policyDenials),
    [message.actions, message.policyDenials],
  );
  const relatedSurfaces = useMemo(
    () => getRelatedSurfaces(message.relatedSurfaces),
    [message.relatedSurfaces],
  );

  function dismissBreakdown(key: string) {
    setDismissedBreakdowns((prev) => new Set([...prev, key]));
  }

  const senderLabel = isUser ? t("chat.senderYou") : t("chat.senderOrbit");
  const containerStyle = [
    styles.container,
    isUser ? styles.userContainer : styles.aiContainer,
  ];

  const bubbleContent = (
    <>
      {!isUser && (
        <View style={styles.aiAvatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <AstraMark size={16} />
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
            {isUser ? message.content : stripChatDirectives(message.content, isStreaming)}
          </Markdown>
        </View>

        <MessageCopyControl sourceText={sourceText} styles={styles} tokens={tokens} />

        {!isUser ? (
          <MessageDataLists message={message} onActionChipClick={onActionChipClick} />
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
                    pressed
                      ? {
                          transform: [{ scale: 0.96 }],
                          backgroundColor: tokens.bgElev2,
                        }
                      : null,
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
                  warning={action.conflictWarning}
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

        {!isUser && ((message.operations?.length ?? 0) > 0 || (message.policyDenials?.length ?? 0) > 0) ? (
          <View style={styles.operationStack}>
            <OperationOutcomes operations={message.operations ?? []} denials={message.policyDenials ?? []} />
          </View>
        ) : null}
      </View>
    </>
  );

  if (!animateEntry) {
    return (
      <View style={containerStyle} accessibilityLabel={senderLabel}>
        {bubbleContent}
      </View>
    );
  }

  return (
    <Animated.View
      entering={FadeInUp.duration(220).reduceMotion(ReduceMotion.System)}
      style={containerStyle}
      accessibilityLabel={senderLabel}
    >
      {bubbleContent}
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
      gap: 8,
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
      minWidth: 0,
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
      maxWidth: "100%",
      minWidth: 0,
      flexShrink: 1,
      paddingHorizontal: 16,
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
      borderWidth: 1,
      borderColor: tokens.hairline,
      marginBottom: 8,
    },
    copyControl: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 8,
    },
    copyText: {
      color: tokens.fg3,
      fontFamily: "Geist_500Medium",
      fontSize: 14,
    },

    relatedContainer: {
      marginTop: 8,
      width: "100%",
    },
    relatedTitle: {
      fontFamily: 'Geist_500Medium',
      fontSize: 12,
      color: tokens.fg3,
      marginBottom: 4,
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
      gap: 4,
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 999,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
      alignSelf: "flex-start",
    },
    relatedChipText: {
      fontFamily: 'Geist_500Medium',
      fontSize: 13,
      color: tokens.fg2,
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
  });
}
