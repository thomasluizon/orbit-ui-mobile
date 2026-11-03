import { retryComposerSend,createComposerFailureHandlers,runComposerStream,settleComposerResponse,CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import { isChatReplyActive,prepareConversationSend,resolveChatRequestContext } from '@orbit/shared/chat'
import { conversationHistory } from '@/lib/conversation-history'
import { buildRecentChatHistory } from '@orbit/shared/utils'
import { randomUUID } from 'expo-crypto'
import { useCallback,useEffect } from "react"
import * as ImagePicker from "expo-image-picker"
import { File } from "expo-file-system"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useTranslation } from "react-i18next"
import { type ChatStreamRequest,type BlockAnswerRequest,type BlockAnswerResult,buildChatMessageWithFileContent,buildChatClientContext,sendChatStreamTurn,enqueueChatPrompt,sendChatPrompt,sendQueuedChatPrompt,nextQueuedChatPrompt,type PreparedChatTurn,resolveChatImageMimeType } from "@orbit/shared/chat"
import { hasComposerContent } from "@orbit/shared/contracts/composer"
import { habitKeys,profileKeys } from "@orbit/shared/query"
import type { ChatClientContext } from "@orbit/shared/types"
import type { Profile } from "@orbit/shared/types/profile"
import { openChatStream } from "@/lib/chat-stream"
import { useChatStore } from "@/stores/chat-store"
import type { ChatStoreState } from "@orbit/shared/stores"
import { useUIStore } from "@/stores/ui-store"
import { getAccountGeneration } from "@/lib/session-epoch"
import type { ByteStream,AttemptedSend,UseChatComposerOptions } from './use-chat-composer-types'
import { type useChatComposerAttachmentState,buildImageFileName } from './use-chat-composer-attachments'
import type { ChatComposerState,useChatComposerScroll,useChatComposerAvailability } from './use-chat-composer-state'

let nextChatMessageSequence = 0

function createChatMessageId(): string {
  nextChatMessageSequence += 1
  return `msg-${Date.now()}-${nextChatMessageSequence}`
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  return "name" in error && error.name === "AbortError"
}

async function* streamTextChunks(
  body: ByteStream | null,
  onActivity: () => void,
): AsyncGenerator<string> {
  if (!body) return
  const reader = body.getReader()
  const decoder = new TextDecoder()
  try {
    let chunk = await reader.read()
    while (!chunk.done) {
      onActivity()
      if (chunk.value) yield decoder.decode(chunk.value, { stream: true })
      chunk = await reader.read()
    }
  } finally {
    reader.releaseLock()
  }
}

function createComposerStreamTransport({ attempted: _attempted, resetController, armIdleTimer, ownsAccount, onAccepted, t }: { attempted: ChatStreamRequest<ImagePicker.ImagePickerAsset>; resetController: () => AbortController; armIdleTimer: () => void; ownsAccount: () => boolean; onAccepted: (() => void) | undefined; t: ReturnType<typeof useTranslation>['t'] }): Parameters<typeof sendChatStreamTurn<FormData>>[0]['open'] {
  return async (turn) => {
    const controller = resetController()
    armIdleTimer()
    const response = await openChatStream(turn.payload, controller.signal, turn.key)
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as { error?: string; errorCode?: string; code?: string } | null
      return { kind: 'httpError', status: response.status, error: errorBody?.error ?? t("chat.sendError"), code: errorBody?.code ?? errorBody?.errorCode ?? null }
    }
    if (ownsAccount()) onAccepted?.()
    return { kind: 'stream', chunks: streamTextChunks(response.body, armIdleTimer) }
  }
}

type ChatSendFailureInputs = Pick<ReturnType<typeof useChatComposerAttachmentState>, 'setSelectedImage' | 'setImagePreview' | 'setSelectedTextFile' | 'imageSelectionVersionRef'> & Pick<ChatComposerState, 'setDailyBudgetDate' | 'today' | 'setSendError' | 'setLastFailedSend' | 'allowanceText' | 'updateMessage' | 'addMessage' | 'activeStepsRef' | 'setActiveSteps' | 'setIsTyping' | 'setInput' | 't'> & Pick<ReturnType<typeof useChatComposerScroll>, 'scrollToBottom'>

