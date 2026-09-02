import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useTourTarget } from "@/hooks/use-tour-target";
import {
  View,
  Text,
  Pressable,
  Linking,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  type ListRenderItem,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "@orbit/shared/types";
import { CHAT_GOAL_ACTION_TYPES } from "@orbit/shared/hooks";
import { useGoBackOrFallback } from "@/hooks/use-go-back-or-fallback";
import { useChatComposer } from "@/hooks/use-chat-composer";
import { MessageBubble } from "@/components/message-bubble";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { Composer } from "@/components/shell/composer";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { GoalDetailDrawer } from "@/components/goals/goal-detail-drawer";
import { AppBar } from "@/components/ui/app-bar";
import { AstraMark } from "@/components/ui/astra-avatar";
import { ErrorState } from "@/components/ui/error-state";
import { KeyboardAwareFlatList } from "@/components/ui/keyboard-aware-scroll-view";
import { createStyles } from "@/app/chat.styles";
import { createTokensV2 } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";
import { useOffline } from "@/hooks/use-offline";
import { useUIStore } from "@/stores/ui-store";

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
  const astraConversationOpen = useUIStore((state) => state.astraConversationOpen);
  const setAstraConversationOpen = useUIStore((state) => state.setAstraConversationOpen);
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
    speechError,
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

  const microphonePermissionDenied = speechError === t("speech.micDenied");

  const [initialMessageIds] = useState(() => new Set(messages.map((message) => message.id)));
  const [keyboardInset, setKeyboardInset] = useState(0);
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

  const handleActionChipClick = useCallback(
    (entityId: string, actionType: string) => {
      if (CHAT_GOAL_ACTION_TYPES.has(actionType)) {
        if (!hasProAccess) {
          router.push("/upgrade");
          return;
        }
        setSelectedGoalId(entityId);
        setGoalDrawerOpen(true);
        return;
      }

      setGoalDrawerOpen(false);
      router.push({ pathname: "/habits/[id]", params: { id: entityId } });
    },
    [hasProAccess, router],
  );

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
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <AppBar
          back
          onBack={() => {
            if (astraConversationOpen) setAstraConversationOpen(false);
            else goBackOrFallback("/");
          }}
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
              <ErrorState message={offlineDescription} />
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
          {microphonePermissionDenied ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.openSettings")}
              onPress={() => {
                void Linking.openSettings();
              }}
              style={({ pressed }) => ({
                minHeight: 44,
                alignSelf: "center",
                justifyContent: "center",
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{
                  color: tokens.fg2,
                  fontFamily: "Geist_500Medium",
                  fontSize: 14,
                  textDecorationLine: "underline",
                }}
              >
                {t("common.openSettings")}
              </Text>
            </Pressable>
          ) : null}
          <Composer {...composerProps} />
        </View>
      </KeyboardAvoidingView>

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
