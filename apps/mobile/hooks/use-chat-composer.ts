import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Keyboard, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { API } from "@orbit/shared/api";
import {
  CHAT_SPEECH_LANGUAGES as SPEECH_LANGUAGES,
  CHAT_STARTER_CHIP_KEYS,
  getChatImageValidationError,
  resolveChatImageMimeType,
} from "@orbit/shared/chat";
import { habitKeys, profileKeys } from "@orbit/shared/query";
import type { ChatMessage, ChatResponse } from "@orbit/shared/types/chat";
import type { Profile } from "@orbit/shared/types/profile";
import { buildRecentChatHistory, getErrorMessage } from "@orbit/shared/utils";
import { useProfile } from "@/hooks/use-profile";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import { apiClient } from "@/lib/api-client";
import { useOffline } from "@/hooks/use-offline";
import { useChatStore } from "@/stores/chat-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function useChatComposer() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useProfile();
  const { isOnline } = useOffline();
  const insets = useSafeAreaInsets();

  const flatListRef = useRef<{ scrollToEnd: (options?: { animated?: boolean }) => void } | null>(null);
  const prevIsRecording = useRef(false);

  const [input, setInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);

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

  const hasProAccess = profile?.hasProAccess ?? false;
  const aiMessagesUsed = profile?.aiMessagesUsed ?? 0;
  const aiMessagesLimit = profile?.aiMessagesLimit ?? 10;
  const atMessageLimit = !hasProAccess && aiMessagesUsed >= aiMessagesLimit;
  const canSend =
    (input.trim().length > 0 || selectedImage !== null) &&
    !isTyping &&
    !atMessageLimit &&
    !isRecording;
  const showSuggestions = messages.length === 0 && !isTyping;
  const offlineTitle = t("calendarSync.notConnected");
  const offlineDescription = `${t("chat.send")} / ${t("chat.attachImage")} / ${t("chat.toggleMic")}`;

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

  useEffect(() => {
    if (prevIsRecording.current && !isRecording && transcript.trim()) {
      setInput((current) =>
        current ? `${current} ${transcript.trim()}` : transcript.trim(),
      );
    }
    prevIsRecording.current = isRecording;
  }, [isRecording, transcript]);

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
      const messageContent = content ?? input.trim();
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
      setInput("");
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
          timestamp: new Date(),
        };

        addMessage(aiMessage);
        scrollToBottom();

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
          queryClient.invalidateQueries({ queryKey: habitKeys.lists() });
        }
      } catch (error: unknown) {
        setIsTyping(false);
        setSendError(getErrorMessage(error, t("chat.sendError")));

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
      input,
      isTyping,
      isOnline,
      offlineTitle,
      queryClient,
      scrollToBottom,
      selectedImage,
      setIsTyping,
      t,
    ],
  );

  const handleSend = useCallback(() => {
    void sendMessage();
  }, [sendMessage]);

  const handleBreakdownConfirmed = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: habitKeys.lists() });
  }, [queryClient]);

  return {
    router,
    isOnline,
    flatListRef,
    input,
    setInput,
    sendError,
    selectedImage,
    imagePreview,
    showLangPicker,
    setShowLangPicker,
    keyboardInset,
    safeAreaBottom: insets.bottom,
    hasProAccess,
    aiMessagesUsed,
    aiMessagesLimit,
    atMessageLimit,
    canSend,
    showSuggestions,
    offlineTitle,
    offlineDescription,
    currentLangFlag,
    starterChips,
    recordingTime,
    messages,
    isTyping,
    speechSupported,
    speechError,
    speechLang,
    setSpeechLang,
    toggleRecording,
    openFilePicker,
    removeImage,
    handleSend,
    handleBreakdownConfirmed,
    scrollToBottom,
  };
}
