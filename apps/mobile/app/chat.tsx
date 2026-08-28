import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useTourTarget } from "@/hooks/use-tour-target";
import {
  View,
  Text,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  type ListRenderItem,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeOut, ReduceMotion } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "@orbit/shared/types";
import { CHAT_GOAL_ACTION_TYPES } from "@orbit/shared/hooks";
import { habitDetailToNormalized } from "@orbit/shared/utils";
import { useHabitDetail } from "@/hooks/use-habits";
import { useGoBackOrFallback } from "@/hooks/use-go-back-or-fallback";
import { useChatComposer } from "@/hooks/use-chat-composer";
import { MessageBubble } from "@/components/message-bubble";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { Composer } from "@/components/shell/composer";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { GoalDetailDrawer } from "@/components/goals/goal-detail-drawer";
import { HabitDetailDrawer } from "@/components/habits/habit-detail-drawer";
import { AppBar } from "@/components/ui/app-bar";
import { AstraMark } from "@/components/ui/astra-avatar";
import { GradientTop } from "@/components/ui/gradient-top";
import { OfflineUnavailableState } from "@/components/ui/offline-unavailable-state";
import { KeyboardAwareFlatList } from "@/components/ui/keyboard-aware-scroll-view";
import { createStyles } from "@/app/chat.styles";
import { createTokensV2 } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";
import { useOffline } from "@/hooks/use-offline";

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
  const chatAreaRef = useRef<View>(null);
  const chatInputRef = useRef<View>(null);
  useTourTarget("tour-chat-area", chatAreaRef);
  useTourTarget("tour-chat-input", chatInputRef);

  const offlineTitle = t("chat.offline.title");
  const offlineDescription = t("chat.offline.description");

  const {
    flatListRef,
    messages,
    isTyping,
    streamingMessageId,
    sendError,
    composerProps,
    hasProAccess,
    showSuggestions,
    sendMessage,
    scrollToBottom,
    handleBreakdownConfirmed,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
  } = useChatComposer({ isOnline, offlineTitle });

  const [initialMessageIds] = useState(() => new Set(messages.map((message) => message.id)));
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [goalDrawerOpen, setGoalDrawerOpen] = useState(false);

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
        setGoalDrawerOpen(true);
        return;
      }

      setGoalDrawerOpen(false);
      setSelectedHabitId(entityId);
    },
    [hasProAccess, router],
  );

  const handleDrawerClose = useCallback(() => {
    setSelectedHabitId(null);
  }, []);

  /* WHY: selectedGoalId stays set on close - unmounting the drawer here tears
     down its presented TrueSheet mid-dismissal, which wedges every later RN
     Modal and drops the onDidDismiss that runs the scheduled exit action.
     https://sheet.lodev09.com/guides/navigation */
  const handleGoalDrawerClose = useCallback(() => {
    setGoalDrawerOpen(false);
  }, []);

  const renderMessage = useCallback<ListRenderItem<ChatMessage>>(
    ({ item }) => (
      <MessageBubble
        message={item}
        animateEntry={!initialMessageIds.has(item.id)}
        isStreaming={item.id === streamingMessageId}
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
      initialMessageIds,
      prepareStepUpForBubble,
      router,
      streamingMessageId,
      verifyStepUpForBubble,
    ],
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.bg }]} edges={["top"]}>
      {showSuggestions ? (
        <Animated.View
          pointerEvents="none"
          style={styles.gradientBackdrop}
          exiting={FadeOut.duration(280).reduceMotion(ReduceMotion.System)}
        >
          <GradientTop height={300} />
        </Animated.View>
      ) : null}
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

        <View
          ref={chatInputRef}
          style={{
            marginBottom:
              Platform.OS === "android" && keyboardInset > 0
                ? keyboardInset + 10
                : 0,
            paddingBottom: insets.bottom,
          }}
        >
          {!isOnline ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <OfflineUnavailableState
                title={offlineTitle}
                description={offlineDescription}
                compact
              />
            </View>
          ) : null}
          {sendError ? (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              style={{
                paddingHorizontal: 16,
                paddingTop: 12,
                textAlign: "center",
                color: tokens.statusBad,
                fontFamily: "Geist_400Regular",
                fontSize: 14,
              }}
            >
              {sendError}
            </Text>
          ) : null}
          <Composer {...composerProps} />
        </View>
      </KeyboardAvoidingView>

      <HabitDetailDrawer
        open={!!selectedHabitId}
        onClose={handleDrawerClose}
        habit={detailHabit}
      />
      {selectedGoalId && (
        <GoalDetailDrawer
          open={goalDrawerOpen}
          onClose={handleGoalDrawerClose}
          goalId={selectedGoalId}
        />
      )}
    </SafeAreaView>
  );
}
