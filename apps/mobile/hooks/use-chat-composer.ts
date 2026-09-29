import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  buildChatMessageWithFileContent,
  buildChatClientContext,
  buildChatFinalMessageFields,
  buildComposerChips,
  resolveComposerChipStatus,
  resolveComposerChipSurface,
  CHAT_STREAM_IDLE_TIMEOUT_MS,
  CHAT_TEXT_FILE_PICKER_MIME_TYPES,
  consumeChatSseStream,
  getChatImageValidationError,
  getChatTextFileValidationError,
  resolveChatImageMimeType,
} from "@orbit/shared/chat";
import {
  hasComposerContent,
  toComposerSuggestions,
  type ComposerProps,
} from "@orbit/shared/contracts/composer";
import { goalKeys, habitKeys, profileKeys, tagKeys } from "@orbit/shared/query";
import type {
  AgentExecuteOperationResponse,
  ChatMessage,
  ChatResponse,
} from "@orbit/shared/types";
import type { Profile } from "@orbit/shared/types/profile";
import {
  CHAT_DRAFT_STORAGE_KEY,
  classifySendFailure,
  invalidateAgentQueries,
  selectActionInvalidations,
} from "@orbit/shared/hooks";
import {
  buildRecentChatHistory,
  getFriendlyErrorMessage,
  formatAPIDateInTimeZone,
} from "@orbit/shared/utils";
import { openChatStream } from "@/lib/chat-stream";
import { useProfile } from "@/hooks/use-profile";
import { useHabitDetail, useHabits } from "@/hooks/use-habit-queries";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import { usePendingOperationExecution } from "@/hooks/use-pending-operation-execution";
import { useChatStore } from "@/stores/chat-store";
import { useUIStore } from "@/stores/ui-store";
import { useResetOnAccountChange } from "@/hooks/use-session-reset";
import { getAccountGeneration } from "@/lib/session-epoch";

let nextChatMessageSequence = 0;

function createChatMessageId(): string {
  nextChatMessageSequence += 1;
  return `msg-${Date.now()}-${nextChatMessageSequence}`;
}

interface AttemptedSend {
  content: string;
  draftContent: string;
  image: ImagePicker.ImagePickerAsset | null;
  preview: string | null;
  restoreDraftOnFailure: boolean;
  clearDraftOnSuccess: boolean;
  restoredDraftRevision: number | null;
  messageOrigin?: 'followUp';
}

interface SelectedChatTextFile {
  name: string;
  content: string;
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
  pathname?: string;
  selectedDate?: string;
  today?: string;
  totalHabitCount?: number | null;
  includeGeneral?: boolean;
}

/**
 * Mobile chat-composer hook. Wraps the framework-agnostic
 * `@orbit/shared/hooks` core with React Native state and direct `apiClient`
 * I/O, mirroring the web `useChatComposer`. Offline gating is injected because
 * the offline UI itself lives on the screen.
 */