export function useChatSendFailure(inputs: ChatSendFailureInputs) {
  return createComposerFailureHandlers<AttemptedSend>({ ...inputs,
    getChat: useChatStore.getState, setChat: useChatStore.setState, createMessageId: createChatMessageId, restoreImage: (image, preview) => { inputs.imageSelectionVersionRef.current += 1; inputs.setSelectedImage(image); inputs.setImagePreview(preview) }, restoreTextFile: inputs.setSelectedTextFile,
  })
}

type ChatResponseSettlementInputs = Pick<ChatComposerState, 'threadScroll' | 'setIsTyping' | 'activeStepsRef' | 'setActiveSteps' | 'updateMessage' | 'addMessage' | 'setStreamingMessageId' | 'queryClient'> & Pick<ReturnType<typeof useChatComposerScroll>, 'scrollToBottom'>

export function useChatResponseSettlement(inputs: ChatResponseSettlementInputs) {
  const applyFinalResponse = useCallback((...args: Parameters<typeof settleComposerResponse> extends [unknown, ...infer Args] ? Args : never) => settleComposerResponse({
    ...inputs, getChat: useChatStore.getState, setChat: useChatStore.setState, createMessageId: createChatMessageId,
  }, ...args), [inputs])
  return { applyFinalResponse }
}

type ChatRequestPayloadInputs = Pick<ChatComposerState, 'i18n' | 'profile'>

export function useChatRequestPayload(i18n: ChatRequestPayloadInputs['i18n'], profile: ChatRequestPayloadInputs['profile']) {
  const buildChatFormData = useCallback(
    (attempted: ChatStreamRequest<ImagePicker.ImagePickerAsset>) => {
      const formData = new FormData()
      formData.append("message", attempted.content)
      if (attempted.blockAnswer) formData.append("blockAnswer", JSON.stringify(attempted.blockAnswer))
      if (attempted.image) {
        formData.append(
          "image",
          new File(attempted.image.uri).slice(0, undefined, resolveChatImageMimeType(attempted.image) ?? undefined),
          buildImageFileName(attempted.image),
        )
      }

      const historyMessages = useChatStore.getState().messages
      const recentHistory = buildRecentChatHistory(attempted.blockAnswer ? [...historyMessages, { role: 'user', content: attempted.content }] : historyMessages)
      formData.append("history", JSON.stringify(recentHistory))
      const entryPointIntent = useUIStore.getState().astraEntryPointIntent
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
      })
      formData.append("clientContext", JSON.stringify(clientContext))
      return formData
    },
    [i18n.language, profile?.uses24HourClock],
  )
  return { buildChatFormData }
}

type ChatStreamInputs = Pick<ChatComposerState, 't' | 'activeStepsRef' | 'setActiveSteps' | 'stopReply' | 'setStreamingMessageId' | 'setIsTyping' | 'addMessage' | 'turnReconciliation' | 'queryClient' | 'appendToMessageContent' | 'updateMessage' | 'allowanceText'> & Pick<ReturnType<typeof useChatComposerScroll>, 'scrollToBottom'> & Pick<ReturnType<typeof useChatRequestPayload>, 'buildChatFormData'> & Pick<ReturnType<typeof useChatResponseSettlement>, 'applyFinalResponse'>

export function useChatStream(inputs: ChatStreamInputs) {
  const runStreamingSend = useCallback((attempted: ChatStreamRequest<ImagePicker.ImagePickerAsset> & { turn?: PreparedChatTurn<FormData> }, onAccepted?: () => void) => runComposerStream({
    ...inputs, getAccountGeneration, getChat: useChatStore.getState, createMessageId: createChatMessageId, createTurnKey: randomUUID, isAbortError,
    createTransport: (request, reply, accepted) => createComposerStreamTransport({ attempted: request, ...reply, onAccepted: accepted, t: inputs.t }),
  }, attempted, onAccepted), [inputs])
  return { runStreamingSend }
}

