'use client'

import { reportModuleLoadError } from '@/lib/report-module-load-error'

import { retryComposerSend } from '@orbit/shared/hooks'
import { createComposerFailureHandlers } from '@orbit/shared/hooks'
import { runComposerStream,settleComposerResponse } from '@orbit/shared/hooks'

import { isChatReplyActive,prepareConversationSend,resolveChatRequestContext } from '@orbit/shared/chat'
import { conversationHistory } from '@/lib/conversation-history'
import { useThrottleStore } from '@/stores/throttle-store'
import { useCallback,useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { habitKeys,profileKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { ChatClientContext } from '@orbit/shared/types/chat'
import type { Profile } from '@orbit/shared/types/profile'
import { hasComposerContent } from '@orbit/shared/contracts/composer'
import { type ChatStreamRequest,type BlockAnswerRequest,type BlockAnswerResult,buildChatMessageWithFileContent,buildChatClientContext,type ChatTurnOptions,enqueueChatPrompt,sendChatPrompt,sendQueuedChatPrompt,nextQueuedChatPrompt,type PreparedChatTurn } from '@orbit/shared/chat'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import { sessionAwareFetch } from '@/lib/api-fetch'
import { buildRecentChatHistory } from '@orbit/shared/utils'
import { useChatStore } from '@/stores/chat-store'
import type { ChatStoreState } from '@orbit/shared/stores'
import { useUIStore } from '@/stores/ui-store'
import { getHeldAccountId } from '@/stores/auth-store'
import { ACCOUNT_CHANGED_ERROR_CODE } from '@/app/actions/action-result'
import { getAccountGeneration } from '@/lib/session-epoch'
import type { useChatComposerAttachments } from './use-chat-composer-attachments'
import type { ChatComposerState,useChatComposerScroll,useChatComposerSession,useChatComposerAvailability } from './use-chat-composer-state'
import type { AttemptedSend } from './use-chat-composer-types'
import type { useSpeechToText } from '@/hooks/use-speech-to-text'

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function* streamTextChunks(
  body: ReadableStream<Uint8Array> | null,
  onActivity: () => void,
): AsyncGenerator<string> {
  if (!body) return
  const reader = body.getReader()
  const decoder = new TextDecoder()
  try {
    let result = await reader.read()
    while (!result.done) {
      onActivity()
      yield decoder.decode(result.value, { stream: true })
      result = await reader.read()
    }
  } finally {
    reader.releaseLock()
  }
}

function createComposerStreamTransport({ attempted, resetController, armIdleTimer, ownsAccount, onAccepted, t }: { attempted: ChatStreamRequest<File>; resetController: () => AbortController; armIdleTimer: () => void; ownsAccount: () => boolean; onAccepted: (() => void) | undefined; t: ReturnType<typeof useTranslations> }): ChatTurnOptions<FormData>['open'] {
  return async (turn) => {
    const controller = resetController()
    armIdleTimer()
    const response = await sessionAwareFetch(API.chat.stream, {
      method: 'POST',
      headers: { 'Idempotency-Key': turn.key, ...(attempted.intendedAccountId ? { 'X-Orbit-Held-Account-Id': attempted.intendedAccountId } : {}) },
      body: turn.payload,
      signal: controller.signal,
    })
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as { error?: string; errorCode?: string; code?: string } | null
      useThrottleStore.getState().show(response.status, errorBody)
      return { kind: 'httpError', status: response.status, error: errorBody?.error ?? t('chat.sendError'), code: errorBody?.code ?? errorBody?.errorCode ?? null }
    }
    if (ownsAccount()) onAccepted?.()
    return { kind: 'stream', chunks: streamTextChunks(response.body, armIdleTimer) }
  }
}

type ChatSendFailureInputs = Pick<ReturnType<typeof useChatComposerAttachments>, 'restoreImage' | 'restoreTextFile'> & Pick<ChatComposerState, 'setDailyBudgetDate' | 'today' | 'setSendError' | 'setLastFailedSend' | 'allowanceText' | 'updateMessage' | 'addMessage' | 'activeStepsRef' | 'setActiveSteps' | 'setIsTyping' | 'setInput' | 't'> & Pick<ReturnType<typeof useChatComposerScroll>, 'scrollToBottom'>

export function useChatSendFailure(inputs: ChatSendFailureInputs) {
  return createComposerFailureHandlers<AttemptedSend>({ ...inputs,
    getChat: useChatStore.getState, setChat: useChatStore.setState, createMessageId: () => crypto.randomUUID(), accountChangedCode: ACCOUNT_CHANGED_ERROR_CODE,
  })
}

type ChatResponseSettlementInputs = Pick<ChatComposerState, 'threadScroll' | 'setIsTyping' | 'activeStepsRef' | 'setActiveSteps' | 'updateMessage' | 'addMessage' | 'setStreamingMessageId' | 'queryClient'> & Pick<ReturnType<typeof useChatComposerScroll>, 'scrollToBottom'>

export function useChatResponseSettlement(inputs: ChatResponseSettlementInputs) {
  const applyFinalResponse = useCallback((...args: Parameters<typeof settleComposerResponse> extends [unknown, ...infer Args] ? Args : never) => settleComposerResponse({
    ...inputs, onModuleLoadError: reportModuleLoadError, getChat: useChatStore.getState, setChat: useChatStore.setState, createMessageId: () => crypto.randomUUID(),
  }, ...args), [inputs])
  return { applyFinalResponse }
}

type ChatRequestPayloadInputs = Pick<ChatComposerState, 'locale' | 'profile'>

export function useChatRequestPayload(locale: ChatRequestPayloadInputs['locale'], profile: ChatRequestPayloadInputs['profile']) {
  const buildChatFormData = useCallback((attempted: ChatStreamRequest<File>) => {
    const formData = new FormData()
    formData.append('message', attempted.content)
    if (attempted.blockAnswer) formData.append('blockAnswer', JSON.stringify(attempted.blockAnswer))
    if (attempted.image) formData.append('image', attempted.image)

    const historyMessages = useChatStore.getState().messages
    const recentHistory = buildRecentChatHistory(attempted.blockAnswer ? [...historyMessages, { role: 'user', content: attempted.content }] : historyMessages)
    formData.append('history', JSON.stringify(recentHistory))
    const entryPointIntent = useUIStore.getState().astraEntryPointIntent
    const clientContext = buildChatClientContext({
      platform: 'web',
      locale,
      uses24HourClock: profile?.uses24HourClock,
      messageOrigin: attempted.messageOrigin,
      previousStartingStep: attempted.previousStartingStep,
      selectedOfferKey: attempted.selectedOfferKey,
      conversationId: useChatStore.getState().ensureConversation(crypto.randomUUID()),
      dismissedOfferKeys: useChatStore.getState().dismissedOfferKeys,
      entryPointIntent,
    })
    formData.append('clientContext', JSON.stringify(clientContext))
    return formData
  }, [locale, profile?.uses24HourClock])
  return { buildChatFormData }
}

type ChatStreamInputs = Pick<ChatComposerState, 't' | 'activeStepsRef' | 'setActiveSteps' | 'stopReply' | 'setStreamingMessageId' | 'setIsTyping' | 'addMessage' | 'turnReconciliation' | 'queryClient' | 'appendToMessageContent' | 'updateMessage' | 'allowanceText'> & Pick<ReturnType<typeof useChatComposerScroll>, 'scrollToBottom'> & Pick<ReturnType<typeof useChatRequestPayload>, 'buildChatFormData'> & Pick<ReturnType<typeof useChatResponseSettlement>, 'applyFinalResponse'>

export function useChatStream(inputs: ChatStreamInputs) {
  const runStreamingSend = useCallback((attempted: ChatStreamRequest<File> & { turn?: PreparedChatTurn<FormData> }, onAccepted?: () => void) => runComposerStream({
    ...inputs, onModuleLoadError: reportModuleLoadError, getAccountGeneration, getChat: useChatStore.getState, createMessageId: () => crypto.randomUUID(), createTurnKey: () => crypto.randomUUID(), isAbortError,
    createTransport: (request, reply, accepted) => createComposerStreamTransport({ attempted: request, ...reply, onAccepted: accepted, t: inputs.t }),
  }, attempted, onAccepted), [inputs])
  return { runStreamingSend }
}

type ChatSendQueueInputs = Pick<ChatComposerState, 'threadScroll' | 'chatContainerRef' | 'activeStepsRef' | 'setActiveSteps' | 'setSendError' | 'setLastFailedSend' | 'setIsTyping' | 'blockSubmission' | 'locale' | 'queryClient' | 't' | 'allowanceText' | 'setInput'> & Pick<ReturnType<typeof useChatComposerScroll>, 'scrollToBottom'> & Pick<ReturnType<typeof useChatStream>, 'runStreamingSend'> & Pick<ReturnType<typeof useChatSendFailure>, 'handleFailedSend' | 'handleAllowanceExceeded' | 'handleDailyBudgetExceeded'> & Pick<ReturnType<typeof useChatComposerSession>, 'isOnline'> & Pick<ReturnType<typeof useChatComposerAvailability>, 'atMessageLimit' | 'dailyBudgetReached' | 'isSending' | 'aiMessagesLimit'> & Pick<ReturnType<typeof useChatComposerAttachments>, 'clearImage' | 'removeTextFile'> & { clearSpeechError: ReturnType<typeof useSpeechToText>['clearError'] }

export function useChatSendQueue(threadScroll: ChatSendQueueInputs['threadScroll'], chatContainerRef: ChatSendQueueInputs['chatContainerRef'], activeStepsRef: ChatSendQueueInputs['activeStepsRef'], setActiveSteps: ChatSendQueueInputs['setActiveSteps'], setSendError: ChatSendQueueInputs['setSendError'], setLastFailedSend: ChatSendQueueInputs['setLastFailedSend'], scrollToBottom: ChatSendQueueInputs['scrollToBottom'], setIsTyping: ChatSendQueueInputs['setIsTyping'], runStreamingSend: ChatSendQueueInputs['runStreamingSend'], handleFailedSend: ChatSendQueueInputs['handleFailedSend'], blockSubmission: ChatSendQueueInputs['blockSubmission'], isOnline: ChatSendQueueInputs['isOnline'], atMessageLimit: ChatSendQueueInputs['atMessageLimit'], dailyBudgetReached: ChatSendQueueInputs['dailyBudgetReached'], handleAllowanceExceeded: ChatSendQueueInputs['handleAllowanceExceeded'], handleDailyBudgetExceeded: ChatSendQueueInputs['handleDailyBudgetExceeded'], locale: ChatSendQueueInputs['locale'], queryClient: ChatSendQueueInputs['queryClient'], t: ChatSendQueueInputs['t'], isSending: ChatSendQueueInputs['isSending'], aiMessagesLimit: ChatSendQueueInputs['aiMessagesLimit'], allowanceText: ChatSendQueueInputs['allowanceText'], setInput: ChatSendQueueInputs['setInput'], clearImage: ChatSendQueueInputs['clearImage'], removeTextFile: ChatSendQueueInputs['removeTextFile'], clearSpeechError: ChatSendQueueInputs['clearSpeechError']) {
  const beginSend = useCallback(() => {
    useChatStore.getState().beginReply()
    threadScroll.followLatest(chatContainerRef.current?.scrollTop)
    activeStepsRef.current = []
    setActiveSteps([])
    setSendError(null)
    clearSpeechError()
    setLastFailedSend(null)
    scrollToBottom()
    setIsTyping(true)
    scrollToBottom()
  }, [threadScroll, chatContainerRef, activeStepsRef, setActiveSteps, setSendError, setLastFailedSend, scrollToBottom, setIsTyping, clearSpeechError])

  const performSend = useCallback((attempted: AttemptedSend, isRetry: boolean) => sendChatPrompt(attempted, isRetry, {
    conversation: useUIStore.getState(), getChat: useChatStore.getState, getAccountGeneration,
    createMessageId: () => crypto.randomUUID(), beginSend, run: runStreamingSend,
    onFailure: handleFailedSend, retainRetry: setLastFailedSend,
  }), [beginSend, handleFailedSend, runStreamingSend, setLastFailedSend])

  const sendBlockAnswer = useCallback((request: BlockAnswerRequest): Promise<BlockAnswerResult> =>
    blockSubmission.send(request, {
      isOnline, atMessageLimit, dailyBudgetReached, onAllowanceExceeded: handleAllowanceExceeded, onDailyBudgetExceeded: handleDailyBudgetExceeded, locale, intendedAccountId: getHeldAccountId(),
      getChat: useChatStore.getState, createMessageId: () => crypto.randomUUID(),
      conversation: useUIStore.getState(), beginSend, run: runStreamingSend,
      refreshProfile: () => queryClient.invalidateQueries({ queryKey: profileKeys.all }),
      words: {
        answered: content => t('chat.choice.answered', { options: content }),
        closed: t('chat.choice.closed'), alreadyAnswered: t('chat.choice.alreadyAnswered')
      },
    }), [atMessageLimit, beginSend, blockSubmission, dailyBudgetReached, handleAllowanceExceeded, handleDailyBudgetExceeded, isOnline, locale, queryClient, runStreamingSend, t])
  const blockAnswerInteraction = { isOnline, isSending, atMessageLimit, dailyBudgetReached, allowance: aiMessagesLimit, limitReason: allowanceText('chat.choice.limit', { allowance: aiMessagesLimit }), send: sendBlockAnswer }

  const queueAttempt = useCallback((attempted: AttemptedSend, sendsComposerDraft: boolean) => {
    const accepted = enqueueChatPrompt(useChatStore.getState(), crypto.randomUUID(), attempted, performSend)
    if (!accepted) { setSendError(t('shell.composer.queue.full')); return }
    setSendError(null)
    if (sendsComposerDraft) {
      setInput('')
      clearImage(); removeTextFile()
    }
  }, [performSend, setInput, setSendError, t, clearImage, removeTextFile])

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
      setInput('')
      clearImage()
      removeTextFile()
    }

    await performSend(attempted, false)
  }, [queueAttempt, setInput, clearImage, removeTextFile, performSend])
  return { reportHistoryFailure, sendPreparedAttempt, performSend, blockAnswerInteraction }
}

