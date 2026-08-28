import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  CHAT_STARTER_CHIP_KEYS,
  CHAT_STREAM_IDLE_TIMEOUT_MS,
  consumeChatSseStream,
  getChatImageValidationError,
  resolveChatImageMimeType,
} from "@orbit/shared/chat";
import {
  hasComposerContent,
  type ComposerProps,
  type ComposerSuggestions,
} from "@orbit/shared/contracts/composer";
import { goalKeys, habitKeys, profileKeys, tagKeys } from "@orbit/shared/query";
import type {
  AgentExecuteOperationResponse,
  ChatMessage,
  ChatResponse,
} from "@orbit/shared/types";
import type { Profile } from "@orbit/shared/types/profile";
import {
  buildAgentExecutionMessage,
  CHAT_DRAFT_STORAGE_KEY,
  classifySendFailure,
  findPremiumPolicyDenial,
  invalidateAgentQueries,
  selectActionInvalidations,
} from "@orbit/shared/hooks";
import {
  buildRecentChatHistory,
  canAccessEntitlement,
  detectDefaultTimeFormat,
  formatAccountMidnight,
  getFriendlyErrorMessage,
  resolveUpgradeEntitlementFromPolicyDenial,
} from "@orbit/shared/utils";
import { openChatStream } from "@/lib/chat-stream";
import { useProfile } from "@/hooks/use-profile";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import { usePendingOperationExecution } from "@/hooks/use-pending-operation-execution";
import { useChatStore } from "@/stores/chat-store";

interface AttemptedSend {
  content: string;
  image: ImagePicker.ImagePickerAsset | null;
  preview: string | null;
}

interface StreamSendFailure {
  status: number | null;
  error: string;
  code: string | null;
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return "name" in error && error.name === "AbortError";
}

interface ByteStreamReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  releaseLock(): void;
}

interface ByteStream {
  getReader(): ByteStreamReader;
}

async function* streamTextChunks(
  body: ByteStream,
  onActivity: () => void,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    let chunk = await reader.read();
    while (!chunk.done) {
      onActivity();
      if (chunk.value) yield decoder.decode(chunk.value, { stream: true });
      chunk = await reader.read();
    }
  } finally {
    reader.releaseLock();
  }
}

function buildImageFileName(asset: ImagePicker.ImagePickerAsset): string {
  const mimeType =
    resolveChatImageMimeType({
      mimeType: asset.mimeType,
      name: asset.fileName,
      uri: asset.uri,
    }) ?? "image/jpeg";

  const extension = mimeType.split("/")[1] ?? "jpg";

  return asset.fileName ?? `orbit-chat-image.${extension}`;
}

interface UseChatComposerOptions {
  isOnline: boolean;
  offlineTitle: string;
}

/**
 * Mobile chat-composer hook. Wraps the framework-agnostic
 * `@orbit/shared/hooks` core with React Native state and direct `apiClient`
 * I/O, mirroring the web `useChatComposer`. Offline gating is injected because
 * the offline UI itself lives on the screen.
 */
