import { useState, useMemo, useEffect, useRef } from "react";
import { View, Text, Image, StyleSheet, Animated } from "react-native";
import { Sparkles, User } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "@orbit/shared/types/chat";
import type { AgentExecuteOperationResponse } from "@orbit/shared/types";
import { resolveUpgradeEntitlementFromPolicyDenial } from "@orbit/shared/utils";
import { ActionChips } from "@/components/chat/action-chips";
import { BreakdownSuggestion } from "@/components/chat/breakdown-suggestion";
import { formatChatMessage } from "@/components/chat/format-chat-message";
import { PendingOperationCard } from "@/components/chat/pending-operation-card";
import { useAppTheme } from "@/lib/use-app-theme";

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

  const nonSuggestionActions = useMemo(
    () => message.actions?.filter((a) => a.status !== "Suggestion") ?? [],
    [message.actions],
  );
  const operationResults = useMemo(
    () =>
      message.operations?.filter(
        (operation) => operation.status !== "PendingConfirmation",
      ) ?? [],
    [message.operations],
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
      {/* AI avatar */}
      {!isUser && (
        <View style={styles.aiAvatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Sparkles size={20} color={colors.primary} />
        </View>
      )}

      <View
        style={[
          styles.bubbleColumn,
          isUser ? styles.bubbleColumnUser : styles.bubbleColumnAI,
        ]}
      >
        {/* Sender label */}
        <Text style={styles.senderLabel}>
          {isUser ? t("chat.senderYou") : t("chat.senderOrbit")}
        </Text>

        {/* Message bubble */}
        <View
          style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}
        >
          {/* Image attachment */}
          {message.imageUrl && (
            <Image
              source={{ uri: message.imageUrl }}
              accessibilityLabel={t("chat.attachmentPreview")}
              style={styles.imageAttachment}
              resizeMode="cover"
            />
          )}

          {/* Message text */}
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

        {/* Action chips for AI messages */}
        {!isUser && nonSuggestionActions.length > 0 && (
          <ActionChips actions={nonSuggestionActions} onChipClick={onActionChipClick} />
        )}

        {/* Breakdown suggestions */}
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

        {!isUser && operationResults.length > 0 && (
          <View style={styles.operationStack}>
            {operationResults.map((operation) => (
              <View
                key={`${operation.operationId}-${operation.targetId ?? operation.sourceName}`}
                style={styles.operationCard}
              >
                <View style={styles.operationHeader}>
                  <Text style={styles.operationTitle}>
                    {operation.summary ?? operation.sourceName}
                  </Text>
                  <Text style={styles.operationStatus}>{operation.status}</Text>
                </View>
                {operation.policyReason ? (
                  <Text style={styles.operationDetail}>{operation.policyReason}</Text>
                ) : null}
              </View>
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

      {/* User avatar */}
      {isUser && (
        <View style={styles.userAvatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <User size={20} color={colors.textSecondary} />
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// TypingIndicator
// ---------------------------------------------------------------------------

function AnimatedDot({ delay }: { delay: number }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const opacity = useRef(new Animated.Value(1)).current;

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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.container, styles.aiContainer]} accessibilityLiveRegion="polite">
      {/* AI avatar */}
      <View style={styles.aiAvatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Sparkles size={20} color={colors.primary} />
      </View>

      <View style={styles.bubbleColumnAI}>
        {/* Sender label */}
        <Text style={styles.senderLabel}>{t("chat.senderOrbit")}</Text>

        {/* Typing bubble */}
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

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

type ThemeColors = ReturnType<typeof useAppTheme>["colors"];

function createStyles(colors: ThemeColors) {
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

    // Avatars (matching web: size-10 = 40px)
    aiAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary_20,
      borderWidth: 1,
      borderColor: colors.primary_30,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "flex-end",
    },
    userAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 2,
      borderColor: colors.primary_20,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "flex-end",
    },

    // Bubble column layout
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

    // Sender label
    senderLabel: {
      fontSize: 11,
      fontWeight: "500",
      color: colors.textSecondary,
      marginBottom: 4,
      paddingHorizontal: 8,
    },

    // Bubble
    bubble: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 16,
    },
    userBubble: {
      backgroundColor: colors.primary,
      borderBottomRightRadius: 6,
      // shadow-sm
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.4,
      shadowRadius: 3,
      elevation: 2,
    },
    aiBubble: {
      backgroundColor: colors.surfaceElevated,
      borderBottomLeftRadius: 6,
      // shadow-sm
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.4,
      shadowRadius: 3,
      elevation: 2,
    },

    // Image attachment
    imageAttachment: {
      width: 200,
      height: 192,
      borderRadius: 12,
      marginBottom: 8,
    },

    // Message text
    messageText: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textPrimary,
    },
    messageTextBold: {
      fontWeight: "700",
    },
    messageTextItalic: {
      fontStyle: "italic",
    },
    userText: {
      color: colors.white,
    },

    // Breakdown suggestions container
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
    operationCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 6,
    },
    operationHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    operationTitle: {
      flex: 1,
      fontSize: 12,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    operationStatus: {
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      color: colors.textMuted,
    },
    operationDetail: {
      fontSize: 11,
      lineHeight: 16,
      color: colors.textSecondary,
    },
    denialCard: {
      borderRadius: 16,
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
      color: colors.red400,
    },
    denialReason: {
      fontSize: 11,
      lineHeight: 16,
      color: colors.red400,
    },
    denialUpgrade: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.primary,
      marginTop: 8,
    },

    // Typing indicator
    typingBubble: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 16,
      borderBottomLeftRadius: 6,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderBottomRightRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      // shadow-sm
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
      backgroundColor: colors.textSecondary,
    },
  });
}
