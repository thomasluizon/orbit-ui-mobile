import { useState, useMemo, useEffect, useRef } from "react";
// react-doctor-disable-next-line rn-prefer-expo-image -- expo-image is not a project dependency; the only <Image> is a transient chat-attachment preview (a per-message URI) where expo-image's disk cache brings no benefit, and adding a native image library is out of scope for a React Doctor burn-down (SDK 57 native-ABI/rebuild risk). https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { View, Text, Image, StyleSheet, Pressable } from "react-native";
import Animated, { FadeInUp, ReduceMotion } from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { ArrowUpRight, Check, Copy } from "@/components/ui/icons";
import { BUTTON_SIZES } from "@orbit/shared/theme";
import { useTranslation } from "react-i18next";
import type { MessageBubbleProps } from "@orbit/shared/chat";
import {
  getRelatedSurfaces,
  hasChatProse,
  partitionMessageActions,
  stripChatDirectives,
} from "@orbit/shared/chat";
import { ActionChips } from "@/components/chat/action-chips";
import { BreakdownSuggestion } from "@/components/chat/breakdown-suggestion";
import { ClarificationCard } from "@/components/chat/clarification-card";
import { GoalListCard } from "@/components/chat/goal-list-card";
import { HabitListCard } from "@/components/chat/habit-list-card";
import { MetricsCard } from "@/components/chat/metrics-card";
import { PeriodInsightCard } from "@/components/chat/period-insight-card";
import { DaySummaryCard } from "@/components/chat/day-summary-card";
import { StreakCard } from "@/components/chat/streak-card";
import { CalendarCard } from "@/components/chat/calendar-card";
import { RecordListCard } from "@/components/chat/record-list-card";
import { AccountRowsCard } from "@/components/chat/account-rows-card";
import { PendingOperationCard } from "@/components/chat/pending-operation-card";
import { OperationOutcomes } from "@/components/chat/operation-outcomes";
import { Markdown } from "@/components/ui/markdown";
import { PillButton } from "@/components/ui/pill-button";
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from "@/lib/use-app-theme";

function MessageCopyControl({ sourceText }: Readonly<{
  sourceText: string;
}>) {
  const { t } = useTranslation();
  const { currentScheme, currentTheme } = useAppTheme();
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme]);
  const [copied, setCopied] = useState(false);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
  }, []);

  async function copySourceText() {
    await Clipboard.setStringAsync(sourceText);
    setCopied(true);
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <PillButton
      variant="ghost"
      size="sm"
      accessibleName={copied ? t("chat.copied") : t("chat.copy")}
      onClick={() => void copySourceText()}
      leadingIcon={copied
        ? <Check size={BUTTON_SIZES.sm.iconSize} color={tokens.fg1} aria-hidden />
        : <Copy size={BUTTON_SIZES.sm.iconSize} color={tokens.fg1} aria-hidden />}
    >
      {copied ? t("chat.copied") : t("chat.copy")}
    </PillButton>
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

function MessageMetricsBlocks({ message, isStreaming }: Readonly<Pick<MessageBubbleProps, 'message'> & { isStreaming: boolean }>) {
  if (isStreaming || message.role === 'user') return null
  return (
    <>
      {message.metricsCard ? <MetricsCard metricsCard={message.metricsCard} /> : null}
      {message.periodInsight ? <PeriodInsightCard periodInsight={message.periodInsight} /> : null}
      {message.daySummary ? <DaySummaryCard daySummary={message.daySummary} /> : null}
      {message.streakCard ? <StreakCard streakCard={message.streakCard} /> : null}
      {message.calendarCard ? <CalendarCard calendarCard={message.calendarCard} /> : null}
      {message.recordList ? <RecordListCard recordList={message.recordList} /> : null}
      {message.accountRows ? <AccountRowsCard accountRows={message.accountRows} /> : null}
    </>
  )
}

export function MessageBubble({
  message,
  animateEntry,
  isStreaming = false,
  onBreakdownConfirmed,
  onActionChipClick,
  onPendingOperationRevise,
  onPendingOperationRefresh,
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
  const sourceText = stripChatDirectives(message.content, false);

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
      <View
        style={isUser ? styles.bubbleColumnUser : styles.bubbleColumnAI}
      >
        <View style={[styles.proseStack, isUser ? styles.userProseStack : null]}>
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

          <Markdown tone="thread">
            {isUser ? message.content : stripChatDirectives(message.content, isStreaming)}
          </Markdown>
        </View>

        {!isUser && hasChatProse(sourceText) ? <MessageCopyControl sourceText={sourceText} /> : null}
        </View>

        {!isUser ? (
          <MessageDataLists message={message} onActionChipClick={onActionChipClick} />
        ) : null}

        <MessageMetricsBlocks message={message} isStreaming={isStreaming} />

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
                  onRevise={onPendingOperationRevise}
                  onRefresh={onPendingOperationRefresh}
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
    },
    userContainer: {
      justifyContent: "flex-end",
    },
    aiContainer: {
      justifyContent: "flex-start",
    },

    bubbleColumnUser: {
      maxWidth: "80%",
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

    proseStack: {
      maxWidth: "100%",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: 8,
    },
    userProseStack: {
      alignItems: "flex-end",
    },

    bubble: {
      maxWidth: "100%",
      minWidth: 0,
      flexShrink: 1,
    },
    userBubble: {
      backgroundColor: tokens.bgWell,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderBottomLeftRadius: 16,
      borderBottomRightRadius: 16,
    },
    aiBubble: {
      maxWidth: "100%",
    },

    imageAttachment: {
      width: 200,
      maxWidth: "100%",
      height: 192,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tokens.hairline,
      marginBottom: 8,
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