type ChatSendMessageInputs = Pick<ChatComposerState, 'input' | 't' | 'setSendError' | 'addMessage' | 'allowanceText'> & Pick<ReturnType<typeof useChatComposerAttachments>, 'selectedTextFile' | 'selectedImage' | 'imagePreview'> & Pick<ReturnType<typeof useChatComposerAvailability>, 'attachments' | 'dailyBudgetReached' | 'atMessageLimit'> & Pick<ReturnType<typeof useChatComposerSession>, 'isOnline'> & Pick<ReturnType<typeof useChatComposerScroll>, 'scrollToBottom'> & Pick<ReturnType<typeof useChatSendQueue>, 'reportHistoryFailure' | 'sendPreparedAttempt'>

export function useChatSendMessage(input: ChatSendMessageInputs['input'], selectedTextFile: ChatSendMessageInputs['selectedTextFile'], t: ChatSendMessageInputs['t'], attachments: ChatSendMessageInputs['attachments'], isOnline: ChatSendMessageInputs['isOnline'], setSendError: ChatSendMessageInputs['setSendError'], dailyBudgetReached: ChatSendMessageInputs['dailyBudgetReached'], atMessageLimit: ChatSendMessageInputs['atMessageLimit'], addMessage: ChatSendMessageInputs['addMessage'], allowanceText: ChatSendMessageInputs['allowanceText'], scrollToBottom: ChatSendMessageInputs['scrollToBottom'], reportHistoryFailure: ChatSendMessageInputs['reportHistoryFailure'], selectedImage: ChatSendMessageInputs['selectedImage'], imagePreview: ChatSendMessageInputs['imagePreview'], sendPreparedAttempt: ChatSendMessageInputs['sendPreparedAttempt']) {
  const sendMessage = useCallback(
    async (content?: string, requestContext?: 'followUp' | Pick<ChatClientContext, 'previousStartingStep' | 'selectedOfferKey'>, contextualRequest?: NonNullable<ChatStoreState['contextualSuggestion']>) => {
      const { messageOrigin, previousStartingStep, selectedOfferKey, sendsComposerDraft } = resolveChatRequestContext(content, requestContext)
      const typedContent = content?.trim() ?? input.trim()
      const messageContent = selectedTextFile && sendsComposerDraft
        ? buildChatMessageWithFileContent({
          message: typedContent,
          fileLabel: t('chat.fileAttached', { name: selectedTextFile.name }),
          fileContent: selectedTextFile.content,
        })
        : typedContent
      if (!hasComposerContent(typedContent, sendsComposerDraft ? attachments : [])) return
      if (!isOnline) {
        setSendError(t('shell.composer.offline.reason'))
        return
      }
      if (dailyBudgetReached) return
      if (atMessageLimit) {
        setSendError(null)
        addMessage({
          id: crypto.randomUUID(),
          role: 'ai',
          content: allowanceText('chat.limitReachedError'),
          timestamp: new Date(),
        })
        scrollToBottom()
        return
      }

      const initiatingGeneration = getAccountGeneration()
      const intendedAccountId = getHeldAccountId()
      const draftRevision = useChatStore.getState().draftRevision
      const ready = prepareConversationSend(conversationHistory, useUIStore.getState(), () => reportHistoryFailure(initiatingGeneration))
      if (ready !== true && !await ready) return
      if (initiatingGeneration !== getAccountGeneration() || intendedAccountId !== getHeldAccountId()) return
      const consumesComposerDraft = sendsComposerDraft && draftRevision === useChatStore.getState().draftRevision

      const attempted: AttemptedSend = {
        intendedAccountId,
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

type ChatSendRetryInputs = Pick<ReturnType<typeof useChatComposerSession>, 'isOnline'> & Pick<ReturnType<typeof useChatComposerAvailability>, 'atMessageLimit' | 'isSending'> & Pick<ChatComposerState, 'queryClient' | 'queuePaused' | 'queueReady' | 'queuedPrompts' | 'lastFailedSend' | 'setInput'> & Pick<ReturnType<typeof useChatSendQueue>, 'performSend'>

export function useChatSendRetry(isOnline: ChatSendRetryInputs['isOnline'], atMessageLimit: ChatSendRetryInputs['atMessageLimit'], queryClient: ChatSendRetryInputs['queryClient'], isSending: ChatSendRetryInputs['isSending'], queuePaused: ChatSendRetryInputs['queuePaused'], queueReady: ChatSendRetryInputs['queueReady'], queuedPrompts: ChatSendRetryInputs['queuedPrompts'], lastFailedSend: ChatSendRetryInputs['lastFailedSend'], performSend: ChatSendRetryInputs['performSend'], setInput: ChatSendRetryInputs['setInput']) {
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
    await retryComposerSend(lastFailedSend, performSend, useChatStore.getState, getAccountGeneration, () => { setInput(''); globalThis.localStorage.removeItem(CHAT_DRAFT_STORAGE_KEY) })
  }, [lastFailedSend, performSend, setInput])

  const canRetryLastSend = lastFailedSend !== null && !isSending
  return { sendQueuedPrompt, canRetryLastSend, retryLastSend }
}

type ChatBreakdownRefreshInputs = Pick<ChatComposerState, 'queryClient'>

export function useChatBreakdownRefresh(queryClient: ChatBreakdownRefreshInputs['queryClient']) {
  function handleBreakdownConfirmed() {
    void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
    void queryClient.invalidateQueries({ queryKey: habitKeys.searches() })
  }
  return { handleBreakdownConfirmed }
}
