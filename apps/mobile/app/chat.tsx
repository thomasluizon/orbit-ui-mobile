import { memo, useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useTourTarget } from "@/hooks/use-tour-target";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  StyleSheet,
  ScrollView,
  Animated,
  Image,
  Linking,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  SendHorizontal,
  Image as ImageIcon,
  Mic,
  Square,
  X,
  WifiOff,
  MoreHorizontal,
} from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { API } from "@orbit/shared/api";
import {
  CHAT_SPEECH_LANGUAGES as SPEECH_LANGUAGES,
  CHAT_STARTER_CHIP_KEYS,
  CHAT_VISUALIZER_BAR_OFFSETS as VISUALIZER_BAR_OFFSETS,
  getChatImageValidationError,
  resolveChatImageMimeType,
} from "@orbit/shared/chat";
import {
  apiKeyKeys,
  calendarKeys,
  gamificationKeys,
  goalKeys,
  habitKeys,
  notificationKeys,
  profileKeys,
  referralKeys,
  subscriptionKeys,
  tagKeys,
  userFactKeys,
} from "@orbit/shared/query";
import type {
  AgentExecuteOperationResponse,
  AgentStepUpChallenge,
  ChatMessage,
  ChatResponse,
  PendingAgentOperationConfirmation,
} from "@orbit/shared/types";
import type { Profile } from "@orbit/shared/types/profile";
import {
  buildRecentChatHistory,
  canAccessEntitlement,
  detectDefaultTimeFormat,
  getErrorMessage,
  habitDetailToNormalized,
  resolveUpgradeEntitlementFromError,
  resolveUpgradeEntitlementFromPolicyDenial,
} from "@orbit/shared/utils";
import { useAdMob } from "@/hooks/use-ad-mob";
import { useProfile } from "@/hooks/use-profile";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import { useHabitDetail } from "@/hooks/use-habits";
import { useGoBackOrFallback } from "@/hooks/use-go-back-or-fallback";
import { apiClient } from "@/lib/api-client";
import { MessageBubble } from "@/components/message-bubble";
import { SuggestionChips } from "@/components/chat/suggestion-chips";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { GoalDetailDrawer } from "@/components/goals/goal-detail-drawer";
import { HabitDetailDrawer } from "@/components/habits/habit-detail-drawer";
import { AppBar } from "@/components/ui/app-bar";
import { Chip } from "@/components/ui/chip";
import { AppTextInput } from "@/components/ui/app-text-input";
import { KeyboardAwareFlatList } from "@/components/ui/keyboard-aware-scroll-view";
import { useChatStore } from "@/stores/chat-store";
import { createTokensV2 } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";
import { useOffline } from "@/hooks/use-offline";
import { OfflineUnavailableState } from "@/components/ui/offline-unavailable-state";

// ---------------------------------------------------------------------------
// Animated Sparkle Icon for empty state
// ---------------------------------------------------------------------------

type Tokens = ReturnType<typeof createTokensV2>;
type ChatStyles = ReturnType<typeof createStyles>;

interface AdRewardResponse {
  bonusMessagesGranted: number;
  newLimit: number;
}

const HABIT_ACTION_TYPES = new Set([
  "CreateHabit",
  "LogHabit",
  "UpdateHabit",
  "DeleteHabit",
  "SkipHabit",
  "BulkLogHabits",
  "BulkSkipHabits",
  "CreateSubHabit",
  "AssignTags",
  "DuplicateHabit",
  "MoveHabit",
  "SuggestBreakdown",
]);

const GOAL_ACTION_TYPES = new Set([
  "CreateGoal",
  "UpdateGoal",
  "DeleteGoal",
  "UpdateGoalProgress",
  "UpdateGoalStatus",
  "LinkHabitsToGoal",
]);

const CHAT_DRAFT_STORAGE_KEY = "orbit-chat-draft";

type PendingExecutionResult =
  | { ok: true; response: AgentExecuteOperationResponse }
  | { ok: false; error: string };

type PreparedStepUpExecution =
  | {
      ok: true;
      challenge: AgentStepUpChallenge;
      confirmationToken: string;
    }
  | { ok: false; error: string };

function buildAgentExecutionMessage(response: AgentExecuteOperationResponse): string {
  return (
    response.operation.summary ??
    response.policyDenial?.reason ??
    response.operation.sourceName
  );
}

