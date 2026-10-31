import { createAstraAllowanceTranslator ,
  buildRecentChatHistory,
  getFriendlyErrorMessage,
  formatAPIDateInTimeZone,
} from '@orbit/shared/utils'
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Linking } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  BlockAnswerSubmission,
  type ChatStreamRequest,
  type ChatStreamResult,
  type BlockAnswerRequest,
  type BlockAnswerResult,
  buildChatMessageWithFileContent,
  buildChatClientContext,
  buildChatFinalMessageFields,
  buildComposerChips,
  resolveComposerChipStatus,
  resolveComposerChipSurface,
  CHAT_STREAM_IDLE_TIMEOUT_MS,
  AI_MESSAGE_COUNTER_THRESHOLD,
  CHAT_TEXT_FILE_PICKER_MIME_TYPES,
  sendChatStreamTurn,
  ChatReplyLifecycle,
  enqueueChatPrompt,
  sendChatPrompt,
  sendQueuedChatPrompt,
  nextQueuedChatPrompt,
  needsNewChatTurn,
  getChatTurnFailure,
  ChatTurnReconciliation,
  type PreparedChatTurn,
  getChatImageValidationError,
  getChatTextFileValidationError,
  resolveChatImageMimeType,
} from "@orbit/shared/chat";
import {
  hasComposerContent,
  toComposerSuggestions,
  type ComposerProps,
} from "@orbit/shared/contracts/composer";
import { habitKeys, profileKeys } from "@orbit/shared/query";
import type {
  AgentExecuteOperationResponse,
  ChatClientContext,
  ChatMessage,
  ChatResponse,
} from "@orbit/shared/types";
import type { Profile } from "@orbit/shared/types/profile";
import {
  CHAT_DRAFT_STORAGE_KEY,
  createChatThreadScroll,
  classifySendFailure,
  invalidateAgentQueries,
  reconcileAgentQueries,
  settleChatResponse,
} from "@orbit/shared/hooks";
import { openChatStream } from "@/lib/chat-stream";
import { useProfile } from "@/hooks/use-profile";
import { useHabitDetail, useHabits } from "@/hooks/use-habit-queries";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import { usePendingOperationExecution } from "@/hooks/use-pending-operation-execution";
import { useChatStore } from "@/stores/chat-store";
import type { ChatStoreState } from "@orbit/shared/stores";
import { useUIStore } from "@/stores/ui-store";
import { useResetOnAccountChange } from "@/hooks/use-session-reset";
import { getAccountGeneration } from "@/lib/session-epoch";
import { usePrefersReducedMotion } from "@/lib/motion";

let nextChatMessageSequence = 0;

function createChatMessageId(): string {
  nextChatMessageSequence += 1;
  return `msg-${Date.now()}-${nextChatMessageSequence}`;
}

