import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { useState, useRef, useCallback, useEffect, useMemo, useId } from "react";
import { useOverlayBack } from "@/hooks/use-overlay-back";
import {
  View,
  Text,
  AccessibilityInfo,
  Pressable,
  Platform,
  FlatList,
  type ListRenderItem,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "@orbit/shared/types";
import { CHAT_GOAL_ACTION_TYPES } from "@orbit/shared/hooks";
import { chatTraceLabelKey } from "@orbit/shared/chat";
import type { useChatComposer } from "@/hooks/use-chat-composer";
import { MessageBubble } from "@/components/message-bubble";
import { Composer } from "@/components/shell/composer";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { FollowUpChips } from "@/components/chat/follow-up-chips";
import { GoalDetailDrawer } from "@/components/goals/goal-detail-drawer";
import { AppBar } from "@/components/ui/app-bar";
import { MotionPressable } from "@/components/ui/motion-pressable";
import { ChevronDown, X } from "@/components/ui/icons";
import { createStyles } from "@/components/chat/conversation.styles";
import { useConversationKeyboardScroll } from "@/components/chat/use-conversation-keyboard-scroll";
import { createTokensV2 } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";
import { useUIStore } from "@/stores/ui-store";
import { useChatStore } from "@/stores/chat-store";

type ChatController = ReturnType<typeof useChatComposer>;

function ThinkingTrace({ steps, running }: Readonly<{
  steps: readonly { domain: string; access: string }[];
  running: boolean;
}>) {
  const { t } = useTranslation();
  const { currentScheme, currentTheme } = useAppTheme();
  const tokens = createTokensV2(currentScheme, currentTheme);
  const [expanded, setExpanded] = useState(false);
  const announced = useRef(false);
  const panelId = useId();
  useEffect(() => {
    if (running && steps.length > 0 && !announced.current) {
      announced.current = true;
      AccessibilityInfo.announceForAccessibility(t('chat.trace.working'));
    }
  }, [running, steps.length, t]);
  if (steps.length === 0) return null;
  const lines = steps.map((step, index) => <View key={`${step.domain}-${step.access}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <Text style={{ color: tokens.fg3, fontSize: 14, flexShrink: 1 }}>{t(chatTraceLabelKey(step.domain, step.access))}</Text>
    {running && index === steps.length - 1 ? <View accessible={false} style={{ flexDirection: 'row', gap: 4 }}>
      {[0, 1, 2].map((dot) => <View key={dot} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: tokens.fg2 }} />)}
    </View> : null}
  </View>);
  if (running) return <View accessibilityLiveRegion="none" style={{ gap: 4, paddingHorizontal: 16, paddingVertical: 8 }}>{lines}</View>;
  return <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
    <Pressable accessibilityRole="button" aria-expanded={expanded} accessibilityLabel={t('chat.trace.steps', { count: steps.length })} onPress={() => setExpanded(!expanded)} style={{ minHeight: TOUCH_TARGET_MIN, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ color: tokens.fg3, fontSize: 14 }}>{t('chat.trace.steps', { count: steps.length })}</Text>
      <ChevronDown size={16} color={tokens.fg3} strokeWidth={1.5} style={expanded ? { transform: [{ rotate: '180deg' }] } : undefined} />
    </Pressable>
    <View nativeID={panelId} accessibilityLiveRegion="none" style={{ display: expanded ? 'flex' : 'none', gap: 4 }}>{lines}</View>
  </View>;
}

export function AstraConversation({ chat }: Readonly<{ chat: ChatController }>) {
  const { t } = useTranslation();
  const router = useRouter();
  const { currentScheme, currentTheme } = useAppTheme();
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const setAstraConversationOpen = useUIStore((state) => state.setAstraConversationOpen);
  const contextualSuggestion = useChatStore((state) => state.contextualSuggestion);
  const insets = useSafeAreaInsets();
  const chatAreaRef = useRef<View>(null);
  const chatInputRef = useRef<View>(null);
  const titleRef = useRef<Text>(null);

  useEffect(() => {
    if (Platform.OS === "android" && titleRef.current) {
      AccessibilityInfo.sendAccessibilityEvent(titleRef.current, "focus");
    }
  }, []);

  const {
    flatListRef,
    messages,
    isTyping,
    streamingMessageId,
    composerProps,
    showSuggestions,
    sendMessage,
    activeSteps,
    canShowFollowUps,
    scrollToBottom,
    handleBreakdownConfirmed,
    revisePendingOperationForBubble,
    refreshPendingOperationForBubble,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
  } = chat;
  const keyboardScroll = useConversationKeyboardScroll(flatListRef);


  const [initialMessageIds] = useState(() => new Set(messages.map((message) => message.id)));
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [goalDrawerOpen, setGoalDrawerOpen] = useState(false);
  const closeConversation = useCallback(() => {
    setAstraConversationOpen(false);
  }, [setAstraConversationOpen]);

  useOverlayBack(true, closeConversation);

  const handleActionChipClick = useCallback(
    (entityId: string, actionType: string) => {
      if (CHAT_GOAL_ACTION_TYPES.has(actionType)) {
        setSelectedGoalId(entityId);
        setGoalDrawerOpen(true);
        return;
      }

      setGoalDrawerOpen(false);
      router.push({ pathname: "/habits/[id]", params: { id: entityId } });
    },
    [router],
  );

  /* WHY: selectedGoalId keeps the presented sheet mounted until native
     dismissal completes, so onDidDismiss fires and runs the scheduled exit
     action. Sheet owns the close path.
     https://sheet.lodev09.com/guides/navigation */
  const handleGoalDrawerClose = useCallback(() => {
    setGoalDrawerOpen(false);
  }, []);

  const renderMessage = useCallback<ListRenderItem<ChatMessage>>(
    ({ item }) => (
      <View>
      <MessageBubble
        message={item}
        animateEntry={!initialMessageIds.has(item.id)}
        isStreaming={item.id === streamingMessageId}
        onBreakdownConfirmed={handleBreakdownConfirmed}
        onActionChipClick={handleActionChipClick}
        onPendingOperationRevise={revisePendingOperationForBubble}
        onPendingOperationRefresh={refreshPendingOperationForBubble}
        onPendingOperationConfirmExecute={confirmAndExecutePendingOperation}
        onPendingOperationPrepareStepUp={prepareStepUpForBubble}
        onPendingOperationVerifyStepUp={verifyStepUpForBubble}
      />
      {item.toolSteps?.length ? <ThinkingTrace steps={item.toolSteps} running={false} /> : null}
      {item.role === 'ai' && item.id === messages.at(-1)?.id && canShowFollowUps && item.followUps ? <FollowUpChips followUps={item.followUps} onSelect={(text) => void sendMessage(text, 'followUp')} /> : null}
      </View>
    ),
    [
      confirmAndExecutePendingOperation,
      handleActionChipClick,
      handleBreakdownConfirmed,
      initialMessageIds,
      messages,
      canShowFollowUps,
      sendMessage,
      revisePendingOperationForBubble,
      refreshPendingOperationForBubble,
      prepareStepUpForBubble,
      streamingMessageId,
      verifyStepUpForBubble,
    ],
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  return (
    <View style={[styles.safeArea, { backgroundColor: tokens.bg }]}>
      <View style={styles.content}>
        <AppBar
          titleRef={titleRef}
          title={t("chat.title")}
          action={
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel={t("common.closeConversation")}
              onPress={closeConversation}
              style={({ pressed }) => [
                styles.headerClose,
                { backgroundColor: pressed ? tokens.bgHover : "transparent" },
              ]}
            >
              <X size={20} strokeWidth={2} color={tokens.fg1} />
            </MotionPressable>
          }
        />

        {showSuggestions ? (
          <ChatEmptyState
            ref={chatAreaRef}
            styles={styles}
            contextualAction={contextualSuggestion?.id === "progress-create-goal"
              ? { label: contextualSuggestion.label, onSelect: () => void sendMessage(contextualSuggestion.prompt) }
              : undefined}
            onSelectSuggestion={(suggestion) => {
              void sendMessage(suggestion);
            }}
          />
        ) : (
          <View ref={chatAreaRef} style={{ flex: 1 }}>
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={keyExtractor}
              contentContainerStyle={styles.messageList}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={scrollToBottom}
              onScroll={keyboardScroll.onScroll}
              onLayout={keyboardScroll.onLayout}
              ListFooterComponent={activeSteps.length > 0 ? <ThinkingTrace steps={activeSteps} running /> : null}
              accessibilityLabel={t("chat.title")}
              accessibilityLiveRegion={activeSteps.length > 0 ? "none" : "polite"}
              accessibilityState={{ busy: isTyping || streamingMessageId !== null || activeSteps.length > 0 }}
            />
          </View>
        )}

        <View
          ref={chatInputRef}
          style={{
            paddingBottom: insets.bottom,
          }}
        >
          <Composer
            {...composerProps}
            autoFocus
            suggestions={composerProps.suggestions}
            onInputFocus={keyboardScroll.onComposerFocus}
            onInputBlur={keyboardScroll.onComposerBlur}
          />
        </View>
      </View>

      {selectedGoalId && (
        <GoalDetailDrawer
          open={goalDrawerOpen}
          onClose={handleGoalDrawerClose}
          goalId={selectedGoalId}
        />
      )}
    </View>
  );
}