async function invalidateAgentQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: habitKeys.all }),
    queryClient.invalidateQueries({ queryKey: goalKeys.all }),
    queryClient.invalidateQueries({ queryKey: profileKeys.all }),
    queryClient.invalidateQueries({ queryKey: tagKeys.all }),
    queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    queryClient.invalidateQueries({ queryKey: calendarKeys.all }),
    queryClient.invalidateQueries({ queryKey: userFactKeys.all }),
    queryClient.invalidateQueries({ queryKey: gamificationKeys.all }),
    queryClient.invalidateQueries({ queryKey: subscriptionKeys.all }),
    queryClient.invalidateQueries({ queryKey: referralKeys.all }),
    queryClient.invalidateQueries({ queryKey: apiKeyKeys.all }),
  ]);
}

function AnimatedSparkle({
  primaryColor,
  styles,
}: Readonly<{
  primaryColor: string;
  styles: ChatStyles;
}>) {
  const scale = useMemo(() => new Animated.Value(1), []);
  const opacity = useMemo(() => new Animated.Value(0.7), []);
  const spin = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.1,
            duration: 1250,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 1250,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 1250,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.7,
            duration: 1250,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(spin, {
          toValue: 1,
          duration: 3200,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, scale, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={styles.sparkleOuter}>
      <Animated.View style={[styles.orbitRing, { transform: [{ rotate }] }]} />
      <View style={styles.sparkleGlow} />
      <Animated.View style={{ transform: [{ scale }], opacity }}>
        <Sparkles size={36} color={primaryColor} strokeWidth={1.3} />
      </Animated.View>
    </View>
  );
}

function AnimatedVisualizerBar({
  delay,
  styles,
}: Readonly<{
  delay: number;
  styles: ChatStyles;
}>) {
  const scale = useMemo(() => new Animated.Value(0.45), []);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1,
          duration: 520,
          delay,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.45,
          duration: 520,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [delay, scale]);

  return (
    <Animated.View
      style={[
        styles.visualizerBar,
        {
          transform: [{ scaleY: scale }],
        },
      ]}
    />
  );
}

function RecordingVisualizer({ styles }: Readonly<{ styles: ChatStyles }>) {
  return (
    <View style={styles.visualizer}>
      {VISUALIZER_BAR_OFFSETS.map((offset) => (
        <AnimatedVisualizerBar
          key={`bar-${offset}`}
          delay={Math.round(offset * 1000)}
          styles={styles}
        />
      ))}
    </View>
  );
}

interface ChatComposerInputProps {
  transcript: string;
  resetSignal: number;
  isRecording: boolean;
  isTyping: boolean;
  atMessageLimit: boolean;
  isOnline: boolean;
  selectedImagePresent: boolean;
  placeholder: string;
  tokens: Tokens;
  styles: ChatStyles;
  onSend: (message: string) => void;
}

const ChatComposerInput = memo(function ChatComposerInput({
  transcript,
  resetSignal,
  isRecording,
  isTyping,
  atMessageLimit,
  isOnline,
  selectedImagePresent,
  placeholder,
  tokens,
  styles,
  onSend,
}: Readonly<ChatComposerInputProps>) {
  const [draft, setDraft] = useState("");
  const prevIsRecording = useRef(false);

  useEffect(() => {
    let isMounted = true;

    void AsyncStorage.getItem(CHAT_DRAFT_STORAGE_KEY)
      .then((storedDraft) => {
        if (!isMounted || !storedDraft) return;
        setDraft(storedDraft);
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (prevIsRecording.current && !isRecording && transcript.trim()) {
      setDraft((current) =>
        current ? `${current} ${transcript.trim()}` : transcript.trim(),
      );
    }
    prevIsRecording.current = isRecording;
  }, [isRecording, transcript]);

  useEffect(() => {
     
    setDraft("");
    void AsyncStorage.removeItem(CHAT_DRAFT_STORAGE_KEY);
  }, [resetSignal]);

  useEffect(() => {
    if (!draft.trim()) {
      void AsyncStorage.removeItem(CHAT_DRAFT_STORAGE_KEY);
      return;
    }

    void AsyncStorage.setItem(CHAT_DRAFT_STORAGE_KEY, draft);
  }, [draft]);

  const canSend =
    (draft.trim().length > 0 || selectedImagePresent) &&
    !isTyping &&
    !atMessageLimit &&
    !isRecording;

  const handleSend = useCallback(() => {
    const message = draft.trim();
    if (!canSend || !isOnline) {
      return;
    }

    onSend(message);
    setDraft("");
  }, [canSend, draft, isOnline, onSend]);

  return (
    <>
      <AppTextInput
        style={[styles.textInput, { color: tokens.fg1 }]}
        value={draft}
        onChangeText={setDraft}
        placeholder={placeholder}
        placeholderTextColor={tokens.fg3}
        multiline
        maxLength={2000}
        editable={isOnline}
        returnKeyType="default"
        blurOnSubmit={false}
        onSubmitEditing={handleSend}
      />

      <TouchableOpacity
        style={[
          styles.sendButton,
          { backgroundColor: tokens.primary },
          !canSend && styles.sendButtonDisabled,
        ]}
        onPress={handleSend}
        disabled={!canSend || !isOnline}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSend || !isOnline }}
        activeOpacity={0.7}
      >
        <SendHorizontal size={14} color={tokens.fgOnPrimary} strokeWidth={2.2} />
      </TouchableOpacity>
    </>
  );
});

