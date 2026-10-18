import { useState, useMemo } from "react";
// react-doctor-disable-next-line rn-prefer-expo-image -- expo-image is not a project dependency; the only <Image> is a transient chat-attachment preview (a per-message URI) where expo-image's disk cache brings no benefit, and adding a native image library is out of scope for a React Doctor burn-down (SDK 57 native-ABI/rebuild risk). https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { View, Text, Image, StyleSheet, Pressable } from "react-native";
import Animated, { FadeInUp, ReduceMotion } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { ArrowUpRight } from "@/components/ui/icons";
import { TOUCH_TARGET_MIN } from "@orbit/shared/theme";
import { useTranslation } from "react-i18next";
import type { MessageBubbleProps } from "@orbit/shared/chat";
import { getMessageBubbleView, getMessageBubbleOperations } from '@orbit/shared/chat'

import { useChatStore } from '@/stores/chat-store'
import { ActionChips } from "@/components/chat/action-chips";
import { BreakdownSuggestion } from "@/components/chat/breakdown-suggestion";
import { ClarificationCard } from "@/components/chat/clarification-card";
import { PendingOperationCard } from "@/components/chat/pending-operation-card";
import { OperationOutcomes } from "@/components/chat/operation-outcomes";
import { ChatBlock } from "@/components/chat/block-registry";
import { Markdown } from "@/components/ui/markdown";
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from "@/lib/use-app-theme";

function MessageProse({ message, sourceText, styles, showImage }: Readonly<{
  message: MessageBubbleProps['message'];
  sourceText: string;
  showImage: boolean;
  styles: ReturnType<typeof createStyles>;
}>) {
  const { t } = useTranslation();
  const isUser = message.role === "user";
  return (
    <View
      testID="message-prose"
      style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}
    >
      {showImage && message.imageUrl && (
        <Image
          source={{ uri: message.imageUrl }}
          accessibilityLabel={t("chat.attachmentPreview")}
          style={styles.imageAttachment}
          resizeMode="cover"
          resizeMethod="resize"
        />
      )}

      <Markdown tone="thread" copyableBlocks={!isUser}>
        {sourceText}
      </Markdown>
    </View>
  );
}

export function MessageBubble(props: Readonly<MessageBubbleProps>) {
  const { message, blockAnswerInteraction, animateEntry, onBreakdownConfirmed, onActionChipClick } = props
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

  const { isUser, parts, relatedSurfaces, nonSuggestionActions, suggestions, outcomes } = getMessageBubbleView(props, dismissedBreakdowns)
  const operations = getMessageBubbleOperations(props, useChatStore.getState().transitionMessage)
  function dismissBreakdown(key: string) {
    setDismissedBreakdowns(previous => new Set([...previous, key]))
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
        {parts.map(part => {
          if (part.type === 'block') return <ChatBlock key={part.key} part={part.part} savedAnswers={message.blockAnswers} interaction={blockAnswerInteraction} expired={part.expired} onActionChipClick={onActionChipClick} />
          return <MessageProse key={part.key} message={message}
            sourceText={part.text}
            styles={styles} showImage={part.showImage} />;
        })}

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
                          backgroundColor: tokens.bgHover,
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

        {!isUser && suggestions.length > 0 && (
          <View style={styles.breakdownContainer}>
            {suggestions.map(({ key, ...suggestion }) => <BreakdownSuggestion key={key} {...suggestion}
              onConfirmed={() => onBreakdownConfirmed?.()} onCancelled={() => dismissBreakdown(key)} />)}
          </View>
        )}

        {!isUser && operations.clarifications.length > 0 && (
          <View style={styles.breakdownContainer}>
            {operations.clarifications.map(({ key, ...clarification }) => <ClarificationCard key={key} {...clarification} />)}
          </View>
        )}

        {!isUser && operations.pendingOperations.length > 0 && (
          <View style={styles.operationStack}>
            {operations.pendingOperations.map(({ key, ...operation }) => <PendingOperationCard key={key} {...operation} />)}
          </View>
        )}

        {!isUser && outcomes.length > 0 ? (
          <View style={styles.operationStack}>
            <OperationOutcomes outcomes={outcomes} />
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
      gap: 16,
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
      minHeight: TOUCH_TARGET_MIN,
      paddingHorizontal: 16,
      borderRadius: 999,
      overflow: "hidden",
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
      alignSelf: "flex-start",
    },
    relatedChipText: {
      fontFamily: 'Geist_500Medium',
      fontSize: 14,
      color: tokens.fg2,
    },

    breakdownContainer: {
      gap: 16,
      width: "100%",
    },
    operationStack: {
      gap: 16,
      width: "100%",
    },
  });
}
