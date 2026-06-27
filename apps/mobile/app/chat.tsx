import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useTourTarget } from "@/hooks/use-tour-target";
import {
  View,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "@orbit/shared/types";
import { CHAT_GOAL_ACTION_TYPES } from "@orbit/shared/hooks";
import { habitDetailToNormalized } from "@orbit/shared/utils";
import { useHabitDetail } from "@/hooks/use-habits";
import { useGoBackOrFallback } from "@/hooks/use-go-back-or-fallback";
import { useChatComposer } from "@/hooks/use-chat-composer";
import { useChatReward } from "@/hooks/use-chat-reward";
import { MessageBubble } from "@/components/message-bubble";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { ChatInputArea } from "@/components/chat/chat-input-area";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { GoalDetailDrawer } from "@/components/goals/goal-detail-drawer";
import { HabitDetailDrawer } from "@/components/habits/habit-detail-drawer";
import { AppBar } from "@/components/ui/app-bar";
import { AstraMark } from "@/components/ui/astra-avatar";
import { GradientTop } from "@/components/ui/gradient-top";
import { KeyboardAwareFlatList } from "@/components/ui/keyboard-aware-scroll-view";
import { createStyles } from "@/app/chat.styles";
import { createTokensV2 } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";
import { useOffline } from "@/hooks/use-offline";
import { useCoachMark } from "@/hooks/use-coach-mark";

export default function ChatScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { currentScheme, currentTheme } = useAppTheme();
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { isOnline } = useOffline();
  const goBackOrFallback = useGoBackOrFallback();
  const insets = useSafeAreaInsets();
  useCoachMark("coach-astra");
  const chatAreaRef = useRef<View>(null);
  const chatInputRef = useRef<View>(null);
  const chatVoiceRef = useRef<View>(null);
  useTourTarget("tour-chat-area", chatAreaRef);
  useTourTarget("tour-chat-input", chatInputRef);
  useTourTarget("tour-chat-voice", chatVoiceRef);

  const offlineTitle = t("chat.offline.title");
  const offlineDescription = t("chat.offline.description");

  const {
    flatListRef,
    messages,
    isTyping,
    sendError,
    retryLastSend,
    canRetryLastSend,
    selectedImage,
    imagePreview,
    composerResetSignal,
    isRecording,
    isTranscribing,
    speechSupported,
    transcript,
    speechError,
    toggleRecording,
    recordingTime,
    starterChips,
    hasProAccess,
    aiMessagesUsed,
    aiMessagesLimit,
    atMessageLimit,
    showSuggestions,
    openFilePicker,
    removeImage,
    selectedTextFile,
    openTextFilePicker,
    removeTextFile,
    sendMessage,
    scrollToBottom,
    handleBreakdownConfirmed,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
  } = useChatComposer({ isOnline, offlineTitle });

  const [keyboardInset, setKeyboardInset] = useState(0);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  const {
    adsEnabledForUser,
    canWatchRewardAd,
    isLoadingReward,
    rewardsClaimedToday,
    dailyRewardCap,
    rewardMessage,
    watchAdForMessages,
  } = useChatReward();

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const showSubscription = Keyboard.addListener("keyboardDidShow", (event) => {
      const nextInset = Math.max(0, event.endCoordinates.height - insets.bottom);
      setKeyboardInset(nextInset);
    });

    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardInset(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom]);

  const habitDetailQuery = useHabitDetail(selectedHabitId);
  const detailHabit = useMemo(
    () => (habitDetailQuery.data ? habitDetailToNormalized(habitDetailQuery.data) : null),
    [habitDetailQuery.data],
  );

  const handleActionChipClick = useCallback(
    (entityId: string, actionType: string) => {
      if (CHAT_GOAL_ACTION_TYPES.has(actionType)) {
        if (!hasProAccess) {
          router.push("/upgrade");
          return;
        }
        setSelectedHabitId(null);
        setSelectedGoalId(entityId);
        return;
      }

      setSelectedGoalId(null);
      setSelectedHabitId(entityId);
    },
    [hasProAccess, router],
  );

  const handleDrawerClose = useCallback(() => {
    setSelectedHabitId(null);
  }, []);

  const handleGoalDrawerClose = useCallback(() => {
    setSelectedGoalId(null);
  }, []);

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <MessageBubble
        message={item}
        onBreakdownConfirmed={handleBreakdownConfirmed}
        onActionChipClick={handleActionChipClick}
        onUpgradeClick={() => router.push("/upgrade")}
        onPendingOperationConfirmExecute={confirmAndExecutePendingOperation}
        onPendingOperationPrepareStepUp={prepareStepUpForBubble}
        onPendingOperationVerifyStepUp={verifyStepUpForBubble}
      />
    ),
    [
      confirmAndExecutePendingOperation,
      handleActionChipClick,
      handleBreakdownConfirmed,
      prepareStepUpForBubble,
      router,
      verifyStepUpForBubble,
    ],
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.bg }]} edges={["top"]}>
      {showSuggestions ? <GradientTop height={420} /> : null}
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <AppBar
          back
          onBack={() => goBackOrFallback("/")}
          backLabel={t("common.goBack")}
          titleIcon={<AstraMark size={18} />}
          title={t("chat.title")}
        />

        {showSuggestions ? (
          <ChatEmptyState
            ref={chatAreaRef}
            tokens={tokens}
            styles={styles}
            onSelectSuggestion={(suggestion) => {
              void sendMessage(suggestion);
            }}
          />
        ) : (
          <View ref={chatAreaRef} style={{ flex: 1 }}>
            <KeyboardAwareFlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={keyExtractor}
              contentContainerStyle={styles.messageList}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={scrollToBottom}
              ListFooterComponent={isTyping ? <TypingIndicator /> : null}
              accessibilityLabel={t("chat.title")}
              accessibilityLiveRegion="polite"
            />
          </View>
        )}

        <ChatInputArea
          ref={chatInputRef}
          voiceRef={chatVoiceRef}
          tokens={tokens}
          styles={styles}
          paddingBottom={Math.max(16, insets.bottom + 12)}
          marginBottom={
            Platform.OS === "android" && keyboardInset > 0
              ? keyboardInset + 10
              : 0
          }
          hasMessages={messages.length > 0}
          isOnline={isOnline}
          offlineTitle={offlineTitle}
          offlineDescription={offlineDescription}
          sendError={sendError}
          canRetry={canRetryLastSend}
          speechError={speechError}
          imagePreview={imagePreview}
          starterChips={starterChips}
          hasProAccess={hasProAccess}
          aiMessagesUsed={aiMessagesUsed}
          aiMessagesLimit={aiMessagesLimit}
          atMessageLimit={atMessageLimit}
          isRecording={isRecording}
          isTranscribing={isTranscribing}
          isTyping={isTyping}
          selectedImagePresent={selectedImage !== null}
          selectedTextFileName={selectedTextFile?.name ?? null}
          selectedTextFilePresent={selectedTextFile !== null}
          transcript={transcript}
          composerResetSignal={composerResetSignal}
          recordingTime={recordingTime}
          speechSupported={speechSupported}
          reward={{
            adsEnabledForUser,
            canWatchRewardAd,
            isLoadingReward,
            rewardsClaimedToday,
            dailyRewardCap,
            rewardMessage,
            onWatchAd: () => {
              void watchAdForMessages();
            },
          }}
          onRemoveImage={removeImage}
          onRemoveTextFile={removeTextFile}
          onRetry={() => {
            void retryLastSend();
          }}
          onSendChip={(chip) => {
            void sendMessage(chip);
          }}
          onSend={(message) => {
            void sendMessage(message);
          }}
          onToggleRecording={toggleRecording}
          onOpenFilePicker={() => {
            void openFilePicker();
          }}
          onOpenTextFilePicker={() => {
            void openTextFilePicker();
          }}
          onUpgrade={() => router.push("/upgrade")}
        />
      </KeyboardAvoidingView>

      <HabitDetailDrawer
        open={!!selectedHabitId}
        onClose={handleDrawerClose}
        habit={detailHabit}
      />
      {selectedGoalId && (
        <GoalDetailDrawer
          open={!!selectedGoalId}
          onClose={handleGoalDrawerClose}
          goalId={selectedGoalId}
        />
      )}
    </SafeAreaView>
  );
}