export default function ChatScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { currentScheme, currentTheme } = useAppTheme();
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const { isOnline } = useOffline();
  const goBackOrFallback = useGoBackOrFallback();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { profile } = useProfile();
  const {
    isInitialized: adMobReady,
    canClaimReward,
    rewardsClaimedToday,
    dailyRewardCap,
    shouldShowAds,
    showRewardedAd,
    markRewardClaimed,
  } = useAdMob();
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const chatAreaRef = useRef<View>(null);
  const chatInputRef = useRef<View>(null);
  const chatVoiceRef = useRef<View>(null);
  useTourTarget('tour-chat-area', chatAreaRef);
  useTourTarget('tour-chat-input', chatInputRef);
  useTourTarget('tour-chat-voice', chatVoiceRef);
  const messages = useChatStore((s) => s.messages);
  const isTyping = useChatStore((s) => s.isTyping);
  const addMessage = useChatStore((s) => s.addMessage);
  const setIsTyping = useChatStore((s) => s.setIsTyping);

  const {
    isRecording,
    isSupported: speechSupported,
    transcript,
    error: speechError,
    selectedLanguage: speechLang,
    setSelectedLanguage: setSpeechLang,
    toggleRecording,
    recordingDuration,
  } = useSpeechToText();

  const [sendError, setSendError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [isLoadingReward, setIsLoadingReward] = useState(false);
  const [rewardMessage, setRewardMessage] = useState<string | null>(null);
  const [composerResetSignal, setComposerResetSignal] = useState(0);

  const hasProAccess = profile?.hasProAccess ?? false;
  const aiMessagesUsed = profile?.aiMessagesUsed ?? 0;
  const aiMessagesLimit = profile?.aiMessagesLimit ?? 20;
  const atMessageLimit = !hasProAccess && aiMessagesUsed >= aiMessagesLimit;
  const adsEnabledForUser = shouldShowAds();
  const canWatchRewardAd =
    adsEnabledForUser && adMobReady && canClaimReward && !isLoadingReward;
  const showSuggestions = messages.length === 0 && !isTyping;
  const offlineTitle = t("calendarSync.notConnected");
  const offlineDescription = `${t("chat.send")} / ${t("chat.attachImage")} / ${t("chat.toggleMic")}`;

  const currentLangFlag = useMemo(
    () =>
      SPEECH_LANGUAGES.find((lang) => lang.value === speechLang)?.flag ??
      "\u{1F310}",
    [speechLang],
  );

  const shouldRouteToUpgrade = useCallback(
    (resolution: { shouldUpgrade: boolean; requirement: "pro" | "yearlyPro" | null }) =>
      resolution.shouldUpgrade &&
      !canAccessEntitlement(profile, resolution.requirement),
    [profile],
  );

  const starterChips = useMemo(
    () => CHAT_STARTER_CHIP_KEYS.map((key) => t(key)),
    [t],
  );

  const recordingTime = useMemo(() => {
    const mins = Math.floor(recordingDuration / 60);
    const secs = recordingDuration % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, [recordingDuration]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  const appendExecutionMessage = useCallback(
    async (response: AgentExecuteOperationResponse) => {
      addMessage({
        id: `msg-${Date.now()}-agent`,
        role: "ai",
        content: buildAgentExecutionMessage(response),
        operations: [response.operation],
        pendingOperations: response.pendingOperation
          ? [response.pendingOperation]
          : undefined,
        policyDenials: response.policyDenial ? [response.policyDenial] : undefined,
        timestamp: new Date(),
      });

      scrollToBottom();

        if (response.operation.status === "Succeeded") {
          await invalidateAgentQueries(queryClient);
        }
        if (response.policyDenial) {
          const upgradeResolution = resolveUpgradeEntitlementFromPolicyDenial(
            response.policyDenial,
          );
          if (shouldRouteToUpgrade(upgradeResolution)) {
            setSendError(response.policyDenial.reason);
            router.push("/upgrade");
          }
        }
      },
      [addMessage, queryClient, router, scrollToBottom, shouldRouteToUpgrade],
    );

  useEffect(() => {
    if (speechError) {
       
      setSendError(speechError);
      const timer = setTimeout(() => {
        setSendError((current) => (current === speechError ? null : current));
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [speechError]);

  useEffect(() => {
    if (isRecording) {
       
      setShowLangPicker(false);
    }
  }, [isRecording]);

  useEffect(() => {
    if (!isOnline) {
       
      setShowLangPicker(false);
    }
  }, [isOnline]);

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

  const validateImageAsset = useCallback(
    (asset: ImagePicker.ImagePickerAsset): string | null => {
      const validationError = getChatImageValidationError({
        mimeType: asset.mimeType,
        fileSize: asset.fileSize,
        name: asset.fileName,
        uri: asset.uri,
      });

      if (validationError === "type") return t("chat.imageError");
      if (validationError === "size") return t("chat.imageSizeError");
      return null;
    },
    [t],
  );

  const openFilePicker = useCallback(async () => {
    setShowLangPicker(false);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setSendError(t("chat.imagePermissionError"));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"] as ImagePicker.MediaType[],
      allowsMultipleSelection: false,
      quality: 1,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset) return;

    const validationError = validateImageAsset(asset);
    if (validationError) {
      setSendError(validationError);
      return;
    }

    setSendError(null);
    setSelectedImage(asset);
    setImagePreview(asset.uri);
  }, [t, validateImageAsset]);

  const removeImage = useCallback(() => {
    setSelectedImage(null);
    setImagePreview(null);
  }, []);

  function buildImageUpload(asset: ImagePicker.ImagePickerAsset): Blob {
    const mimeType =
      resolveChatImageMimeType({
        mimeType: asset.mimeType,
        name: asset.fileName,
        uri: asset.uri,
      }) ?? "image/jpeg";

    const extension = mimeType.split("/")[1] ?? "jpg";

    return {
      uri: asset.uri,
      type: mimeType,
      name: asset.fileName ?? `orbit-chat-image.${extension}`,
    } as unknown as Blob;
  }

  const sendMessage = useCallback(
    async (content?: string) => {
      const messageContent = content?.trim() ?? "";
      if ((!messageContent && !selectedImage) || isTyping) return;
      if (!isOnline) {
        setSendError(offlineTitle);
        return;
      }

      setSendError(null);
      setShowLangPicker(false);

      const attachedImage = selectedImage;
      const attachedPreview = imagePreview;

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "user",
        content: messageContent || "(image)",
        imageUrl: attachedPreview,
        timestamp: new Date(),
      };

      addMessage(userMessage);
      setComposerResetSignal((current) => current + 1);
      setSelectedImage(null);
      setImagePreview(null);
      scrollToBottom();
      setIsTyping(true);
      scrollToBottom();

      try {
        const formData = new FormData();
        if (messageContent) formData.append("message", messageContent);
        if (attachedImage) {
          formData.append("image", buildImageUpload(attachedImage));
        }

        const currentMessages = useChatStore.getState().messages;
        const recentHistory = buildRecentChatHistory(currentMessages);

        formData.append("history", JSON.stringify(recentHistory));
        formData.append(
          "clientContext",
          JSON.stringify({
            platform: "mobile",
            locale: i18n.language,
            timeFormat: detectDefaultTimeFormat(i18n.language),
            currentAppArea: "chat",
          }),
        );

        const response = await apiClient<ChatResponse>(API.chat.send, {
          method: "POST",
          body: formData,
        });

        setIsTyping(false);

        const aiMessage: ChatMessage = {
          id: `msg-${Date.now()}-ai`,
          role: "ai",
          content: response.aiMessage || "",
          actions: response.actions,
          operations: response.operations,
          pendingOperations: response.pendingOperations,
          policyDenials: response.policyDenials,
          timestamp: new Date(),
        };

        addMessage(aiMessage);
        scrollToBottom();

        const premiumDenial = response.policyDenials?.find((denial) =>
          resolveUpgradeEntitlementFromPolicyDenial(denial).shouldUpgrade,
        );
        if (premiumDenial) {
          const upgradeResolution = resolveUpgradeEntitlementFromPolicyDenial(
            premiumDenial,
          );
          setSendError(premiumDenial.reason);
          if (shouldRouteToUpgrade(upgradeResolution)) {
            router.push("/upgrade");
          }
        }

        if (!hasProAccess) {
          queryClient.setQueryData<Profile>(profileKeys.detail(), (current) =>
            current
              ? {
                  ...current,
                  aiMessagesUsed: (current.aiMessagesUsed ?? 0) + 1,
                }
              : current,
          );
        }

        if (response.actions?.some((action) => action.status === "Success")) {
          if (response.actions.some((action) => HABIT_ACTION_TYPES.has(action.type))) {
            queryClient.invalidateQueries({ queryKey: habitKeys.lists() });
          }
          if (response.actions.some((action) => GOAL_ACTION_TYPES.has(action.type))) {
            queryClient.invalidateQueries({ queryKey: goalKeys.lists() });
          }
        }

        if (response.operations?.some((operation) => operation.status === "Succeeded")) {
          await invalidateAgentQueries(queryClient);
        }
      } catch (err: unknown) {
        setIsTyping(false);
        const upgradeResolution = resolveUpgradeEntitlementFromError(err);
        if (shouldRouteToUpgrade(upgradeResolution)) {
          setSendError(getErrorMessage(err, t("chat.sendError")));
          router.push("/upgrade");
          return;
        }
        setSendError(getErrorMessage(err, t("chat.sendError")));

        const errorMessage: ChatMessage = {
          id: `msg-${Date.now()}-err`,
          role: "ai",
          content: t("chat.aiError"),
          timestamp: new Date(),
        };

        addMessage(errorMessage);
        scrollToBottom();
      }
    },
    [
      addMessage,
      hasProAccess,
      imagePreview,
      i18n.language,
      isTyping,
      router,
      queryClient,
      scrollToBottom,
      selectedImage,
      setIsTyping,
      shouldRouteToUpgrade,
      t,
      isOnline,
      offlineTitle,
    ],
  );

  const confirmAndExecutePendingOperation = useCallback(
    async (pendingOperationId: string): Promise<PendingExecutionResult> => {
      try {
        const confirmation = await apiClient<PendingAgentOperationConfirmation>(
          API.ai.pendingOperationConfirm(pendingOperationId),
          {
            method: "POST",
          },
        );

        const execution = await apiClient<AgentExecuteOperationResponse>(
          API.ai.pendingOperationExecute(pendingOperationId),
          {
            method: "POST",
            body: JSON.stringify({
              confirmationToken: confirmation.confirmationToken,
            }),
          },
        );

        await appendExecutionMessage(execution);
        return { ok: true, response: execution };
      } catch (error: unknown) {
        return { ok: false, error: getErrorMessage(error, t("chat.sendError")) };
      }
    },
    [appendExecutionMessage, t],
  );

  const preparePendingOperationStepUp = useCallback(
    async (pendingOperationId: string): Promise<PreparedStepUpExecution> => {
      try {
        const confirmation = await apiClient<PendingAgentOperationConfirmation>(
          API.ai.pendingOperationConfirm(pendingOperationId),
          {
            method: "POST",
          },
        );

        const challenge = await apiClient<AgentStepUpChallenge>(
          API.ai.pendingOperationStepUp(pendingOperationId),
          {
            method: "POST",
            body: JSON.stringify({ language: i18n.language }),
          },
        );

        return {
          ok: true,
          challenge,
          confirmationToken: confirmation.confirmationToken,
        };
      } catch (error: unknown) {
        return { ok: false, error: getErrorMessage(error, t("chat.sendError")) };
      }
    },
    [i18n.language, t],
  );

  const verifyAndExecutePendingOperationStepUp = useCallback(
    async (
      pendingOperationId: string,
      challengeId: string,
      code: string,
      confirmationToken: string,
    ): Promise<PendingExecutionResult> => {
      try {
        await apiClient<{ id: string } | null>(
          API.ai.pendingOperationVerifyStepUp(pendingOperationId),
          {
            method: "POST",
            body: JSON.stringify({ challengeId, code }),
          },
        );

        const execution = await apiClient<AgentExecuteOperationResponse>(
          API.ai.pendingOperationExecute(pendingOperationId),
          {
            method: "POST",
            body: JSON.stringify({ confirmationToken }),
          },
        );

        await appendExecutionMessage(execution);
        return { ok: true, response: execution };
      } catch (error: unknown) {
        return { ok: false, error: getErrorMessage(error, t("chat.sendError")) };
      }
    },
    [appendExecutionMessage, t],
  );

  const watchAdForMessages = useCallback(async () => {
    if (!canWatchRewardAd) {
      return;
    }

    setIsLoadingReward(true);
    setRewardMessage(null);
    setShowLangPicker(false);

    try {
      const rewardEarned = await showRewardedAd();
      if (!rewardEarned) {
        setRewardMessage(t("ads.rewardFailed"));
        return;
      }

      const response = await apiClient<AdRewardResponse>(API.subscription.adReward, {
        method: "POST",
      });

      markRewardClaimed();
      queryClient.setQueryData<Profile>(profileKeys.detail(), (current) =>
        current
          ? {
              ...current,
              aiMessagesLimit: response.newLimit,
            }
          : current,
      );
      setRewardMessage(t("ads.rewardGranted"));
    } catch {
      setRewardMessage(t("ads.rewardFailed"));
    } finally {
      setIsLoadingReward(false);
    }
  }, [
    canWatchRewardAd,
    markRewardClaimed,
    queryClient,
    showRewardedAd,
    t,
  ]);
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const handleBreakdownConfirmed = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: habitKeys.lists() });
  }, [queryClient]);

  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const habitDetailQuery = useHabitDetail(selectedHabitId);
  const detailHabit = useMemo(
    () => (habitDetailQuery.data ? habitDetailToNormalized(habitDetailQuery.data) : null),
    [habitDetailQuery.data],
  );

  const handleActionChipClick = useCallback((entityId: string, actionType: string) => {
    if (GOAL_ACTION_TYPES.has(actionType)) {
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
  }, [hasProAccess, router]);

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
        onPendingOperationPrepareStepUp={async (pendingOperationId) => {
          const result = await preparePendingOperationStepUp(pendingOperationId);
          if (!result.ok) {
            return { ok: false, error: result.error };
          }

          return {
            ok: true,
            challengeId: result.challenge.challengeId,
            confirmationToken: result.confirmationToken,
          };
        }}
        onPendingOperationVerifyStepUp={async (
          pendingOperationId,
          challengeId,
          code,
          confirmationToken,
        ) => {
          const result = await verifyAndExecutePendingOperationStepUp(
            pendingOperationId,
            challengeId,
            code,
            confirmationToken,
          );

          return result.ok
            ? { ok: true, response: result.response }
            : { ok: false, error: result.error };
        }}
      />
    ),
    [
      confirmAndExecutePendingOperation,
      handleActionChipClick,
      handleBreakdownConfirmed,
      preparePendingOperationStepUp,
      router,
      verifyAndExecutePendingOperationStepUp,
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
          onBack={() => goBackOrFallback("/")}
          backLabel={t("common.goBack")}
          LeadingIcon={Sparkles}
          title={t("chat.title")}
          trailing={
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("habits.actions.more")}
              activeOpacity={0.7}
              style={styles.iconBtn}
            >
              <MoreHorizontal
                size={17}
                color={tokens.fg2}
                strokeWidth={1.5}
              />
            </TouchableOpacity>
          }
        />

        {showSuggestions ? (
          <View ref={chatAreaRef} style={styles.emptyState}>
            <AnimatedSparkle primaryColor={tokens.fg1} styles={styles} />
            <Text style={[styles.emptyText, { color: tokens.fg2 }]}>
              {t("chat.suggestion.prompt")}
            </Text>
            <SuggestionChips
              onSelect={(suggestion) => {
                void sendMessage(suggestion);
              }}
            />
          </View>
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
          style={[
            styles.inputArea,
            {
              backgroundColor: tokens.bg,
              borderTopColor: tokens.hairline,
              paddingBottom: Math.max(16, insets.bottom + 12),
              marginBottom: Platform.OS === "android" ? keyboardInset : 0,
            },
          ]}
        >
          {sendError && (
            <Text style={[styles.errorText, { color: tokens.statusBad }]} accessibilityRole="alert">
              {sendError}
            </Text>
          )}
          {!isOnline && (
            <OfflineUnavailableState
              title={offlineTitle}
              description={offlineDescription}
              compact
            />
          )}
          {speechError === t("speech.micDenied") && (
            <TouchableOpacity
              style={styles.permissionAction}
              onPress={() => {
                void Linking.openSettings().catch(() => {});
              }}
              activeOpacity={0.75}
            >
              <Text style={[styles.permissionActionText, { color: tokens.fg1 }]}>
                {t("common.openSettings")}
              </Text>
            </TouchableOpacity>
          )}

          {imagePreview && (
            <View style={styles.imagePreviewRow}>
              <View style={styles.imagePreviewCard}>
                <Image
                  source={{ uri: imagePreview }}
                  style={[styles.imagePreview, { borderColor: tokens.hairline }]}
                />
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t("chat.removeImage")}
                  activeOpacity={0.8}
                  onPress={removeImage}
                  style={[
                    styles.imageRemoveButton,
                    { backgroundColor: tokens.bgElev, borderColor: tokens.hairlineStrong },
                  ]}
                >
                  <X size={12} color={tokens.fg1} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {messages.length > 0 && !isOnline ? (
            <View style={styles.offlineNotice}>
              <WifiOff size={15} color={tokens.fg3} strokeWidth={1.6} />
              <Text style={[styles.offlineText, { color: tokens.fg2 }]}>
                {offlineTitle}
              </Text>
            </View>
          ) : null}

          {messages.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickChipsContent}
              style={styles.quickChipsScroll}
            >
              {starterChips.map((chip) => (
                <Chip
                  key={chip}
                  onPress={() => sendMessage(chip)}
                  accessibilityLabel={chip}
                >
                  {chip}
                </Chip>
              ))}
            </ScrollView>
          )}

          <View
            style={[
              styles.inputBar,
              { borderTopColor: tokens.hairline },
            ]}
          >
            {isRecording ? (
              <>
                <View style={styles.recordingContent}>
                  <View style={styles.recordingStatus}>
                    <View
                      style={[
                        styles.recordingDot,
                        { backgroundColor: tokens.statusBad },
                      ]}
                    />
                    <Text style={[styles.recordingTime, { color: tokens.fg1 }]}>
                      {recordingTime}
                    </Text>
                  </View>
                  <RecordingVisualizer styles={styles} />
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t("chat.stopRecording")}
                  activeOpacity={0.7}
                  onPress={toggleRecording}
                  style={[
                    styles.stopButton,
                    { backgroundColor: tokens.fg1 },
                  ]}
                >
                  <Square size={11} color={tokens.bg} fill={tokens.bg} />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <ChatComposerInput
                  transcript={transcript}
                  resetSignal={composerResetSignal}
                  isRecording={isRecording}
                  isTyping={isTyping}
                  atMessageLimit={atMessageLimit}
                  isOnline={isOnline}
                  selectedImagePresent={selectedImage !== null}
                  placeholder={t("chat.placeholder")}
                  tokens={tokens}
                  styles={styles}
                  onSend={(message) => {
                    void sendMessage(message);
                  }}
                />

                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t("chat.attachImage")}
                  activeOpacity={0.7}
                  disabled={!isOnline}
                  onPress={() => {
                    void openFilePicker();
                  }}
                  style={styles.iconButton}
                >
                  <ImageIcon size={17} color={tokens.fg3} strokeWidth={1.5} />
                </TouchableOpacity>

                {speechSupported && (
                  <View ref={chatVoiceRef} style={styles.languageControl}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t("chat.toggleMic")}
                      activeOpacity={0.7}
                      disabled={isTyping || !isOnline}
                      onPress={toggleRecording}
                      style={styles.iconButton}
                    >
                      <Mic size={17} color={tokens.fg3} strokeWidth={1.5} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t("chat.speechLanguage")}
                      activeOpacity={0.7}
                      disabled={!isOnline}
                      onPress={() => setShowLangPicker((current) => !current)}
                      style={styles.languageFlagButton}
                    >
                      <Text style={styles.languageFlagText}>
                        {currentLangFlag}
                      </Text>
                    </TouchableOpacity>

                    {showLangPicker && (
                      <View
                        style={[
                          styles.languagePicker,
                          {
                            backgroundColor: tokens.bgElev,
                            borderColor: tokens.hairlineStrong,
                          },
                        ]}
                      >
                        {SPEECH_LANGUAGES.map((lang) => (
                          <TouchableOpacity
                            key={lang.value}
                            activeOpacity={0.7}
                            onPress={() => {
                              setSpeechLang(lang.value);
                              setShowLangPicker(false);
                            }}
                            style={[
                              styles.languageOption,
                              speechLang === lang.value && {
                                backgroundColor: tokens.bgSunk,
                              },
                            ]}
                          >
                            <Text style={styles.languageOptionFlag}>
                              {lang.flag}
                            </Text>
                            <Text
                              style={[
                                styles.languageOptionText,
                                { color: tokens.fg2 },
                                speechLang === lang.value && {
                                  color: tokens.fg1,
                                  fontWeight: "600",
                                },
                              ]}
                            >
                              {lang.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </>
            )}
          </View>

          {!hasProAccess && atMessageLimit && (
            <View style={styles.rewardCard}>
              <Text style={[styles.limitText, { color: tokens.statusOverdue }]} accessibilityLiveRegion="polite">
                {t("chat.limitReachedError")}
              </Text>
              {adsEnabledForUser ? (
                <>
                  <TouchableOpacity
                    style={[
                      styles.rewardButton,
                      { borderColor: tokens.hairlineStrong },
                      !canWatchRewardAd && styles.rewardButtonDisabled,
                    ]}
                    onPress={() => {
                      void watchAdForMessages();
                    }}
                    disabled={!canWatchRewardAd}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.rewardButtonText, { color: tokens.fg1 }]}>
                      {isLoadingReward
                        ? t("common.loading")
                        : t("ads.watchForMessages")}
                    </Text>
                  </TouchableOpacity>
                  <Text style={[styles.rewardMeta, { color: tokens.fg3 }]}>
                    {rewardsClaimedToday}/{dailyRewardCap}{" "}
                    {t("ads.dailyLimitReached")}
                  </Text>
                  {rewardMessage ? (
                    <Text style={[styles.rewardMessage, { color: tokens.fg2 }]}>{rewardMessage}</Text>
                  ) : null}
                </>
              ) : null}
            </View>
          )}
          {!hasProAccess && !atMessageLimit && (
            <Text style={[styles.usageText, { color: tokens.fg3 }]}>
              {aiMessagesUsed}/{aiMessagesLimit} {t("chat.messagesUsed")}
            </Text>
          )}
        </View>
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

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
    },
    keyboardAvoid: {
      flex: 1,
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 24,
      paddingHorizontal: 24,
    },
    sparkleOuter: {
      width: 132,
      height: 132,
      alignItems: "center",
      justifyContent: "center",
    },
    orbitRing: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: tokens.primary,
      opacity: 0.85,
    },
    sparkleGlow: {
      position: "absolute",
      top: 10,
      right: 10,
      bottom: 10,
      left: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: tokens.hairlineStrong,
    },
    emptyText: {
      fontFamily: "Geist",
      fontSize: 20,
      fontWeight: "600",
      letterSpacing: -0.2,
      textAlign: "center",
    },
    messageList: {
      paddingVertical: 16,
    },
    inputArea: {
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    errorText: {
      fontFamily: "Geist",
      fontSize: 13,
      textAlign: "center",
      marginBottom: 8,
    },
    permissionAction: {
      alignSelf: "center",
      marginBottom: 8,
      paddingVertical: 4,
    },
    permissionActionText: {
      fontFamily: "Geist",
      fontSize: 13,
      fontWeight: "500",
      textDecorationLine: "underline",
    },
    imagePreviewRow: {
      paddingBottom: 8,
    },
    imagePreviewCard: {
      alignSelf: "flex-start",
      position: "relative",
    },
    imagePreview: {
      width: 64,
      height: 64,
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
    },
    imageRemoveButton: {
      position: "absolute",
      top: -4,
      right: -4,
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: "center",
      justifyContent: "center",
    },
    quickChipsScroll: {
      marginBottom: 12,
    },
    quickChipsContent: {
      gap: 8,
      paddingRight: 16,
    },
    offlineNotice: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 8,
    },
    offlineText: {
      fontFamily: "Geist",
      fontSize: 13,
      fontStyle: "italic",
    },
    inputBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: 10,
      paddingHorizontal: 4,
      gap: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    iconButton: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    languageControl: {
      position: "relative",
      flexDirection: "row",
      alignItems: "center",
    },
    languageFlagButton: {
      paddingVertical: 4,
      paddingHorizontal: 4,
      borderRadius: 6,
    },
    languageFlagText: {
      fontSize: 12,
    },
    languagePicker: {
      position: "absolute",
      left: 0,
      bottom: 40,
      minWidth: 148,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      paddingVertical: 6,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.24,
      shadowRadius: 16,
      elevation: 8,
      zIndex: 20,
    },
    languageOption: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    languageOptionFlag: {
      fontSize: 13,
    },
    languageOptionText: {
      fontFamily: "Geist",
      fontSize: 12,
    },
    textInput: {
      flex: 1,
      minWidth: 0,
      fontFamily: "Geist",
      fontSize: 15,
      paddingVertical: 8,
      paddingHorizontal: 8,
      maxHeight: 120,
      minHeight: 36,
    },
    recordingContent: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 12,
    },
    recordingStatus: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    recordingDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    recordingTime: {
      fontFamily: "GeistMono",
      fontSize: 12,
      fontWeight: "500",
      fontVariant: ["tabular-nums"],
    },
    visualizer: {
      flex: 1,
      minHeight: 24,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    visualizerBar: {
      width: 3,
      height: 20,
      backgroundColor: tokens.fg2,
      borderRadius: 1,
    },
    sendButton: {
      width: 32,
      height: 32,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    sendButtonDisabled: {
      opacity: 0.4,
    },
    stopButton: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    limitText: {
      fontFamily: "Geist",
      fontSize: 11,
      textAlign: "center",
      fontWeight: "500",
    },
    rewardCard: {
      marginTop: 8,
      alignItems: "center",
      gap: 8,
    },
    rewardButton: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
    },
    rewardButtonDisabled: {
      opacity: 0.5,
    },
    rewardButtonText: {
      fontFamily: "Geist",
      fontSize: 12,
      fontWeight: "600",
      textAlign: "center",
    },
    rewardMeta: {
      fontFamily: "GeistMono",
      fontSize: 10,
      textAlign: "center",
      fontVariant: ["tabular-nums"],
    },
    rewardMessage: {
      fontFamily: "Geist",
      fontSize: 11,
      textAlign: "center",
      fontWeight: "500",
    },
    usageText: {
      fontFamily: "GeistMono",
      fontSize: 10,
      textAlign: "center",
      marginTop: 8,
      fontVariant: ["tabular-nums"],
    },
  });
}