type ChatSendQueueInputs = Pick<ChatComposerState, 'threadScroll' | 'activeStepsRef' | 'setActiveSteps' | 'setSendError' | 'setLastFailedSend' | 'setIsTyping' | 'blockSubmission' | 'i18n' | 'queryClient' | 't' | 'allowanceText' | 'setInput'> & Pick<ReturnType<typeof useChatComposerScroll>, 'scrollToBottom'> & Pick<ReturnType<typeof useChatStream>, 'runStreamingSend'> & Pick<ReturnType<typeof useChatSendFailure>, 'handleFailedSend' | 'handleAllowanceExceeded' | 'handleDailyBudgetExceeded'> & Pick<UseChatComposerOptions, 'isOnline'> & Pick<ReturnType<typeof useChatComposerAvailability>, 'atMessageLimit' | 'dailyBudgetReached' | 'isSending' | 'aiMessagesLimit'> & Pick<ReturnType<typeof useChatComposerAttachmentState>, 'setSelectedImage' | 'setImagePreview' | 'setSelectedTextFile' | 'imageSelectionVersionRef'>

export function useChatSendQueue(threadScroll: ChatSendQueueInputs['threadScroll'], activeStepsRef: ChatSendQueueInputs['activeStepsRef'], setActiveSteps: ChatSendQueueInputs['setActiveSteps'], setSendError: ChatSendQueueInputs['setSendError'], setLastFailedSend: ChatSendQueueInputs['setLastFailedSend'], scrollToBottom: ChatSendQueueInputs['scrollToBottom'], setIsTyping: ChatSendQueueInputs['setIsTyping'], runStreamingSend: ChatSendQueueInputs['runStreamingSend'], handleFailedSend: ChatSendQueueInputs['handleFailedSend'], blockSubmission: ChatSendQueueInputs['blockSubmission'], isOnline: ChatSendQueueInputs['isOnline'], atMessageLimit: ChatSendQueueInputs['atMessageLimit'], dailyBudgetReached: ChatSendQueueInputs['dailyBudgetReached'], handleAllowanceExceeded: ChatSendQueueInputs['handleAllowanceExceeded'], handleDailyBudgetExceeded: ChatSendQueueInputs['handleDailyBudgetExceeded'], i18n: ChatSendQueueInputs['i18n'], queryClient: ChatSendQueueInputs['queryClient'], t: ChatSendQueueInputs['t'], isSending: ChatSendQueueInputs['isSending'], aiMessagesLimit: ChatSendQueueInputs['aiMessagesLimit'], allowanceText: ChatSendQueueInputs['allowanceText'], setInput: ChatSendQueueInputs['setInput'], setSelectedImage: ChatSendQueueInputs['setSelectedImage'], setImagePreview: ChatSendQueueInputs['setImagePreview'], setSelectedTextFile: ChatSendQueueInputs['setSelectedTextFile'], imageSelectionVersionRef: ChatSendQueueInputs['imageSelectionVersionRef']) {
  const beginSend = useCallback(() => {
    useChatStore.getState().beginReply()
    threadScroll.followLatest()
    activeStepsRef.current = []
    setActiveSteps([])
    setSendError(null)
    setLastFailedSend(null)
    scrollToBottom()
    setIsTyping(true)
    scrollToBottom()
  }, [threadScroll, activeStepsRef, setActiveSteps, setSendError, setLastFailedSend, scrollToBottom, setIsTyping])

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
      words: {
        answered: content => t('chat.choice.answered', { options: content }),
        closed: t('chat.choice.closed'), alreadyAnswered: t('chat.choice.alreadyAnswered')
      },
    }), [atMessageLimit, beginSend, blockSubmission, dailyBudgetReached, handleAllowanceExceeded, handleDailyBudgetExceeded, isOnline, i18n.language, queryClient, runStreamingSend, t])
  const blockAnswerInteraction = { isOnline, isSending, atMessageLimit, dailyBudgetReached, allowance: aiMessagesLimit, limitReason: allowanceText('chat.choice.limit', { allowance: aiMessagesLimit }), send: sendBlockAnswer }

  const queueAttempt = useCallback((attempted: AttemptedSend, sendsComposerDraft: boolean) => {
    const accepted = enqueueChatPrompt(useChatStore.getState(), createChatMessageId(), attempted, performSend)
    if (!accepted) { setSendError(t('shell.composer.queue.full')); return }
    setSendError(null)
    if (sendsComposerDraft) {
      imageSelectionVersionRef.current += 1
      setInput('')
      setSelectedImage(null); setImagePreview(null); setSelectedTextFile(null)
    }
  }, [performSend, setInput, setSendError, t, setSelectedImage, setImagePreview, setSelectedTextFile, imageSelectionVersionRef])

  const reportHistoryFailure = useCallback((generation: number) => {
    if (generation === getAccountGeneration()) setSendError(t('common.error'))
  }, [setSendError, t])

  const sendPreparedAttempt = useCallback(async (attempted: AttemptedSend, consumesComposerDraft: boolean) => {
    const sendState = useChatStore.getState()
    if (isChatReplyActive(sendState)) {
      queueAttempt(attempted, consumesComposerDraft)
      return
    }

    if (consumesComposerDraft) {
      imageSelectionVersionRef.current += 1
      setInput("")
      setSelectedImage(null)
      setImagePreview(null)
      setSelectedTextFile(null)
    }

    await performSend(attempted, false)
  }, [queueAttempt, setInput, setSelectedImage, setImagePreview, setSelectedTextFile, performSend, imageSelectionVersionRef])
  return { reportHistoryFailure, sendPreparedAttempt, performSend, blockAnswerInteraction }
}

