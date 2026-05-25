import { useState, useMemo, useEffect } from "react";
import { View, Text, Image, StyleSheet, Animated } from "react-native";
import { Sparkles, User } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "@orbit/shared/types/chat";
import type { AgentExecuteOperationResponse } from "@orbit/shared/types";
import { resolveUpgradeEntitlementFromPolicyDenial } from "@orbit/shared/utils";
import { ActionChips } from "@/components/chat/action-chips";
import { BreakdownSuggestion } from "@/components/chat/breakdown-suggestion";
import { ClarificationCard } from "@/components/chat/clarification-card";
import { formatChatMessage } from "@/components/chat/format-chat-message";
import { PendingOperationCard } from "@/components/chat/pending-operation-card";
import { createTokensV2 } from '@/lib/theme'
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

interface FormattedSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
}

function parseFormattedSegments(value: string): FormattedSegment[] {
  const html = formatChatMessage(value);
  const segments: FormattedSegment[] = [];
  let cursor = 0;

  while (cursor < html.length) {
    if (html.startsWith("<strong>", cursor)) {
      const end = html.indexOf("</strong>", cursor);
      if (end === -1) break;
      segments.push({
        text: decodeHtmlEntities(html.slice(cursor + 8, end)),
        bold: true,
      });
      cursor = end + 9;
      continue;
    }

    if (html.startsWith("<em>", cursor)) {
      const end = html.indexOf("</em>", cursor);
      if (end === -1) break;
      segments.push({
        text: decodeHtmlEntities(html.slice(cursor + 4, end)),
        italic: true,
      });
      cursor = end + 5;
      continue;
    }

    const nextStrong = html.indexOf("<strong>", cursor);
    const nextEm = html.indexOf("<em>", cursor);
    const nextTagCandidates = [nextStrong, nextEm].filter(
      (index) => index >= 0,
    );
    const nextTag =
      nextTagCandidates.length > 0
        ? Math.min(...nextTagCandidates)
        : html.length;
    segments.push({
      text: decodeHtmlEntities(html.slice(cursor, nextTag)),
    });
    cursor = nextTag;
  }

  return segments.filter((segment) => segment.text.length > 0);
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

  const nonSuggestionActions = useMemo(
    () =>
      message.actions?.filter(
        (a) => a.status !== "Suggestion" && a.status !== "NeedsClarification",
      ) ?? [],
    [message.actions],
  );
  const formattedSegments = useMemo(
    () => parseFormattedSegments(message.content ?? ""),
    [message.content],
  );

  function dismissBreakdown(key: string) {
    setDismissedBreakdowns((prev) => new Set([...prev, key]));
  }

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.aiContainer,
      ]}
    >
      {!isUser && (
        <View style={styles.aiAvatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Sparkles size={20} color={tokens.primary} />
        </View>
      )}

      <View
        style={[
          styles.bubbleColumn,
          isUser ? styles.bubbleColumnUser : styles.bubbleColumnAI,
        ]}
      >
        <Text style={styles.senderLabel}>
          {isUser ? t("chat.senderYou") : t("chat.senderOrbit")}
        </Text>

        <View
          style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}
        >
          {message.imageUrl && (
            <Image
              source={{ uri: message.imageUrl }}
              accessibilityLabel={t("chat.attachmentPreview")}
              style={styles.imageAttachment}
              resizeMode="cover"
            />
          )}

          <Text style={[styles.messageText, isUser && styles.userText]}>
            {formattedSegments.map((segment, index) => (
              <Text
                key={`${message.id}-segment-${index}`}
                style={[
                  isUser && styles.userText,
                  segment.bold ? styles.messageTextBold : null,
                  segment.italic ? styles.messageTextItalic : null,
                ]}
              >
                {segment.text}
              </Text>
            ))}
          </Text>
        </View>

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
                  <Text style={styles.denialTitle}>{denial.sourceName}</Text>
                  <Text style={styles.denialReason}>{denial.reason}</Text>
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

      {isUser && (
        <View style={styles.userAvatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <User size={20} color={tokens.fg2} />
        </View>
      )}
    </View>
  );
}

function AnimatedDot({ delay }: { delay: number }) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const opacity = useMemo(() => new Animated.Value(1), []);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 500,
          delay,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [delay, opacity]);

  return <Animated.View style={[styles.typingDot, { opacity }]} />;
}

export function TypingIndicator() {
  const { t } = useTranslation();
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={[styles.container, styles.aiContainer]} accessibilityLiveRegion="polite">
      <View style={styles.aiAvatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Sparkles size={20} color={tokens.primary} />
      </View>

      <View style={styles.bubbleColumnAI}>
        <Text style={styles.senderLabel}>{t("chat.senderOrbit")}</Text>

        <View style={styles.typingBubble}>
          <View style={styles.dotsRow}>
            <AnimatedDot delay={0} />
            <AnimatedDot delay={200} />
            <AnimatedDot delay={400} />
          </View>
        </View>
      </View>
    </View>
  );
}

type AppTokens = ReturnType<typeof createTokensV2>;

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      marginBottom: 24,
      paddingHorizontal: 16,
      gap: 12,
    },
    userContainer: {
      justifyContent: "flex-end",
    },
    aiContainer: {
      justifyContent: "flex-start",
    },

    aiAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairlineStrong,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "flex-end",
    },
    userAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: tokens.bgElev,
      borderWidth: 2,
      borderColor: tokens.bgElev,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "flex-end",
    },

    bubbleColumn: {
      maxWidth: "70%",
      flexDirection: "column",
    },
    bubbleColumnUser: {
      alignItems: "flex-end",
    },
    bubbleColumnAI: {
      alignItems: "flex-start",
    },

    senderLabel: {
      fontSize: 11,
      fontWeight: "500",
      color: tokens.fg2,
      marginBottom: 4,
      paddingHorizontal: 8,
    },

    bubble: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 12,
    },
    userBubble: {
      backgroundColor: tokens.primary,
      borderBottomRightRadius: 4,
    },
    aiBubble: {
      backgroundColor: tokens.bgElev,
      borderBottomLeftRadius: 4,
    },

    imageAttachment: {
      width: 200,
      height: 192,
      borderRadius: 12,
      marginBottom: 8,
    },

    messageText: {
      fontSize: 14,
      lineHeight: 20,
      color: tokens.fg1,
    },
    messageTextBold: {
      fontWeight: "700",
    },
    messageTextItalic: {
      fontStyle: "italic",
    },
    userText: {
      color: tokens.fgOnPrimary,
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
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "rgba(248,113,113,0.2)",
      backgroundColor: "rgba(248,113,113,0.08)",
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 4,
    },
    denialTitle: {
      fontSize: 12,
      fontWeight: "600",
      color: tokens.statusBad,
    },
    denialReason: {
      fontSize: 11,
      lineHeight: 16,
      color: tokens.statusBad,
    },
    denialUpgrade: {
      fontSize: 11,
      fontWeight: "700",
      color: tokens.primary,
      marginTop: 8,
    },

    typingBubble: {
      backgroundColor: tokens.bgElev,
      borderRadius: 12,
      borderBottomLeftRadius: 4,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
      borderBottomRightRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: tokens.hairline,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.4,
      shadowRadius: 3,
      elevation: 2,
    },
    dotsRow: {
      flexDirection: "row",
      gap: 6,
      alignItems: "center",
    },
    typingDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: tokens.fg2,
    },
  });
}
