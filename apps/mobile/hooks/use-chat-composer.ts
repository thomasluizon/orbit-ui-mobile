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
  getChatImageValidationError,
  resolveChatImageMimeType,
} from "@orbit/shared/chat";
import { goalKeys, habitKeys, profileKeys } from "@orbit/shared/query";
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
  extractBackendError,
  extractBackendErrorCode,
  extractBackendStatus,
  getErrorMessage,
  resolveUpgradeEntitlementFromPolicyDenial,
} from "@orbit/shared/utils";
import { apiClient } from "@/lib/api-client";
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
          correlationId: response.correlationId,
          timestamp: new Date(),
        };

        addMessage(aiMessage);
        scrollToBottom();

        const premiumDenial = findPremiumPolicyDenial(response.policyDenials);
        if (premiumDenial) {
          const upgradeResolution =
            resolveUpgradeEntitlementFromPolicyDenial(premiumDenial);
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

        const invalidations = selectActionInvalidations(response.actions);
        if (invalidations.habits) {
          queryClient.invalidateQueries({ queryKey: habitKeys.lists() });
        }
        if (invalidations.goals) {
          queryClient.invalidateQueries({ queryKey: goalKeys.lists() });
        }

        if (response.operations?.some((operation) => operation.status === "Succeeded")) {
          await invalidateAgentQueries(queryClient);
        }
      } catch (err: unknown) {
        setIsTyping(false);
        const resolvedError = getErrorMessage(err, t("chat.sendError"));
        const failure = classifySendFailure({
          status: extractBackendStatus(err) ?? null,
          code: extractBackendErrorCode(err) ?? null,
          reason: extractBackendError(err) ?? resolvedError,
        });

        if (failure.kind === "upgrade" && shouldRouteToUpgrade(failure.upgrade)) {
          setSendError(resolvedError);
          router.push("/upgrade");
          return;
        }

        if (failure.kind === "timeout") {
          setSendError(t("chat.timeoutError"));
        } else if (failure.kind === "limit") {
          setSendError(t("chat.limitReachedError"));
        } else {
          setSendError(resolvedError);
        }

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
      isOnline,
      isTyping,
      offlineTitle,
      queryClient,
      router,
      scrollToBottom,
      selectedImage,
      setIsTyping,
      shouldRouteToUpgrade,
      t,
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
    scrollToBottom,
    handleBreakdownConfirmed,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
  };
}