type ChatSendMessageInputs = Pick<ChatComposerState, 'input' | 't' | 'setSendError' | 'addMessage' | 'allowanceText'> & Pick<ReturnType<typeof useChatComposerAttachmentState>, 'selectedTextFile' | 'selectedImage' | 'imagePreview'> & Pick<ReturnType<typeof useChatComposerAvailability>, 'attachments' | 'dailyBudgetReached' | 'atMessageLimit'> & Pick<UseChatComposerOptions, 'isOnline'> & Pick<ReturnType<typeof useChatComposerScroll>, 'scrollToBottom'> & Pick<ReturnType<typeof useChatSendQueue>, 'reportHistoryFailure' | 'sendPreparedAttempt'>

export function useChatSendMessage(input: ChatSendMessageInputs['input'], selectedTextFile: ChatSendMessageInputs['selectedTextFile'], t: ChatSendMessageInputs['t'], attachments: ChatSendMessageInputs['attachments'], isOnline: ChatSendMessageInputs['isOnline'], setSendError: ChatSendMessageInputs['setSendError'], dailyBudgetReached: ChatSendMessageInputs['dailyBudgetReached'], atMessageLimit: ChatSendMessageInputs['atMessageLimit'], addMessage: ChatSendMessageInputs['addMessage'], allowanceText: ChatSendMessageInputs['allowanceText'], scrollToBottom: ChatSendMessageInputs['scrollToBottom'], reportHistoryFailure: ChatSendMessageInputs['reportHistoryFailure'], selectedImage: ChatSendMessageInputs['selectedImage'], imagePreview: ChatSendMessageInputs['imagePreview'], sendPreparedAttempt: ChatSendMessageInputs['sendPreparedAttempt']) {
  const sendMessage = useCallback(
    async (content?: string, requestContext?: 'followUp' | Pick<ChatClientContext, 'previousStartingStep' | 'selectedOfferKey'>, contextualRequest?: NonNullable<ChatStoreState['contextualSuggestion']>) => {
      const { messageOrigin, previousStartingStep, selectedOfferKey, sendsComposerDraft } = resolveChatRequestContext(content, requestContext)
      const typedContent = content?.trim() ?? input.trim()
      const messageContent = selectedTextFile && sendsComposerDraft
        ? buildChatMessageWithFileContent({
          message: typedContent,
          fileLabel: t("chat.fileAttached", { name: selectedTextFile.name }),
          fileContent: selectedTextFile.content,
        })
        : typedContent
      if (!hasComposerContent(typedContent, sendsComposerDraft ? attachments : [])) return
      if (!isOnline) {
        setSendError(t("shell.composer.offline.reason"))
        return
      }
      if (dailyBudgetReached) return
      if (atMessageLimit) {
        setSendError(null)
        addMessage({
          id: createChatMessageId(),
          role: "ai",
          content: allowanceText("chat.limitReachedError"),
          timestamp: new Date(),
        })
        scrollToBottom()
        return
      }

      const initiatingGeneration = getAccountGeneration()
      const draftRevision = useChatStore.getState().draftRevision
      const ready = prepareConversationSend(conversationHistory, useUIStore.getState(), () => reportHistoryFailure(initiatingGeneration))
      if (ready !== true && !await ready) return
      if (initiatingGeneration !== getAccountGeneration()) return
      const consumesComposerDraft = sendsComposerDraft && draftRevision === useChatStore.getState().draftRevision

      const attempted: AttemptedSend = {
        content: messageContent,
        draftContent: sendsComposerDraft ? input : typedContent,
        image: sendsComposerDraft ? selectedImage : null,
        preview: sendsComposerDraft ? imagePreview : null,
        textFile: sendsComposerDraft ? selectedTextFile : null,
        restoreDraftOnFailure: consumesComposerDraft,
        clearDraftOnSuccess: consumesComposerDraft,
        restoredDraftRevision: null,
        messageOrigin,
        previousStartingStep,
        selectedOfferKey,
        contextualRequest,
      }

      await sendPreparedAttempt(attempted, consumesComposerDraft)
    },
    [allowanceText,
      reportHistoryFailure, sendPreparedAttempt, setSendError,
      attachments,
      addMessage,
      atMessageLimit,
      dailyBudgetReached,
      imagePreview,
      input,
      isOnline,
      selectedImage,
      selectedTextFile,
      scrollToBottom,
      t,
    ],
  )
  return { sendMessage }
}