interface AttemptedSend {
  turn?: PreparedChatTurn<FormData>;
  content: string;
  draftContent: string;
  image: ImagePicker.ImagePickerAsset | null;
  preview: string | null;
  textFile: SelectedChatTextFile | null;
  restoreDraftOnFailure: boolean;
  clearDraftOnSuccess: boolean;
  restoredDraftRevision: number | null;
  messageOrigin?: 'followUp';
  selectedOfferKey?: ChatClientContext['selectedOfferKey']
  previousStartingStep?: ChatClientContext['previousStartingStep'];
  contextualRequest?: NonNullable<ChatStoreState['contextualSuggestion']>;
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
  body: ByteStream | null,
  onActivity: () => void,
): AsyncGenerator<string> {
  if (!body) return;
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
  const allowanceText = useMemo(() => createAstraAllowanceTranslator(t, profile, i18n.language), [t, profile, i18n.language])

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
  const queuedPrompts = useChatStore(state => state.queuedPrompts)
  const queuePaused = useChatStore(state => state.queuePaused)
  const queueReady = useChatStore(state => state.queueReady)
  const replyActive = useChatStore(state => state.replyActive)
  const stopReply = useRef<(() => void) | null>(null)

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
  const [threadScroll] = useState(createChatThreadScroll);
  const prefersReducedMotion = usePrefersReducedMotion();
  const prefersReducedMotionRef = useRef(prefersReducedMotion);
  useEffect(() => {
    prefersReducedMotionRef.current = prefersReducedMotion;
  }, [prefersReducedMotion]);
  const pendingVoiceCommit = useRef(false);

  const [sendError, setSendError] = useState<string | null>(null);
  const [activeSteps, setActiveSteps] = useState<{ domain: string; access: string }[]>([]);
  const activeStepsRef = useRef<{ domain: string; access: string }[]>([]);
  const [lastFailedSend, setLastFailedSend] = useState<AttemptedSend | null>(null);
  const [dailyBudgetDate, setDailyBudgetDate] = useState<string | null>(null);
  const [turnReconciliation] = useState(() => new ChatTurnReconciliation())
  const [blockSubmission] = useState(() => new BlockAnswerSubmission())
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
    turnReconciliation.reset()
    blockSubmission.reset()
    activeStepsRef.current = [];
    setActiveSteps([]);
    setLastFailedSend(null);
    setDailyBudgetDate(null);
    setSendError(null);
    setSelectedImage(null);
    setImagePreview(null);
    setSelectedTextFile(null);
    useUIStore.getState().setAstraConversationOpen(false);
  });

  const hasProAccess = profile?.hasProAccess ?? false;
  const aiMessagesUsed = profile?.aiMessagesUsed ?? 0;
  const aiMessagesLimit = profile?.aiMessagesLimit ?? (hasProAccess ? 50 : 5);
  const dailyBudgetReached = dailyBudgetDate === today;
  const atMessageLimit = dailyBudgetReached || aiMessagesUsed >= aiMessagesLimit;
  const isSending = replyActive || isTyping || streamingMessageId !== null;
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
  const showSuggestions = messages.length === 0 && !isTyping && !atMessageLimit;

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

  const scrollToBottom = useCallback((afterScroll?: () => void) => {
    setTimeout(() => {
      if (threadScroll.isFollowing()) flatListRef.current?.scrollToEnd({ animated: !prefersReducedMotionRef.current });
      afterScroll?.();
    }, 100);
  }, [threadScroll]);

  const handleExecutedOperation = useCallback(
    async (response: AgentExecuteOperationResponse) => {
      if (response.operation.status === "Succeeded") {
        await invalidateAgentQueries(queryClient);
      }
    },
    [queryClient],
  );

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
  }, [t, validateImageAsset, setSendError, setSelectedImage, setImagePreview]);

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
  }, [t, setSendError, setSelectedTextFile]);

  const removeTextFile = useCallback(() => {
    setSelectedTextFile(null);
  }, []);

  const handleDailyBudgetExceeded = useCallback((draftMessageId: string | null, attempted?: AttemptedSend) => {
    if (attempted?.clearDraftOnSuccess && attempted.restoredDraftRevision === useChatStore.getState().draftRevision) {
      setSelectedImage(attempted.image)
      setImagePreview(attempted.preview)
      setSelectedTextFile(attempted.textFile)
    }
    setDailyBudgetDate(today)
    setSendError(null)
    setLastFailedSend(null)
    if (draftMessageId) useChatStore.setState(state => ({ messages: state.messages.filter(message => message.id !== draftMessageId) }))
  }, [today, setDailyBudgetDate, setSendError, setLastFailedSend, setSelectedImage, setImagePreview, setSelectedTextFile])

  const handleAllowanceExceeded = useCallback((draftMessageId: string | null) => {
    setSendError(null)
    setLastFailedSend(null)
    const limitReason = allowanceText("chat.limitReachedError");
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
  }, [addMessage, allowanceText, scrollToBottom, setSendError, setLastFailedSend, updateMessage])

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
      if (attempted.restoreDraftOnFailure && !useChatStore.getState().draft) {
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

      if (failure.kind === 'dailyBudget') {
        handleDailyBudgetExceeded(draftMessageId, failedAttempt)
        return
      }

      if (failure.kind === "timeout") {
        setSendError(t("chat.timeoutError"));
        setLastFailedSend(failedAttempt);
      } else if (failure.kind === "limit") {
        handleAllowanceExceeded(draftMessageId);
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
    [addMessage, handleAllowanceExceeded, handleDailyBudgetExceeded, scrollToBottom, setInput, setIsTyping, t, updateMessage, setSendError, setLastFailedSend, setActiveSteps],
  );

  const applyFinalResponse = useCallback(
    async (response: ChatResponse, draftMessageId: string | null, toolSteps: { domain: string; access: string }[], firstReveal: Promise<void>, messageCost: 0 | 1, reply: ChatReplyLifecycle) => {
      if (!reply.isHidden() && draftMessageId && response.parts?.some(part => part?.type === 'block')) {
        await reply.waitForReveal(firstReveal);
        if (!reply.isHidden()) threadScroll.holdPosition();
      }
      if (!reply.isHidden()) {
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
      }
      if (!reply.isCancelled()) {
        const settlement = settleChatResponse(queryClient, response, messageCost)
        reply.finish(true)
        await settlement
      }
    },
    [
      addMessage,
      queryClient,
      scrollToBottom,
      setIsTyping,
      setStreamingMessageId,
      threadScroll,
      updateMessage,
    ],
  );

  const buildChatFormData = useCallback(
    (attempted: ChatStreamRequest<ImagePicker.ImagePickerAsset>) => {
      const formData = new FormData();
      formData.append("message", attempted.content);
      if (attempted.blockAnswer) formData.append("blockAnswer", JSON.stringify(attempted.blockAnswer));
      if (attempted.image) {
        formData.append(
          "image",
          new File(attempted.image.uri).slice(0, undefined, resolveChatImageMimeType(attempted.image) ?? undefined),
          buildImageFileName(attempted.image),
        );
      }

      const historyMessages = useChatStore.getState().messages;
      const recentHistory = buildRecentChatHistory(attempted.blockAnswer ? [...historyMessages, { role: 'user', content: attempted.content }] : historyMessages);
      formData.append("history", JSON.stringify(recentHistory));
      const entryPointIntent = useUIStore.getState().astraEntryPointIntent;
      const clientContext = buildChatClientContext({
        platform: "mobile",
        locale: i18n.language,
        uses24HourClock: profile?.uses24HourClock,
        messageOrigin: attempted.messageOrigin,
        previousStartingStep: attempted.previousStartingStep,
      selectedOfferKey: attempted.selectedOfferKey,
      conversationId: useChatStore.getState().ensureConversation(randomUUID()),
      dismissedOfferKeys: useChatStore.getState().dismissedOfferKeys,
        entryPointIntent,
      });
      formData.append("clientContext", JSON.stringify(clientContext));
      return formData;
    },
    [i18n.language, profile?.uses24HourClock],
  );

  const runStreamingSend = useCallback(
    async (attempted: ChatStreamRequest<ImagePicker.ImagePickerAsset> & { turn?: PreparedChatTurn<FormData> }, onAccepted?: () => void): Promise<ChatStreamResult> => {
      const startingAccountGeneration = getAccountGeneration();
      const ownsAccount = () => getAccountGeneration() === startingAccountGeneration;
      let controller = new AbortController();
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      const armIdleTimer = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => controller.abort(), CHAT_STREAM_IDLE_TIMEOUT_MS);
      };

      let draftMessageId: string | null = null;
      let finalReceived = false;
      const firstReveal = { completion: Promise.resolve() };
      const reply = new ChatReplyLifecycle({
        getChat: useChatStore.getState, ownsAccount, getDraftMessageId: () => draftMessageId,
        createMessageId: createChatMessageId, stoppedMessage: t('shell.composer.queue.stopped'),
        clearActivity: () => { activeStepsRef.current = []; setActiveSteps([]) }, abort: () => controller.abort(),
      })
      const acceptSelectedOffer = () => {
        if (ownsAccount() && attempted.selectedOfferKey) useChatStore.getState().dismissOffer(attempted.selectedOfferKey)
      }
      const { isCancelled, isHidden, stop } = reply
      stopReply.current = stop
      const ensureDraftMessage = () => {
        if (draftMessageId) return draftMessageId;
        draftMessageId = createChatMessageId();
        setStreamingMessageId(draftMessageId);
        setIsTyping(false);
        addMessage({
          id: draftMessageId,
          answerToBlockId: attempted.blockAnswer?.blockId,
          role: "ai",
          content: "",
          timestamp: new Date(),
        });
        firstReveal.completion = new Promise<void>((resolve) => scrollToBottom(resolve));
        return draftMessageId;
      };

      try {
        if (turnReconciliation.isPending) await turnReconciliation.reconcile(() => reconcileAgentQueries(queryClient));
        if (isHidden()) return { kind: 'cancelled' };
        attempted.turn ??= { key: randomUUID(), payload: buildChatFormData(attempted) };
        const outcome = await sendChatStreamTurn({
          turn: attempted.turn,
          isCancelled,
          open: async (turn) => {
            controller = new AbortController();
            armIdleTimer();
            const response = await openChatStream(turn.payload, controller.signal, turn.key);
            if (!response.ok) {
              const errorBody = (await response.json().catch(() => null)) as { error?: string; errorCode?: string; code?: string } | null;
              return { kind: 'httpError', status: response.status, error: errorBody?.error ?? t("chat.sendError"), code: errorBody?.code ?? errorBody?.errorCode ?? null };
            }
            if (ownsAccount()) onAccepted?.();
            return { kind: 'stream', chunks: streamTextChunks(response.body, armIdleTimer) };
          },
          callbacks: {
            onDelta: (text) => {
              if (isHidden()) return;
              appendToMessageContent(ensureDraftMessage(), text);
              scrollToBottom();
            },
            onReset: () => {
              if (isHidden()) return;
              if (draftMessageId) updateMessage(draftMessageId, { content: "" });
              setIsTyping(true);
            },
            onStep: (step) => {
              if (isHidden()) return;
              activeStepsRef.current = [...activeStepsRef.current, step];
              setActiveSteps(activeStepsRef.current);
            },
          },
        });

        if (outcome.kind === 'cancelled') return outcome;
        if (needsNewChatTurn(outcome)) attempted.turn = undefined;
        await turnReconciliation.reconcileAfterTurn(outcome, () => reconcileAgentQueries(queryClient));
        if (isHidden() && outcome.kind !== 'final') return { kind: 'cancelled' }

        if (outcome.kind === "final") {
          acceptSelectedOffer();
          await applyFinalResponse(outcome.response, draftMessageId, activeStepsRef.current, firstReveal.completion, attempted.messageCost, reply);
          finalReceived = reply.canComplete();
          return finalReceived ? { kind: 'final' } : { kind: 'cancelled' };
        }
        return { kind: 'failed', failure: getChatTurnFailure(outcome, t('chat.sendError')), draftMessageId }
      } catch (err: unknown) {
        if (isHidden()) return { kind: 'cancelled' };
        return { kind: 'failed', failure: {
            status: isAbortError(err) ? 408 : null,
            error: getFriendlyErrorMessage(err, allowanceText, "chat.sendError", "generic"),
            code: null,
          }, draftMessageId };
      } finally {
        clearTimeout(idleTimer);
        if (stopReply.current === stop) stopReply.current = null
        reply.finish(finalReceived);
      }
    },
    [allowanceText,
      addMessage,
      appendToMessageContent,
      applyFinalResponse,
      buildChatFormData,
      turnReconciliation,
      queryClient,
      scrollToBottom,
      setIsTyping,
      setStreamingMessageId,
      t,
      updateMessage,
    ],
  );

  const beginSend = useCallback(() => {
    useChatStore.getState().beginReply()
    threadScroll.followLatest();
    activeStepsRef.current = [];
    setActiveSteps([]);
    setSendError(null);
    setLastFailedSend(null);
    scrollToBottom();
    setIsTyping(true);
    scrollToBottom();
  }, [scrollToBottom, setIsTyping, threadScroll, setActiveSteps, setSendError, setLastFailedSend]);

  const performSend = useCallback((attempted: AttemptedSend, isRetry: boolean) => sendChatPrompt(attempted, isRetry, {
    conversation: useUIStore.getState(), getChat: useChatStore.getState, getAccountGeneration,
    createMessageId: createChatMessageId, beginSend, run: runStreamingSend,
    onFailure: handleFailedSend, retainRetry: setLastFailedSend,
  }), [beginSend, handleFailedSend, runStreamingSend, setLastFailedSend])

  const sendBlockAnswer = useCallback((request: BlockAnswerRequest): Promise<BlockAnswerResult> =>
    blockSubmission.send(request, {
      isOnline, atMessageLimit, dailyBudgetReached, onAllowanceExceeded: handleAllowanceExceeded, onDailyBudgetExceeded: handleDailyBudgetExceeded, locale: i18n.language,
      getChat: useChatStore.getState, createMessageId: createChatMessageId,
      conversation: useUIStore.getState(), beginSend, run: runStreamingSend,
      refreshProfile: () => queryClient.invalidateQueries({ queryKey: profileKeys.all }),
      words: { answered: content => t('chat.choice.answered', { options: content }),
        closed: t('chat.choice.closed'), alreadyAnswered: t('chat.choice.alreadyAnswered') },
    }), [atMessageLimit, beginSend, blockSubmission, dailyBudgetReached, handleAllowanceExceeded, handleDailyBudgetExceeded, isOnline, i18n.language, queryClient, runStreamingSend, t])
  const blockAnswerInteraction = { isOnline, isSending, atMessageLimit, dailyBudgetReached, allowance: aiMessagesLimit, limitReason: allowanceText('chat.choice.limit', { allowance: aiMessagesLimit }), send: sendBlockAnswer }

  const queueAttempt = useCallback((attempted: AttemptedSend, sendsComposerDraft: boolean) => {
    const accepted = enqueueChatPrompt(useChatStore.getState(), createChatMessageId(), attempted, performSend)
    if (!accepted) { setSendError(t('shell.composer.queue.full')); return }
    setSendError(null)
    if (sendsComposerDraft) {
      setInput('')
      setSelectedImage(null); setImagePreview(null); setSelectedTextFile(null)
    }
  }, [performSend, setInput, setSendError, t, setSelectedImage, setImagePreview, setSelectedTextFile])

  const sendMessage = useCallback(
    async (content?: string, requestContext?: 'followUp' | Pick<ChatClientContext, 'previousStartingStep' | 'selectedOfferKey'>, contextualRequest?: NonNullable<ChatStoreState['contextualSuggestion']>) => {
      const { messageOrigin, previousStartingStep, selectedOfferKey }: Pick<ChatClientContext, 'messageOrigin' | 'previousStartingStep' | 'selectedOfferKey'> =
        typeof requestContext === 'object' ? requestContext : { messageOrigin: requestContext };
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
      if (!isOnline) {
        setSendError(t("shell.composer.offline.reason"));
        return;
      }
      if (dailyBudgetReached) return;
      if (atMessageLimit) {
        setSendError(null);
        addMessage({
          id: createChatMessageId(),
          role: "ai",
          content: allowanceText("chat.limitReachedError"),
          timestamp: new Date(),
        });
        scrollToBottom();
        return;
      }

      const attempted: AttemptedSend = {
        content: messageContent,
        draftContent: sendsComposerDraft ? input : typedContent,
        image: sendsComposerDraft ? selectedImage : null,
        preview: sendsComposerDraft ? imagePreview : null,
        textFile: sendsComposerDraft ? selectedTextFile : null,
        restoreDraftOnFailure: content === undefined,
        clearDraftOnSuccess: content === undefined,
        restoredDraftRevision: null,
        messageOrigin,
        previousStartingStep,
        selectedOfferKey,
        contextualRequest,
      };

      if (sendState.replyActive || sendState.isTyping || sendState.streamingMessageId !== null) {
        queueAttempt(attempted, sendsComposerDraft)
        return
      }

      if (sendsComposerDraft) {
        setInput("");
        setSelectedImage(null);
        setImagePreview(null);
        setSelectedTextFile(null);
      }

      await performSend(attempted, false);
    },
    [allowanceText,
      queueAttempt, setSendError, setSelectedImage, setImagePreview, setSelectedTextFile,
      attachments,
      addMessage,
      atMessageLimit,
      dailyBudgetReached,
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

  const sendQueuedPrompt = useCallback((id: string) => sendQueuedChatPrompt(
    useChatStore.getState(), id, isOnline && !atMessageLimit, queryClient.getQueryData<Profile>(profileKeys.detail()),
  ), [atMessageLimit, isOnline, queryClient])

  useEffect(() => {
    const nextId = nextQueuedChatPrompt(useChatStore.getState())
    if (nextId) void sendQueuedPrompt(nextId)
  }, [isSending, queuePaused, queueReady, queuedPrompts, sendQueuedPrompt])

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
  }, [isOnline, lastFailedSend, offlineTitle, performSend, setInput, setSendError]);

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
      const label = providedLabel ?? t(key);
      const prompt = providedPrompt ?? (promptKey ? t(promptKey, params) : label);
      return { id, label, onSelect: () => {
        void sendMessage(prompt, undefined, contextualSuggestion?.id === id ? contextualSuggestion : undefined);
      } };
    }));
  }, [surface, chipStatus, habitsQuery.data, detailQuery.data, contextualSuggestion, totalHabitCount, profile, date, today, sendMessage, t]);

  const remainingMessages = aiMessagesLimit - aiMessagesUsed
  const nearMessageLimit = remainingMessages <= AI_MESSAGE_COUNTER_THRESHOLD
  const renewalHint = nearMessageLimit && !dailyBudgetReached ? allowanceText("shell.composer.limit.renewal") : undefined
  const allowanceReason = nearMessageLimit && !dailyBudgetReached ? allowanceText("shell.composer.limit.reason", { allowance: aiMessagesLimit }) : undefined

  const usageMessage = nearMessageLimit && !dailyBudgetReached && remainingMessages > 0
    ? allowanceText("shell.composer.usage", { used: aiMessagesUsed, limit: aiMessagesLimit }) : undefined

  const messageLimitReason = dailyBudgetReached ? t("chat.dailyBudgetReached") : allowanceText("shell.composer.limit.reason", { allowance: aiMessagesLimit })
  const messageLimitPlaceholder = dailyBudgetReached ? t('shell.composer.limit.placeholder') : allowanceText('shell.composer.limit.placeholder')

  const queue = useMemo(() => ({
    label: t('shell.composer.queue.label'),
    items: queuedPrompts,
    pausedReason: queuePaused ? t('shell.composer.queue.paused') : undefined,
    canSend: !isSending && isOnline && !atMessageLimit,
    removeLabel: (message: string) => t('shell.composer.queue.remove', { message }),
    sendLabel: (message: string) => t('shell.composer.queue.send', { message }),
    onRemove: (id: string) => { useChatStore.getState().removeQueuedPrompt(id); setSendError(null) },
    onSend: (id: string) => { void sendQueuedPrompt(id) },
  }), [atMessageLimit, isOnline, isSending, queuePaused, queuedPrompts, sendQueuedPrompt, setSendError, t])

  const speechRecovery = useMemo(() => speechError === t('speech.micDenied')
    ? { errorRecovery: { label: t('common.openSettings'), onSelect: () => { void Linking.openSettings() } } }
    : {}, [speechError, t])

  const composerProps = useMemo(() => {
    const words = {
      placeholder: t(isOnline ? "shell.composer.placeholder" : "shell.composer.offline.placeholder"),
      inputLabel: t("shell.composer.inputLabel"),
      ...(!isOnline ? { offlineReason: t("shell.composer.offline.reason") } : {}),
      send: t(isSending ? 'shell.composer.queue.add' : 'shell.composer.send'),
      clear: t("shell.composer.clear"),
      paste: t("shell.composer.paste"),
      nothingToPaste: t("shell.composer.nothingToPaste"),
      actions: t("shell.composer.actions"),
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
      queue,
      ...(isSending ? { replyControl: { label: t('shell.composer.queue.stop'), onStop: () => stopReply.current?.() } } : {}),
      usageMessage,
      renewalHint,
      allowanceReason,
      words,
      value: input,
      errorMessage: speechError ?? sendError ?? undefined,
      ...speechRecovery,
      onChangeValue: setInput,
      onSend: () => void sendMessage(),
      suggestions: composerSuggestions,
      onAttachFile: () => void openTextFilePicker(),
      onAttachImage: () => void openFilePicker(),
      attachWords: {
        file: t("shell.composer.attach.file"),
        image: t("shell.composer.attach.image"),
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
      const limitWords = { ...words, placeholder: messageLimitPlaceholder };
      const limitReason = messageLimitReason;
      return speechSupported
        ? { ...common, words: limitWords, suggestions: [] as const, state: "atLimit", limitReason, onVoice: toggleRecording, voiceWords }
        : { ...common, words: limitWords, suggestions: [] as const, state: "atLimit", limitReason };
    }

    const state: "idle" | "sending" = isSending ? "sending" : "idle";
    return speechSupported
      ? { ...common, state, onVoice: toggleRecording, voiceWords }
      : { ...common, state };
  }, [
    queue, speechRecovery,
    allowanceReason,
    usageMessage,
    renewalHint,
    attachments,
    atMessageLimit,
    messageLimitReason,
    messageLimitPlaceholder,
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
    sendError,
    speechError,
    speechSupported,
    t,
    toggleRecording,
  ]) as ComposerProps;

  const {
    revisePendingOperationForBubble,
    refreshPendingOperationForBubble,
    isPendingOperationBusy,
    trackCardOperation,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
  } = usePendingOperationExecution({ handleExecutedOperation });

  const handleBreakdownConfirmed = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: habitKeys.lists() });
    void queryClient.invalidateQueries({ queryKey: habitKeys.searches() });
  }, [queryClient]);

  return {
    blockAnswerInteraction,
    activeSteps,
    canShowFollowUps: isOnline && !isSending && !atMessageLimit && profile != null,
    isOnline,
    flatListRef,
    threadScroll,
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
    hasGoogleConnection: profile?.hasGoogleConnection ?? false,
    aiMessagesUsed,
    aiMessagesLimit,
    allowanceReason: allowanceText('shell.composer.limit.reason', { allowance: aiMessagesLimit }),
    atMessageLimit,
    dailyBudgetReached,
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
    isPendingOperationBusy,
    trackCardOperation,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
  };
}