export function useChatComposer({ isOnline, offlineTitle, pathname = "/", selectedDate, today: currentDate, totalHabitCount, includeGeneral }: UseChatComposerOptions) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { profile } = useProfile();
  const contextualSuggestion = useChatStore((state) => state.contextualSuggestion);
  const calendarHasError = useUIStore((state) => state.calendarHasError);
  const today = currentDate ?? formatAPIDateInTimeZone(new Date(), profile?.timeZone);
  const date = selectedDate ?? today;
  const surface = resolveComposerChipSurface(pathname);
  const habitsQuery = useHabits(surface === "progress"
    ? {}
    : { dateFrom: date, dateTo: date, includeOverdue: date === today, includeGeneral: includeGeneral || undefined },
  { completeDay: true });
  const detailId = surface === "habitDetail" ? pathname.split("/")[2] ?? null : null;
  const detailQuery = useHabitDetail(detailId);

  const messages = useChatStore((s) => s.messages);
  const isTyping = useChatStore((s) => s.isTyping);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const appendToMessageContent = useChatStore((s) => s.appendToMessageContent);
  const setIsTyping = useChatStore((s) => s.setIsTyping);
  const setStreamingMessageId = useChatStore((s) => s.setStreamingMessageId);
  const input = useChatStore((s) => s.draft);
  const setInput = useChatStore((s) => s.setDraft);
  const draftHydrated = useChatStore((s) => s.draftHydrated);
  const hydrateDraft = useChatStore((s) => s.hydrateDraft);

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

  const [sendError, setSendError] = useState<string | null>(null);
  const [activeSteps, setActiveSteps] = useState<{ domain: string; access: string }[]>([]);
  const activeStepsRef = useRef<{ domain: string; access: string }[]>([]);
  const [lastFailedSend, setLastFailedSend] = useState<AttemptedSend | null>(null);
  const [selectedImage, setSelectedImage] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedTextFile, setSelectedTextFile] =
    useState<SelectedChatTextFile | null>(null);

  /**
   * The root layout keeps this hook mounted through an account change, so the previous account's
   * attempted send would otherwise stay armed behind Retry and post its text and image under the
   * next account's token. The store reset cannot reach React state, so it follows the session
   * itself, and every field added here is covered by the same subscription.
   */
  useResetOnAccountChange(() => {
    activeStepsRef.current = [];
    setActiveSteps([]);
    setLastFailedSend(null);
    setSendError(null);
    setSelectedImage(null);
    setImagePreview(null);
    setSelectedTextFile(null);
    useUIStore.getState().setAstraConversationOpen(false);
  });

  const hasProAccess = profile?.hasProAccess ?? false;
  const aiMessagesUsed = profile?.aiMessagesUsed ?? 0;
  const aiMessagesLimit = profile?.aiMessagesLimit ?? (hasProAccess ? 50 : 5);
  const atMessageLimit = aiMessagesUsed >= aiMessagesLimit;
  const isSending = isTyping || streamingMessageId !== null;
  const imageName = selectedImage?.fileName ?? selectedImage?.uri.split("/").at(-1);
  const attachments = useMemo(
    () => [
      ...(selectedTextFile
        ? [{ id: "chat-file", kind: "file" as const, name: selectedTextFile.name }]
        : []),
      ...(selectedImage && imageName
        ? [{ id: "chat-image", kind: "image" as const, name: imageName }]
        : []),
    ],
    [imageName, selectedImage, selectedTextFile],
  );
  const showSuggestions = messages.length === 0 && !isTyping;

  useEffect(() => {
    if (draftHydrated) return;
    let active = true;
    void AsyncStorage.getItem(CHAT_DRAFT_STORAGE_KEY).then((storedDraft) => {
      if (active) hydrateDraft(storedDraft);
    });
    return () => {
      active = false;
    };
  }, [draftHydrated, hydrateDraft]);

  useEffect(() => {
    if (!draftHydrated) return;
    if (input.trim()) {
      void AsyncStorage.setItem(CHAT_DRAFT_STORAGE_KEY, input);
    } else {
      void AsyncStorage.removeItem(CHAT_DRAFT_STORAGE_KEY);
    }
  }, [draftHydrated, input]);

  useEffect(() => {
    if (isRecording) {
      pendingVoiceCommit.current = true;
    } else if (pendingVoiceCommit.current && transcript.trim()) {
      pendingVoiceCommit.current = false;
      setInput((current) => current ? `${current} ${transcript.trim()}` : transcript.trim());
    }
  }, [isRecording, setInput, transcript]);

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

  const handleExecutedOperation = useCallback(
    async (response: AgentExecuteOperationResponse) => {
      if (response.operation.status === "Succeeded") {
        await invalidateAgentQueries(queryClient);
      }
    },
    [queryClient],
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
    const startingAccountGeneration = getAccountGeneration();
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (getAccountGeneration() !== startingAccountGeneration) return;
    if (!permission.granted) {
      setSendError(t("chat.imagePermissionError"));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"] as ImagePicker.MediaType[],
      allowsMultipleSelection: false,
      quality: 0.7,
    });
    if (getAccountGeneration() !== startingAccountGeneration) return;

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

  const openTextFilePicker = useCallback(async () => {
    const startingAccountGeneration = getAccountGeneration();
    const result = await DocumentPicker.getDocumentAsync({
      type: [...CHAT_TEXT_FILE_PICKER_MIME_TYPES],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (getAccountGeneration() !== startingAccountGeneration) return;
    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset) return;

    const file = new File(asset.uri);
    const validationError = getChatTextFileValidationError({
      name: asset.name,
      uri: asset.uri,
      fileSize: asset.size ?? file.size,
    });
    if (validationError === "type") {
      setSendError(t("chat.fileError"));
      return;
    }
    if (validationError === "size") {
      setSendError(t("chat.fileSizeError"));
      return;
    }

    try {
      const content = await file.text();
      if (getAccountGeneration() !== startingAccountGeneration) return;
      setSendError(null);
      setSelectedTextFile({ name: asset.name, content });
    } catch {
      if (getAccountGeneration() !== startingAccountGeneration) return;
      setSendError(t("chat.fileReadError"));
    }
  }, [t]);

  const removeTextFile = useCallback(() => {
    setSelectedTextFile(null);
  }, []);

  const handleFailedSend = useCallback(
    (
      failureInput: StreamSendFailure,
      attempted: AttemptedSend,
      draftMessageId: string | null,
    ) => {
      activeStepsRef.current = [];
      setActiveSteps([]);
      setIsTyping(false);
      let failedAttempt = attempted;
      if (attempted.restoreDraftOnFailure) {
        setInput(attempted.draftContent);
        failedAttempt = {
          ...attempted,
          restoreDraftOnFailure: false,
          restoredDraftRevision: useChatStore.getState().draftRevision,
        };
      }
      const resolvedError = failureInput.error.trim() || t("chat.sendError");
      const failure = classifySendFailure({
        status: failureInput.status,
        code: failureInput.code,
        reason: resolvedError,
      });

      if (failure.kind === "timeout") {
        setSendError(t("chat.timeoutError"));
        setLastFailedSend(failedAttempt);
      } else if (failure.kind === "limit") {
        setSendError(null);
        const limitReason = t("shell.composer.limit.reason", { allowance: aiMessagesLimit });
        if (draftMessageId) {
          updateMessage(draftMessageId, { content: limitReason });
        } else {
          addMessage({
            id: createChatMessageId(),
            role: "ai",
            content: limitReason,
            timestamp: new Date(),
          });
        }
        scrollToBottom();
        return;
      } else {
        setSendError(t("chat.sendError"));
        setLastFailedSend(failedAttempt);
      }

      if (draftMessageId) {
        updateMessage(draftMessageId, { content: t("chat.aiError") });
      } else {
        addMessage({
          id: createChatMessageId(),
          role: "ai",
          content: t("chat.aiError"),
          timestamp: new Date(),
        });
      }
      scrollToBottom();
    },
    [addMessage, aiMessagesLimit, scrollToBottom, setInput, setIsTyping, t, updateMessage],
  );

  const applyFinalResponse = useCallback(
    async (response: ChatResponse, draftMessageId: string | null, toolSteps: { domain: string; access: string }[]) => {
      setIsTyping(false);
      activeStepsRef.current = [];
      setActiveSteps([]);

      const finalFields = buildChatFinalMessageFields(response, toolSteps);
      if (draftMessageId) {
        updateMessage(draftMessageId, finalFields);
      } else {
        const aiMessage: ChatMessage = {
          id: createChatMessageId(),
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

      queryClient.setQueryData<Profile>(profileKeys.detail(), (current) =>
        current
          ? {
              ...current,
              aiMessagesUsed: current.aiMessagesUsed + 1,
            }
          : current,
      );

      const invalidations = selectActionInvalidations(response.actions);
      if (invalidations.habits || invalidations.tags) {
        void queryClient.invalidateQueries({ queryKey: habitKeys.searches() });
      }
      if (invalidations.habits) {
        void queryClient.invalidateQueries({ queryKey: habitKeys.lists() });
        void queryClient.invalidateQueries({ queryKey: profileKeys.all });
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
      queryClient,
      scrollToBottom,
      setIsTyping,
      setStreamingMessageId,
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
      const entryPointIntent = useUIStore.getState().astraEntryPointIntent;
      const clientContext = buildChatClientContext({
        platform: "mobile",
        locale: i18n.language,
        uses24HourClock: profile?.uses24HourClock,
        messageOrigin: attempted.messageOrigin,
        entryPointIntent,
      });
      formData.append("clientContext", JSON.stringify(clientContext));
      return formData;
    },
    [i18n.language, profile?.uses24HourClock],
  );

  const runStreamingSend = useCallback(
    async (attempted: AttemptedSend) => {
      const startingAccountGeneration = getAccountGeneration();
      const ownsAccount = () => getAccountGeneration() === startingAccountGeneration;
      const controller = new AbortController();
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      const armIdleTimer = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => controller.abort(), CHAT_STREAM_IDLE_TIMEOUT_MS);
      };

      let draftMessageId: string | null = null;
      const ensureDraftMessage = () => {
        if (draftMessageId) return draftMessageId;
        draftMessageId = createChatMessageId();
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

        if (!ownsAccount()) return false;

        if (!response.ok || !response.body) {
          const errorBody = (await response.json().catch(() => null)) as
            | { error?: string; errorCode?: string }
            | null;
          if (!ownsAccount()) return false;
          handleFailedSend(
            {
              status: response.status,
              error: errorBody?.error ?? t("chat.sendError"),
              code: errorBody?.errorCode ?? null,
            },
            attempted,
            draftMessageId,
          );
          return false;
        }

        const outcome = await consumeChatSseStream(
          streamTextChunks(response.body, armIdleTimer),
          {
            onDelta: (text) => {
              if (!ownsAccount()) return;
              appendToMessageContent(ensureDraftMessage(), text);
              scrollToBottom();
            },
            onReset: () => {
              if (!ownsAccount()) return;
              if (draftMessageId) updateMessage(draftMessageId, { content: "" });
              setIsTyping(true);
            },
            onStep: (step) => {
              if (!ownsAccount()) return;
              activeStepsRef.current = [...activeStepsRef.current, step];
              setActiveSteps(activeStepsRef.current);
            },
          },
        );

        if (!ownsAccount()) return false;

        if (outcome.kind === "final") {
          await applyFinalResponse(outcome.response, draftMessageId, activeStepsRef.current);
          return true;
        }
        if (outcome.kind === "error") {
          handleFailedSend(
            { status: outcome.status, error: outcome.error, code: outcome.code },
            attempted,
            draftMessageId,
          );
          return false;
        }
        handleFailedSend(
          { status: null, error: t("chat.sendError"), code: null },
          attempted,
          draftMessageId,
        );
        return false;
      } catch (err: unknown) {
        if (!ownsAccount()) return false;
        handleFailedSend(
          {
            status: isAbortError(err) ? 408 : null,
            error: getFriendlyErrorMessage(err, t, "chat.sendError", "generic"),
            code: null,
          },
          attempted,
          draftMessageId,
        );
        return false;
      } finally {
        clearTimeout(idleTimer);
        if (ownsAccount() && useChatStore.getState().streamingMessageId === draftMessageId) {
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
      activeStepsRef.current = [];
      setActiveSteps([]);
      setSendError(null);
      setLastFailedSend(null);

      if (!isRetry) {
        const userMessage: ChatMessage = {
          id: createChatMessageId(),
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

      return runStreamingSend(attempted);
    },
    [addMessage, runStreamingSend, scrollToBottom, setIsTyping],
  );

  const sendMessage = useCallback(
    async (content?: string, messageOrigin?: 'followUp') => {
      const sendsComposerDraft = content === undefined && messageOrigin !== 'followUp';
      const typedContent = content?.trim() ?? input.trim();
      const messageContent = selectedTextFile && sendsComposerDraft
        ? buildChatMessageWithFileContent({
            message: typedContent,
            fileLabel: t("chat.fileAttached", { name: selectedTextFile.name }),
            fileContent: selectedTextFile.content,
          })
        : typedContent;
      const sendState = useChatStore.getState();
      if (!hasComposerContent(typedContent, sendsComposerDraft ? attachments : [])) return;
      if (sendState.isTyping || sendState.streamingMessageId !== null) {
        setSendError(t("shell.composer.busy.reason"));
        return;
      }
      if (!isOnline) {
        setSendError(t("shell.composer.offline.reason"));
        return;
      }
      if (atMessageLimit) {
        setSendError(null);
        addMessage({
          id: createChatMessageId(),
          role: "ai",
          content: t("shell.composer.limit.reason", { allowance: aiMessagesLimit }),
          timestamp: new Date(),
        });
        scrollToBottom();
        return;
      }

      const attempted: AttemptedSend = {
        content: messageContent,
        draftContent: typedContent,
        image: sendsComposerDraft ? selectedImage : null,
        preview: sendsComposerDraft ? imagePreview : null,
        restoreDraftOnFailure: content === undefined,
        clearDraftOnSuccess: content === undefined,
        restoredDraftRevision: null,
        messageOrigin,
      };

      if (sendsComposerDraft) {
        setInput("");
        setSelectedImage(null);
        setImagePreview(null);
        setSelectedTextFile(null);
      }

      await performSend(attempted, false);
    },
    [
      attachments,
      addMessage,
      aiMessagesLimit,
      atMessageLimit,
      imagePreview,
      input,
      isOnline,
      performSend,
      selectedImage,
      selectedTextFile,
      setInput,
      scrollToBottom,
      t,
    ],
  );

  const retryLastSend = useCallback(async () => {
    const sendState = useChatStore.getState();
    if (!lastFailedSend || sendState.isTyping || sendState.streamingMessageId !== null) return;
    if (!isOnline) {
      setSendError(offlineTitle);
      return;
    }
    const attempted = lastFailedSend;
    const startingAccountGeneration = getAccountGeneration();
    const succeeded = await performSend(attempted, true);
    if (
      getAccountGeneration() === startingAccountGeneration &&
      succeeded &&
      attempted.clearDraftOnSuccess &&
      attempted.restoredDraftRevision !== null &&
      useChatStore.getState().draftRevision === attempted.restoredDraftRevision
    ) {
      setInput("");
      void AsyncStorage.removeItem(CHAT_DRAFT_STORAGE_KEY);
    }
  }, [isOnline, lastFailedSend, offlineTitle, performSend, setInput]);

  const canRetryLastSend = lastFailedSend !== null && !isSending;
  const chipStatus = resolveComposerChipStatus(surface, {
    habitsError: habitsQuery.isError,
    habitsReady: Boolean(habitsQuery.data),
    detailError: detailQuery.isError,
    detailReady: Boolean(detailQuery.data),
    calendarError: calendarHasError,
  });
  const composerSuggestions = useMemo(() => {
    const chips = buildComposerChips({
      surface,
      status: chipStatus,
      habits: habitsQuery.data?.topLevelHabits ?? [],
      selectedDateIsToday: date === today,
      totalHabitCount: totalHabitCount === undefined ? habitsQuery.data?.totalCount ?? null : totalHabitCount,
      profile: profile ?? null,
      detailHabit: detailQuery.data,
      contextualSuggestion,
    });
    return toComposerSuggestions(chips.map(({ id, key, params, promptKey, label: providedLabel, prompt: providedPrompt }) => {
      const label = providedLabel ?? t(key, params);
      const prompt = providedPrompt ?? (promptKey ? t(promptKey, params) : label);
      return { id, label, onSelect: () => {
        useUIStore.getState().setAstraConversationOpen(true);
        void sendMessage(prompt);
      } };
    }));
  }, [surface, chipStatus, habitsQuery.data, detailQuery.data, contextualSuggestion, totalHabitCount, profile, date, today, sendMessage, t]);

  const composerProps = useMemo(() => {
    const words = {
      placeholder: t(isOnline ? "shell.composer.placeholder" : "shell.composer.offline.placeholder"),
      inputLabel: t("shell.composer.placeholder"),
      ...(!isOnline ? { offlineReason: t("shell.composer.offline.reason") } : {}),
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
    const common = {
      words,
      value: input,
      onChangeValue: setInput,
      onSend: () => void sendMessage(),
      suggestions: composerSuggestions,
      onAttachFile: () => void openTextFilePicker(),
      onAttachImage: () => void openFilePicker(),
      attachWords: {
        file: t("chat.attachFile"),
        image: t("chat.attachImage"),
        trayLabel: t("shell.composer.attach.trayLabel"),
        remove: (name: string) => t("shell.composer.attach.remove", { name }),
      },
      attachments,
      onAttachRemove: (id: string) => {
        if (id === "chat-file") removeTextFile();
        if (id === "chat-image") removeImage();
      },
      ...(canRetryLastSend ? { onRetry: () => void retryLastSend() } : {}),
    };

    if (isRecording) return { ...common, state: "recording", onVoice: toggleRecording, voiceWords };
    if (isTranscribing) return { ...common, state: "transcribing", onVoice: toggleRecording, voiceWords };

    if (!isOnline) {
      const limitReason = t("shell.composer.offline.reason");
      return speechSupported
        ? { ...common, state: "offline", limitReason, onVoice: toggleRecording, voiceWords }
        : { ...common, state: "offline", limitReason };
    }

    if (atMessageLimit) {
      const limitReason = t("shell.composer.limit.reason", { allowance: aiMessagesLimit });
      return speechSupported
        ? { ...common, state: "atLimit", limitReason, onVoice: toggleRecording, voiceWords }
        : { ...common, state: "atLimit", limitReason };
    }

    const state: "idle" | "sending" = isSending ? "sending" : "idle";
    return speechSupported
      ? { ...common, state, onVoice: toggleRecording, voiceWords }
      : { ...common, state };
  }, [
    aiMessagesLimit,
    attachments,
    atMessageLimit,
    canRetryLastSend,
    composerSuggestions,
    input,
    isOnline,
    isRecording,
    isSending,
    isTranscribing,
    openFilePicker,
    openTextFilePicker,
    removeImage,
    removeTextFile,
    retryLastSend,
    setInput,
    sendMessage,
    speechSupported,
    t,
    toggleRecording,
  ]) as ComposerProps;

  const {
    revisePendingOperationForBubble,
    refreshPendingOperationForBubble,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
  } = usePendingOperationExecution({ handleExecutedOperation });

  const handleBreakdownConfirmed = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: habitKeys.lists() });
    void queryClient.invalidateQueries({ queryKey: habitKeys.searches() });
  }, [queryClient]);

  return {
    activeSteps,
    canShowFollowUps: isOnline && !isSending && !atMessageLimit && profile != null,
    isOnline,
    flatListRef,
    messages,
    isTyping,
    isSending,
    streamingMessageId,
    sendError,
    input,
    setInput,
    selectedImage,
    selectedTextFile,
    imagePreview,
    composerProps,
    isRecording,
    isTranscribing,
    speechSupported,
    transcript,
    speechError,
    toggleRecording,
    recordingTime,
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
    revisePendingOperationForBubble,
    refreshPendingOperationForBubble,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
  };
}