type ChatSendRetryInputs = Pick<UseChatComposerOptions, 'isOnline' | 'offlineTitle'> & Pick<ReturnType<typeof useChatComposerAvailability>, 'atMessageLimit' | 'isSending'> & Pick<ChatComposerState, 'queryClient' | 'queuePaused' | 'queueReady' | 'queuedPrompts' | 'lastFailedSend' | 'setSendError' | 'setInput'> & Pick<ReturnType<typeof useChatSendQueue>, 'performSend'>

export function useChatSendRetry(isOnline: ChatSendRetryInputs['isOnline'], atMessageLimit: ChatSendRetryInputs['atMessageLimit'], queryClient: ChatSendRetryInputs['queryClient'], isSending: ChatSendRetryInputs['isSending'], queuePaused: ChatSendRetryInputs['queuePaused'], queueReady: ChatSendRetryInputs['queueReady'], queuedPrompts: ChatSendRetryInputs['queuedPrompts'], lastFailedSend: ChatSendRetryInputs['lastFailedSend'], setSendError: ChatSendRetryInputs['setSendError'], offlineTitle: ChatSendRetryInputs['offlineTitle'], performSend: ChatSendRetryInputs['performSend'], setInput: ChatSendRetryInputs['setInput']) {
  const sendQueuedPrompt = useCallback((id: string) => sendQueuedChatPrompt(
    useChatStore.getState(), id, isOnline && !atMessageLimit, queryClient.getQueryData<Profile>(profileKeys.detail()),
  ), [atMessageLimit, isOnline, queryClient])

  useEffect(() => {
    const nextId = nextQueuedChatPrompt(useChatStore.getState())
    if (nextId) void sendQueuedPrompt(nextId)
  }, [isSending, queuePaused, queueReady, queuedPrompts, sendQueuedPrompt])

  const retryLastSend = useCallback(async () => {
    const sendState = useChatStore.getState()
    if (!lastFailedSend || sendState.isTyping || sendState.streamingMessageId !== null) return
    if (!isOnline) {
      setSendError(offlineTitle)
      return
    }
    await retryComposerSend(lastFailedSend, performSend, useChatStore.getState, getAccountGeneration, () => { setInput(''); void AsyncStorage.removeItem(CHAT_DRAFT_STORAGE_KEY) })
  }, [isOnline, lastFailedSend, offlineTitle, performSend, setInput, setSendError])

  const canRetryLastSend = lastFailedSend !== null && !isSending
  return { sendQueuedPrompt, canRetryLastSend, retryLastSend }
}

type ChatBreakdownRefreshInputs = Pick<ChatComposerState, 'queryClient'>

export function useChatBreakdownRefresh(queryClient: ChatBreakdownRefreshInputs['queryClient']) {
  const handleBreakdownConfirmed = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
    void queryClient.invalidateQueries({ queryKey: habitKeys.searches() })
  }, [queryClient])
  return { handleBreakdownConfirmed }
}