export function useChatComposer({ isOnline, offlineTitle }: UseChatComposerOptions) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useProfile();

  const messages = useChatStore((s) => s.messages);
  const isTyping = useChatStore((s) => s.isTyping);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const appendToMessageContent = useChatStore((s) => s.appendToMessageContent);
  const setIsTyping = useChatStore((s) => s.setIsTyping);
  const setStreamingMessageId = useChatStore((s) => s.setStreamingMessageId);

  const {
    isRecording,
    isTranscribing,
    isSupported: speechSupported,
    transcript,
    error: speechError,
    toggleRecording,
    recordingDuration,
  } = useSpeechToText();

  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const pendingVoiceCommit = useRef(false);

  const [input, setInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastFailedSend, setLastFailedSend] = useState<AttemptedSend | null>(null);
  const [selectedImage, setSelectedImage] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const hasProAccess = profile?.hasProAccess ?? false;
  const aiMessagesUsed = profile?.aiMessagesUsed ?? 0;
  const aiMessagesLimit = profile?.aiMessagesLimit ?? 20;
  const accountTimeZone = profile?.timeZone ?? null;
  const atMessageLimit = !hasProAccess && aiMessagesUsed >= aiMessagesLimit;
  const isSending = isTyping || streamingMessageId !== null;
  const showSuggestions = messages.length === 0 && !isTyping;

  const starterChips = useMemo(
    () => CHAT_STARTER_CHIP_KEYS.map((key) => t(key)),
    [t],
  );

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(CHAT_DRAFT_STORAGE_KEY).then((storedDraft) => {
      if (active && storedDraft) setInput(storedDraft);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (input.trim()) {
      void AsyncStorage.setItem(CHAT_DRAFT_STORAGE_KEY, input);
    } else {
      void AsyncStorage.removeItem(CHAT_DRAFT_STORAGE_KEY);
    }
  }, [input]);

  useEffect(() => {
    if (isRecording) {
      pendingVoiceCommit.current = true;
    } else if (pendingVoiceCommit.current && transcript.trim()) {
      pendingVoiceCommit.current = false;
      setInput((current) => current ? `${current} ${transcript.trim()}` : transcript.trim());
    }
  }, [isRecording, transcript]);

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

  const shouldRouteToUpgrade = useCallback(
    (resolution: { shouldUpgrade: boolean; requirement: "pro" | "yearlyPro" | null }) =>
      resolution.shouldUpgrade &&
      !canAccessEntitlement(profile, resolution.requirement),
    [profile],
  );

  const appendExecutionMessage = useCallback(
    async (response: AgentExecuteOperationResponse) => {
      addMessage({
        id: `msg-${Date.now()}-agent`,
        role: "ai",
        content: buildAgentExecutionMessage(response, {
          done: t("chat.operationDone"),
          failed: t("chat.operationFailed"),
        }),
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
    [addMessage, queryClient, router, scrollToBottom, shouldRouteToUpgrade, t],
  );

  useEffect(() => {
    if (!speechError) return;

    let active = true;
    void Promise.resolve().then(() => {
      if (active) setSendError(speechError);
    });
    const timer = setTimeout(() => {
      setSendError((current) => (current === speechError ? null : current));
    }, 4000);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [speechError]);

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
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setSendError(t("chat.imagePermissionError"));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"] as ImagePicker.MediaType[],
      allowsMultipleSelection: false,
      quality: 0.7,
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

  const handleFailedSend = useCallback(
    (
      failureInput: StreamSendFailure,
      attempted: AttemptedSend,
      draftMessageId: string | null,
    ) => {
      setIsTyping(false);
      const resolvedError = failureInput.error.trim() || t("chat.sendError");
      const failure = classifySendFailure({
        status: failureInput.status,
        code: failureInput.code,
        reason: resolvedError,
      });

      if (failure.kind === "upgrade" && shouldRouteToUpgrade(failure.upgrade)) {
        setSendError(t("chat.proGate.body"));
        router.push("/upgrade");
        return;
      }

      if (failure.kind === "timeout") {
        setSendError(t("chat.timeoutError"));
        setLastFailedSend(attempted);
      } else if (failure.kind === "limit") {
        setSendError(t("chat.limitReachedError"));
      } else {
        setSendError(t("chat.sendError"));
        setLastFailedSend(attempted);
      }

      if (draftMessageId) {
        updateMessage(draftMessageId, { content: t("chat.aiError") });
      } else {
        addMessage({
          id: `msg-${Date.now()}-err`,
          role: "ai",
          content: t("chat.aiError"),
          timestamp: new Date(),
        });
      }
      scrollToBottom();
    },
    [addMessage, router, scrollToBottom, setIsTyping, shouldRouteToUpgrade, t, updateMessage],
  );

  const applyFinalResponse = useCallback(
    async (response: ChatResponse, draftMessageId: string | null) => {
      setIsTyping(false);

      const finalFields = {
        content: response.aiMessage || "",
        actions: response.actions,
        operations: response.operations,
        pendingOperations: response.pendingOperations,
        policyDenials: response.policyDenials,
        correlationId: response.correlationId,
        relatedSurfaces: response.relatedSurfaces,
        habitList: response.habitList,
        goalList: response.goalList,
      };
      if (draftMessageId) {
        updateMessage(draftMessageId, finalFields);
      } else {
        const aiMessage: ChatMessage = {
          id: `msg-${Date.now()}-ai`,
          role: "ai",
          timestamp: new Date(),
          ...finalFields,
        };
        addMessage(aiMessage);
      }
      if (useChatStore.getState().streamingMessageId === draftMessageId) {
        setStreamingMessageId(null);
      }

      scrollToBottom();

      const premiumDenial = findPremiumPolicyDenial(response.policyDenials);
      if (premiumDenial) {
        const upgradeResolution =
          resolveUpgradeEntitlementFromPolicyDenial(premiumDenial);
        if (shouldRouteToUpgrade(upgradeResolution)) {
          router.push("/upgrade");
        }
      }

      if (!(profile?.hasProAccess ?? false)) {
        queryClient.setQueryData<Profile>(profileKeys.detail(), (current) =>
          current
            ? {
                ...current,
                aiMessagesUsed: current.aiMessagesUsed + 1,
              }
            : current,
        );
      }

      const invalidations = selectActionInvalidations(response.actions);
      if (invalidations.habits) {
        void queryClient.invalidateQueries({ queryKey: habitKeys.lists() });
      }
      if (invalidations.goals) {
        void queryClient.invalidateQueries({ queryKey: goalKeys.lists() });
      }
      if (invalidations.tags) {
        void queryClient.invalidateQueries({ queryKey: tagKeys.lists() });
      }

      if (response.operations?.some((operation) => operation.status === "Succeeded")) {
        await invalidateAgentQueries(queryClient);
      }
    },
    [
      addMessage,
      profile?.hasProAccess,
      queryClient,
      router,
      scrollToBottom,
      setIsTyping,
      setStreamingMessageId,
      shouldRouteToUpgrade,
      updateMessage,
    ],
  );

  const buildChatFormData = useCallback(
    (attempted: AttemptedSend) => {
      const formData = new FormData();
      formData.append("message", attempted.content);
      if (attempted.image) {
        formData.append(
          "image",
          new File(attempted.image.uri),
          buildImageFileName(attempted.image),
        );
      }

      const recentHistory = buildRecentChatHistory(useChatStore.getState().messages);
      formData.append("history", JSON.stringify(recentHistory));
      formData.append(
        "clientContext",
        JSON.stringify({
          platform: "mobile",
          locale: i18n.language,
          timeFormat: detectDefaultTimeFormat(i18n.language),
          currentAppArea: "chat",
          supportsHabitListCard: true,
          supportsGoalListCard: true,
        }),
      );
      return formData;
    },
    [i18n.language],
  );

  const runStreamingSend = useCallback(
    async (attempted: AttemptedSend) => {
      const controller = new AbortController();
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      const armIdleTimer = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => controller.abort(), CHAT_STREAM_IDLE_TIMEOUT_MS);
      };

      let draftMessageId: string | null = null;
      const ensureDraftMessage = () => {
        if (draftMessageId) return draftMessageId;
        draftMessageId = `msg-${Date.now()}-ai`;
        setStreamingMessageId(draftMessageId);
        setIsTyping(false);
        addMessage({
          id: draftMessageId,
          role: "ai",
          content: "",
          timestamp: new Date(),
        });
        scrollToBottom();
        return draftMessageId;
      };

      try {
        armIdleTimer();
        const response = await openChatStream(buildChatFormData(attempted), controller.signal);

        if (!response.ok || !response.body) {
          const errorBody = (await response.json().catch(() => null)) as
            | { error?: string; errorCode?: string }
            | null;
          handleFailedSend(
            {
              status: response.status,
              error: errorBody?.error ?? t("chat.sendError"),
              code: errorBody?.errorCode ?? null,
            },
            attempted,
            draftMessageId,
          );
          return;
        }

        const outcome = await consumeChatSseStream(
          streamTextChunks(response.body, armIdleTimer),
          {
            onDelta: (text) => {
              appendToMessageContent(ensureDraftMessage(), text);
              scrollToBottom();
            },
            onReset: () => {
              if (draftMessageId) updateMessage(draftMessageId, { content: "" });
              setIsTyping(true);
            },
          },
        );

        if (outcome.kind === "final") {
          await applyFinalResponse(outcome.response, draftMessageId);
          return;
        }
        if (outcome.kind === "error") {
          handleFailedSend(
            { status: outcome.status, error: outcome.error, code: outcome.code },
            attempted,
            draftMessageId,
          );
          return;
        }
        handleFailedSend(
          { status: null, error: t("chat.sendError"), code: null },
          attempted,
          draftMessageId,
        );
      } catch (err: unknown) {
        handleFailedSend(
          {
            status: isAbortError(err) ? 408 : null,
            error: getFriendlyErrorMessage(err, t, "chat.sendError", "generic"),
            code: null,
          },
          attempted,
          draftMessageId,
        );
      } finally {
        clearTimeout(idleTimer);
        if (useChatStore.getState().streamingMessageId === draftMessageId) {
          setStreamingMessageId(null);
        }
      }
    },
    [
      addMessage,
      appendToMessageContent,
      applyFinalResponse,
      buildChatFormData,
      handleFailedSend,
      scrollToBottom,
      setIsTyping,
      setStreamingMessageId,
      t,
      updateMessage,
    ],
  );

  const performSend = useCallback(
    async (attempted: AttemptedSend, isRetry: boolean) => {
      setSendError(null);
      setLastFailedSend(null);

      if (!isRetry) {
        const userMessage: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: "user",
          content: attempted.content,
          imageUrl: attempted.preview,
          timestamp: new Date(),
        };
        addMessage(userMessage);
      }

      scrollToBottom();
      setIsTyping(true);
      scrollToBottom();

      await runStreamingSend(attempted);
    },
    [addMessage, runStreamingSend, scrollToBottom, setIsTyping],
  );

  const sendMessage = useCallback(
    async (content?: string) => {
      const typedContent = content?.trim() ?? input.trim();
      const sendState = useChatStore.getState();
      if (
        !hasComposerContent(typedContent) ||
        sendState.isTyping ||
        sendState.streamingMessageId !== null
      ) return;
      if (!isOnline) {
        setSendError(offlineTitle);
        return;
      }

      const attempted: AttemptedSend = {
        content: typedContent,
        image: selectedImage,
        preview: imagePreview,
      };

      setInput("");
      setSelectedImage(null);
      setImagePreview(null);

      await performSend(attempted, false);
    },
    [
      imagePreview,
      input,
      isOnline,
      offlineTitle,
      performSend,
      selectedImage,
    ],
  );

  const retryLastSend = useCallback(async () => {
    const sendState = useChatStore.getState();
    if (!lastFailedSend || sendState.isTyping || sendState.streamingMessageId !== null) return;
    if (!isOnline) {
      setSendError(offlineTitle);
      return;
    }
    await performSend(lastFailedSend, true);
  }, [isOnline, lastFailedSend, offlineTitle, performSend]);

  const canRetryLastSend = lastFailedSend !== null && !isSending;

  const composerSuggestions = useMemo<ComposerSuggestions>(() => {
    const makeSuggestion = (key: (typeof CHAT_STARTER_CHIP_KEYS)[number]) => {
      const label = t(key);
      return { id: key, label, onSelect: () => void sendMessage(label) };
    };
    return [
      makeSuggestion(CHAT_STARTER_CHIP_KEYS[0]),
      makeSuggestion(CHAT_STARTER_CHIP_KEYS[1]),
      makeSuggestion(CHAT_STARTER_CHIP_KEYS[2]),
      makeSuggestion(CHAT_STARTER_CHIP_KEYS[3]),
    ];
  }, [sendMessage, t]);

  const composerProps = useMemo(() => {
    const words = {
      placeholder: t("shell.composer.placeholder"),
      send: t("shell.composer.send"),
      suggestionsLabel: t("shell.composer.suggestionsLabel"),
      retry: t("shell.composer.retry"),
    };
    const voiceWords = {
      start: t("shell.composer.voice.start"),
      stop: t("shell.composer.voice.stop"),
      recording: t("shell.composer.voice.recording"),
      transcribing: t("shell.composer.voice.transcribing"),
    };
    const imageName = selectedImage?.fileName ?? selectedImage?.uri.split("/").at(-1);
    const common = {
      words,
      value: input,
      onChangeValue: setInput,
      onSend: () => void sendMessage(),
      suggestions: composerSuggestions,
      onAttach: () => void openFilePicker(),
      attachWords: {
        add: t("shell.composer.attach.add"),
        trayLabel: t("shell.composer.attach.trayLabel"),
        remove: (name: string) => t("shell.composer.attach.remove", { name }),
      },
      attachments: selectedImage && imageName
        ? [{ id: "chat-image", kind: "image" as const, name: imageName }]
        : [],
      onAttachRemove: removeImage,
      ...(canRetryLastSend ? { onRetry: () => void retryLastSend() } : {}),
    };

    if (isRecording) return { ...common, state: "recording", onVoice: toggleRecording, voiceWords };
    if (isTranscribing) return { ...common, state: "transcribing", onVoice: toggleRecording, voiceWords };

    if (atMessageLimit) {
      const limitReason = accountTimeZone
        ? t("shell.composer.limit.reasonWithTime", {
            allowance: aiMessagesLimit,
            resetsAt: formatAccountMidnight(i18n.language, accountTimeZone),
          })
        : t("shell.composer.limit.reasonAtMidnight", { allowance: aiMessagesLimit });
      return speechSupported
        ? { ...common, state: "atLimit", limitReason, onVoice: toggleRecording, voiceWords }
        : { ...common, state: "atLimit", limitReason };
    }

    const state: "idle" | "sending" = isSending || !isOnline ? "sending" : "idle";
    return speechSupported
      ? { ...common, state, onVoice: toggleRecording, voiceWords }
      : { ...common, state };
  }, [
    aiMessagesLimit,
    atMessageLimit,
    canRetryLastSend,
    composerSuggestions,
    i18n.language,
    input,
    isOnline,
    isRecording,
    isSending,
    isTranscribing,
    openFilePicker,
    accountTimeZone,
    removeImage,
    retryLastSend,
    selectedImage,
    sendMessage,
    speechSupported,
    t,
    toggleRecording,
  ]) as ComposerProps;

  const {
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
  } = usePendingOperationExecution({ appendExecutionMessage });

  const handleBreakdownConfirmed = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: habitKeys.lists() });
  }, [queryClient]);

  return {
    flatListRef,
    messages,
    isTyping,
    isSending,
    streamingMessageId,
    sendError,
    input,
    setInput,
    selectedImage,
    imagePreview,
    composerProps,
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
    sendMessage,
    retryLastSend,
    canRetryLastSend,
    scrollToBottom,
    handleBreakdownConfirmed,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
  };
}
