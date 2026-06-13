import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { API } from "@orbit/shared/api";
import {
  CHAT_STARTER_CHIP_KEYS,
  CHAT_SPEECH_LANGUAGES as SPEECH_LANGUAGES,
  CHAT_STREAM_IDLE_TIMEOUT_MS,
  consumeChatSseStream,
  getChatImageValidationError,
  resolveChatImageMimeType,
} from "@orbit/shared/chat";
import { goalKeys, habitKeys, profileKeys, tagKeys } from "@orbit/shared/query";
import type {
  AgentExecuteOperationResponse,
  AgentStepUpChallenge,
  ChatMessage,
  ChatResponse,
  PendingAgentOperationConfirmation,
} from "@orbit/shared/types";
import type { Profile } from "@orbit/shared/types/profile";
import {
  buildAgentExecutionMessage,
  classifySendFailure,
  findPremiumPolicyDenial,
  invalidateAgentQueries,
  selectActionInvalidations,
} from "@orbit/shared/hooks";
import {
  buildRecentChatHistory,
  canAccessEntitlement,
  detectDefaultTimeFormat,
  getErrorMessage,
  resolveUpgradeEntitlementFromPolicyDenial,
} from "@orbit/shared/utils";
import { apiClient } from "@/lib/api-client";
import { openChatStream } from "@/lib/chat-stream";
import { useProfile } from "@/hooks/use-profile";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import { useChatStore } from "@/stores/chat-store";

interface RNFileUpload {
  uri: string;
  type: string;
  name: string;
}

declare global {
  interface FormData {
    append(name: string, value: RNFileUpload): void;
  }
}

export type PendingExecutionResult =
  | { ok: true; response: AgentExecuteOperationResponse }
  | { ok: false; error: string };

export type PreparedStepUpExecution =
  | {
      ok: true;
      challenge: AgentStepUpChallenge;
      confirmationToken: string;
    }
  | { ok: false; error: string };

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
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onActivity();
      if (value) yield decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

function buildImageUpload(asset: ImagePicker.ImagePickerAsset): RNFileUpload {
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
  };
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
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const appendToMessageContent = useChatStore((s) => s.appendToMessageContent);
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

  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  const [sendError, setSendError] = useState<string | null>(null);
  const [lastFailedSend, setLastFailedSend] = useState<AttemptedSend | null>(null);
  const [selectedImage, setSelectedImage] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [composerResetSignal, setComposerResetSignal] = useState(0);

  const hasProAccess = profile?.hasProAccess ?? false;
  const aiMessagesUsed = profile?.aiMessagesUsed ?? 0;
  const aiMessagesLimit = profile?.aiMessagesLimit ?? 20;
  const atMessageLimit = !hasProAccess && aiMessagesUsed >= aiMessagesLimit;
  const showSuggestions = messages.length === 0 && !isTyping;

  const currentLangFlag = useMemo(
    () =>
      SPEECH_LANGUAGES.find((lang) => lang.value === speechLang)?.flag ??
      "\u{1F310}",
    [speechLang],
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

      scrollToBottom();

      const premiumDenial = findPremiumPolicyDenial(response.policyDenials);
      if (premiumDenial) {
        const upgradeResolution =
          resolveUpgradeEntitlementFromPolicyDenial(premiumDenial);
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

      const invalidations = selectActionInvalidations(response.actions);
      if (invalidations.habits) {
        queryClient.invalidateQueries({ queryKey: habitKeys.lists() });
      }
      if (invalidations.goals) {
        queryClient.invalidateQueries({ queryKey: goalKeys.lists() });
      }
      if (invalidations.tags) {
        queryClient.invalidateQueries({ queryKey: tagKeys.lists() });
      }

      if (response.operations?.some((operation) => operation.status === "Succeeded")) {
        await invalidateAgentQueries(queryClient);
      }
    },
    [
      addMessage,
      hasProAccess,
      queryClient,
      router,
      scrollToBottom,
      setIsTyping,
      shouldRouteToUpgrade,
      updateMessage,
    ],
  );

  const buildChatFormData = useCallback(
    (attempted: AttemptedSend) => {
      const formData = new FormData();
      if (attempted.content) formData.append("message", attempted.content);
      if (attempted.image) {
        formData.append("image", buildImageUpload(attempted.image));
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
            error: getErrorMessage(err, t("chat.sendError")),
            code: null,
          },
          attempted,
          draftMessageId,
        );
      } finally {
        clearTimeout(idleTimer);
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
          content: attempted.content || "(image)",
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
      const messageContent = content?.trim() ?? "";
      if ((!messageContent && !selectedImage) || isTyping) return;
      if (!isOnline) {
        setSendError(offlineTitle);
        return;
      }

      setShowLangPicker(false);

      const attempted: AttemptedSend = {
        content: messageContent,
        image: selectedImage,
        preview: imagePreview,
      };

      setComposerResetSignal((current) => current + 1);
      setSelectedImage(null);
      setImagePreview(null);

      await performSend(attempted, false);
    },
    [imagePreview, isOnline, isTyping, offlineTitle, performSend, selectedImage],
  );

  const retryLastSend = useCallback(async () => {
    if (!lastFailedSend || isTyping) return;
    if (!isOnline) {
      setSendError(offlineTitle);
      return;
    }
    await performSend(lastFailedSend, true);
  }, [isOnline, isTyping, lastFailedSend, offlineTitle, performSend]);

  const canRetryLastSend = lastFailedSend !== null && !isTyping;

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

  const handleBreakdownConfirmed = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: habitKeys.lists() });
  }, [queryClient]);

  const prepareStepUpForBubble = useCallback(
    async (pendingOperationId: string) => {
      const result = await preparePendingOperationStepUp(pendingOperationId);
      if (!result.ok) {
        return { ok: false as const, error: result.error };
      }
      return {
        ok: true as const,
        challengeId: result.challenge.challengeId,
        confirmationToken: result.confirmationToken,
      };
    },
    [preparePendingOperationStepUp],
  );

  const verifyStepUpForBubble = useCallback(
    async (
      pendingOperationId: string,
      challengeId: string,
      code: string,
      confirmationToken: string,
    ) => {
      const result = await verifyAndExecutePendingOperationStepUp(
        pendingOperationId,
        challengeId,
        code,
        confirmationToken,
      );
      return result.ok
        ? { ok: true as const, response: result.response }
        : { ok: false as const, error: result.error };
    },
    [verifyAndExecutePendingOperationStepUp],
  );

  return {
    flatListRef,
    messages,
    isTyping,
    sendError,
    selectedImage,
    imagePreview,
    showLangPicker,
    setShowLangPicker,
    composerResetSignal,
    isRecording,
    speechSupported,
    transcript,
    speechError,
    speechLang,
    setSpeechLang,
    toggleRecording,
    recordingTime,
    currentLangFlag,
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
