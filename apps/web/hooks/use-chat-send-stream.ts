'use client'

import { isChatReplyActive, prepareConversationSend, resolveChatRequestContext } from '@orbit/shared/chat'
import { conversationHistory } from '@/lib/conversation-history'
import { useThrottleStore } from '@/stores/throttle-store'
import { useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { habitKeys, profileKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { ChatClientContext, ChatResponse } from '@orbit/shared/types/chat'
import type { Profile } from '@orbit/shared/types/profile'
import { hasComposerContent } from '@orbit/shared/contracts/composer'
import { type ChatStreamRequest, type ChatStreamResult, type BlockAnswerRequest, type BlockAnswerResult, buildChatMessageWithFileContent, buildChatClientContext, buildChatFinalMessageFields, CHAT_STREAM_IDLE_TIMEOUT_MS, sendChatStreamTurn, ChatReplyLifecycle, enqueueChatPrompt, sendChatPrompt, sendQueuedChatPrompt, nextQueuedChatPrompt, needsNewChatTurn, getChatTurnFailure, type PreparedChatTurn } from '@orbit/shared/chat'
import { CHAT_DRAFT_STORAGE_KEY, classifySendFailure, reconcileAgentQueries, settleChatResponse } from '@orbit/shared/hooks'
import { sessionAwareFetch } from '@/lib/api-fetch'
import { buildRecentChatHistory, getFriendlyErrorMessage } from '@orbit/shared/utils'
import { useChatStore } from '@/stores/chat-store'
import type { ChatStoreState } from '@orbit/shared/stores'
import { useUIStore } from '@/stores/ui-store'
import { getHeldAccountId } from '@/stores/auth-store'
import { ACCOUNT_CHANGED_ERROR_CODE } from '@/app/actions/action-result'
import { getAccountGeneration } from '@/lib/session-epoch'
import type { useChatComposerAttachments } from './use-chat-composer-attachments'
import type { useChatComposerState, useChatComposerScroll, useChatComposerSession, useChatComposerAvailability } from './use-chat-composer-state'
import type { AttemptedSend, StreamSendFailure } from './use-chat-composer-types'

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

function createComposerStreamTransport({ attempted, resetController, armIdleTimer, ownsAccount, onAccepted, t }: { attempted: ChatStreamRequest<File>; resetController: () => AbortController; armIdleTimer: () => void; ownsAccount: () => boolean; onAccepted: (() => void) | undefined; t: ReturnType<typeof useTranslations> }): Parameters<typeof sendChatStreamTurn<FormData>>[0]['open'] {
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

type ChatSendFailureInputs = Pick<ReturnType<typeof useChatComposerAttachments>, 'restoreImage' | 'restoreTextFile'> & Pick<ReturnType<typeof useChatComposerState>, 'setDailyBudgetDate' | 'today' | 'setSendError' | 'setLastFailedSend' | 'allowanceText' | 'updateMessage' | 'addMessage' | 'activeStepsRef' | 'setActiveSteps' | 'setIsTyping' | 'setInput' | 't'> & Pick<ReturnType<typeof useChatComposerScroll>, 'scrollToBottom'>

export function useChatSendFailure({ restoreImage, restoreTextFile, setDailyBudgetDate, today, setSendError, setLastFailedSend, allowanceText, updateMessage, addMessage, scrollToBottom, activeStepsRef, setActiveSteps, setIsTyping, setInput, t }: ChatSendFailureInputs) {
  const handleDailyBudgetExceeded = useCallback((draftMessageId: string | null, attempted?: AttemptedSend) => {
    if (attempted?.clearDraftOnSuccess && attempted.restoredDraftRevision === useChatStore.getState().draftRevision) {
      restoreImage(attempted.image, attempted.preview)
      restoreTextFile(attempted.textFile)
    }
    setDailyBudgetDate(today)
    setSendError(null)
    setLastFailedSend(null)
    if (draftMessageId) useChatStore.setState(state => ({ messages: state.messages.filter(message => message.id !== draftMessageId) }))
  }, [restoreImage, restoreTextFile, today, setDailyBudgetDate, setSendError, setLastFailedSend])

  const handleAllowanceExceeded = useCallback((draftMessageId: string | null) => {
    setSendError(null)
    setLastFailedSend(null)
    const limitReason = allowanceText('chat.limitReachedError')
    if (draftMessageId) {
      updateMessage(draftMessageId, { content: limitReason })
    } else {
      addMessage({
        id: crypto.randomUUID(),
        role: 'ai',
        content: limitReason,
        timestamp: new Date(),
      })
    }
    scrollToBottom()
  }, [addMessage, allowanceText, scrollToBottom, setSendError, setLastFailedSend, updateMessage])

  const handleFailedSend = useCallback((
    failureInput: StreamSendFailure,
    attempted: AttemptedSend,
    draftMessageId: string | null,
  ) => {
    activeStepsRef.current = []
    setActiveSteps([])
    setIsTyping(false)
    let failedAttempt = attempted
    if (attempted.restoreDraftOnFailure && !useChatStore.getState().draft) {
      setInput(attempted.draftContent)
      failedAttempt = {
        ...attempted,
        restoreDraftOnFailure: false,
        restoredDraftRevision: useChatStore.getState().draftRevision,
      }
    }
    if (failureInput.code === ACCOUNT_CHANGED_ERROR_CODE) {
      const message = t('errors.api.accountChanged')
      setSendError(message)
      setLastFailedSend(null)
      if (draftMessageId) updateMessage(draftMessageId, { content: message })
      else addMessage({ id: crypto.randomUUID(), role: 'ai', content: message, timestamp: new Date() })
      scrollToBottom()
      return
    }
    const resolvedError = failureInput.error.trim() || t('chat.sendError')
    const failure = classifySendFailure({
      status: failureInput.status,
      code: failureInput.code,
      reason: resolvedError,
    })

    if (failure.kind === 'dailyBudget') {
      handleDailyBudgetExceeded(draftMessageId, failedAttempt)
      return
    }

    if (failure.kind === 'timeout') {
      setSendError(t('chat.timeoutError'))
      setLastFailedSend(failedAttempt)
    } else if (failure.kind === 'limit') {
      handleAllowanceExceeded(draftMessageId)
      return
    } else {
      setSendError(t('chat.sendError'))
      setLastFailedSend(failedAttempt)
    }

    if (draftMessageId) {
      updateMessage(draftMessageId, { content: t('chat.aiError') })
    } else {
      addMessage({
        id: crypto.randomUUID(),
        role: 'ai',
        content: t('chat.aiError'),
        timestamp: new Date(),
      })
    }
    scrollToBottom()
  }, [activeStepsRef, setActiveSteps, setIsTyping, t, scrollToBottom, setInput, setSendError, setLastFailedSend, updateMessage, addMessage, handleDailyBudgetExceeded, handleAllowanceExceeded])
  return { handleFailedSend, handleAllowanceExceeded, handleDailyBudgetExceeded }
}

type ChatResponseSettlementInputs = Pick<ReturnType<typeof useChatComposerState>, 'threadScroll' | 'setIsTyping' | 'activeStepsRef' | 'setActiveSteps' | 'updateMessage' | 'addMessage' | 'setStreamingMessageId' | 'queryClient'> & Pick<ReturnType<typeof useChatComposerScroll>, 'scrollToBottom'>

export function useChatResponseSettlement({ threadScroll, setIsTyping, activeStepsRef, setActiveSteps, updateMessage, addMessage, setStreamingMessageId, scrollToBottom, queryClient }: ChatResponseSettlementInputs) {
  const applyFinalResponse = useCallback(async (response: ChatResponse, draftMessageId: string | null, toolSteps: { domain: string; access: string }[], firstReveal: Promise<void>, messageCost: 0 | 1, reply: ChatReplyLifecycle) => {
    if (!reply.isHidden() && draftMessageId && response.parts?.some(part => part?.type === 'block')) {
      await reply.waitForReveal(firstReveal)
      if (!reply.isHidden()) threadScroll.holdPosition()
    }
    if (!reply.isCancelled() && response.conversationId) useChatStore.setState({ conversationId: response.conversationId, serverConversationId: response.conversationId })
    if (!reply.isHidden()) {
      setIsTyping(false)
      activeStepsRef.current = []
      setActiveSteps([])

      const finalFields = buildChatFinalMessageFields(response, toolSteps)
      if (draftMessageId) {
        updateMessage(draftMessageId, finalFields)
      } else {
        addMessage({
          id: crypto.randomUUID(),
          role: 'ai',
          timestamp: new Date(),
          ...finalFields,
        })
      }
      if (useChatStore.getState().streamingMessageId === draftMessageId) {
        setStreamingMessageId(null)
      }

      scrollToBottom()
    }
    if (!reply.isCancelled()) {
      const settlement = settleChatResponse(queryClient, response, messageCost)
      reply.finish(true)
      await settlement
    }
  }, [activeStepsRef, addMessage, queryClient, scrollToBottom, setActiveSteps, setIsTyping, setStreamingMessageId, threadScroll, updateMessage])
  return { applyFinalResponse }
}

type ChatRequestPayloadInputs = Pick<ReturnType<typeof useChatComposerState>, 'locale' | 'profile'>

export function useChatRequestPayload({ locale, profile }: ChatRequestPayloadInputs) {
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

type ChatStreamInputs = Pick<ReturnType<typeof useChatComposerState>, 't' | 'activeStepsRef' | 'setActiveSteps' | 'stopReply' | 'setStreamingMessageId' | 'setIsTyping' | 'addMessage' | 'turnReconciliation' | 'queryClient' | 'appendToMessageContent' | 'updateMessage' | 'allowanceText'> & Pick<ReturnType<typeof useChatComposerScroll>, 'scrollToBottom'> & Pick<ReturnType<typeof useChatRequestPayload>, 'buildChatFormData'> & Pick<ReturnType<typeof useChatResponseSettlement>, 'applyFinalResponse'>

export function useChatStream({ t, activeStepsRef, setActiveSteps, stopReply, setStreamingMessageId, setIsTyping, addMessage, scrollToBottom, turnReconciliation, queryClient, buildChatFormData, appendToMessageContent, updateMessage, applyFinalResponse, allowanceText }: ChatStreamInputs) {
  const runStreamingSend = useCallback(async (attempted: ChatStreamRequest<File> & { turn?: PreparedChatTurn<FormData> }, onAccepted?: () => void): Promise<ChatStreamResult> => {
    const { ownsAccount, armIdleTimer, firstReveal, reply, isCancelled, isHidden, stop, ensureDraftMessage, acceptSelectedOffer, getDraftMessageId, resetController, clearIdleTimer } = createComposerReply({ t, activeStepsRef, setActiveSteps, stopReply, setStreamingMessageId, setIsTyping, addMessage, scrollToBottom }, attempted)
    let finalReceived = false

    try {
      if (turnReconciliation.isPending) await turnReconciliation.reconcile(() => reconcileAgentQueries(queryClient))
      if (isHidden()) return { kind: 'cancelled' }
      attempted.turn ??= { key: crypto.randomUUID(), payload: buildChatFormData(attempted) }
      const outcome = await sendChatStreamTurn({
        turn: attempted.turn,
        isCancelled,
        open: createComposerStreamTransport({ attempted, resetController: resetController, armIdleTimer, ownsAccount, onAccepted, t }),
        callbacks: {
          onDelta: (text) => {
            if (isHidden()) return
            appendToMessageContent(ensureDraftMessage(), text)
            scrollToBottom()
          },
          onReset: () => {
            if (isHidden()) return
            const draftMessageId = getDraftMessageId()
            if (draftMessageId) updateMessage(draftMessageId, { content: '' })
            setIsTyping(true)
          },
          onStep: (step) => {
            if (isHidden()) return
            activeStepsRef.current = [...activeStepsRef.current, step]
            setActiveSteps(activeStepsRef.current)
          },
        },
      })

      if (outcome.kind === 'cancelled') return outcome
      if (needsNewChatTurn(outcome)) attempted.turn = undefined
      await turnReconciliation.reconcileAfterTurn(outcome, () => reconcileAgentQueries(queryClient))
      if (isHidden() && outcome.kind !== 'final') return { kind: 'cancelled' }

      if (outcome.kind === 'final') {
        acceptSelectedOffer()
        await applyFinalResponse(outcome.response, getDraftMessageId(), activeStepsRef.current, firstReveal.completion, attempted.messageCost, reply)
        finalReceived = reply.canComplete()
        return finalReceived ? { kind: 'final' } : { kind: 'cancelled' }
      }
      return { kind: 'failed', failure: getChatTurnFailure(outcome, t('chat.sendError')), draftMessageId: getDraftMessageId() }
    } catch (error: unknown) {
      if (isHidden()) return { kind: 'cancelled' }
      return {
        kind: 'failed', failure: {
          status: isAbortError(error) ? 408 : null,
          error: getFriendlyErrorMessage(error, allowanceText, 'chat.sendError', 'generic'),
          code: null,
        }, draftMessageId: getDraftMessageId()
      }
    } finally {
      clearIdleTimer()
      if (stopReply.current === stop) stopReply.current = null
      reply.finish(finalReceived)
    }
  }, [t, activeStepsRef, setActiveSteps, stopReply, setStreamingMessageId, setIsTyping, addMessage, scrollToBottom, turnReconciliation, buildChatFormData, queryClient, appendToMessageContent, updateMessage, applyFinalResponse, allowanceText])
  return { runStreamingSend }
}

type ChatSendQueueInputs = Pick<ReturnType<typeof useChatComposerState>, 'threadScroll' | 'chatContainerRef' | 'activeStepsRef' | 'setActiveSteps' | 'setSendError' | 'setLastFailedSend' | 'setIsTyping' | 'blockSubmission' | 'locale' | 'queryClient' | 't' | 'allowanceText' | 'setInput'> & Pick<ReturnType<typeof useChatComposerScroll>, 'scrollToBottom'> & Pick<ReturnType<typeof useChatStream>, 'runStreamingSend'> & Pick<ReturnType<typeof useChatSendFailure>, 'handleFailedSend' | 'handleAllowanceExceeded' | 'handleDailyBudgetExceeded'> & Pick<ReturnType<typeof useChatComposerSession>, 'isOnline'> & Pick<ReturnType<typeof useChatComposerAvailability>, 'atMessageLimit' | 'dailyBudgetReached' | 'isSending' | 'aiMessagesLimit'> & Pick<ReturnType<typeof useChatComposerAttachments>, 'clearImage' | 'removeTextFile'>

export function useChatSendQueue({ threadScroll, chatContainerRef, activeStepsRef, setActiveSteps, setSendError, setLastFailedSend, scrollToBottom, setIsTyping, runStreamingSend, handleFailedSend, blockSubmission, isOnline, atMessageLimit, dailyBudgetReached, handleAllowanceExceeded, handleDailyBudgetExceeded, locale, queryClient, t, isSending, aiMessagesLimit, allowanceText, setInput, clearImage, removeTextFile }: ChatSendQueueInputs) {
  const beginSend = useCallback(() => {
    useChatStore.getState().beginReply()
    threadScroll.followLatest(chatContainerRef.current?.scrollTop)
    activeStepsRef.current = []
    setActiveSteps([])
    setSendError(null)
    setLastFailedSend(null)
    scrollToBottom()
    setIsTyping(true)
    scrollToBottom()
  }, [threadScroll, chatContainerRef, activeStepsRef, setActiveSteps, setSendError, setLastFailedSend, scrollToBottom, setIsTyping])

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

type ChatSendMessageInputs = Pick<ReturnType<typeof useChatComposerState>, 'input' | 't' | 'setSendError' | 'addMessage' | 'allowanceText'> & Pick<ReturnType<typeof useChatComposerAttachments>, 'selectedTextFile' | 'selectedImage' | 'imagePreview'> & Pick<ReturnType<typeof useChatComposerAvailability>, 'attachments' | 'dailyBudgetReached' | 'atMessageLimit'> & Pick<ReturnType<typeof useChatComposerSession>, 'isOnline'> & Pick<ReturnType<typeof useChatComposerScroll>, 'scrollToBottom'> & Pick<ReturnType<typeof useChatSendQueue>, 'reportHistoryFailure' | 'sendPreparedAttempt'>

export function useChatSendMessage({ input, selectedTextFile, t, attachments, isOnline, setSendError, dailyBudgetReached, atMessageLimit, addMessage, allowanceText, scrollToBottom, reportHistoryFailure, selectedImage, imagePreview, sendPreparedAttempt }: ChatSendMessageInputs) {
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

type ChatSendRetryInputs = Pick<ReturnType<typeof useChatComposerSession>, 'isOnline'> & Pick<ReturnType<typeof useChatComposerAvailability>, 'atMessageLimit' | 'isSending'> & Pick<ReturnType<typeof useChatComposerState>, 'queryClient' | 'queuePaused' | 'queueReady' | 'queuedPrompts' | 'lastFailedSend' | 'setInput'> & Pick<ReturnType<typeof useChatSendQueue>, 'performSend'>

export function useChatSendRetry({ isOnline, atMessageLimit, queryClient, isSending, queuePaused, queueReady, queuedPrompts, lastFailedSend, performSend, setInput }: ChatSendRetryInputs) {
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
    const attempted = lastFailedSend
    const startingAccountGeneration = getAccountGeneration()
    const succeeded = await performSend(attempted, true)
    if (
      getAccountGeneration() === startingAccountGeneration &&
      succeeded &&
      attempted.clearDraftOnSuccess &&
      attempted.restoredDraftRevision !== null &&
      useChatStore.getState().draftRevision === attempted.restoredDraftRevision
    ) {
      setInput('')
      globalThis.localStorage.removeItem(CHAT_DRAFT_STORAGE_KEY)
    }
  }, [lastFailedSend, performSend, setInput])

  const canRetryLastSend = lastFailedSend !== null && !isSending
  return { sendQueuedPrompt, canRetryLastSend, retryLastSend }
}

type ChatBreakdownRefreshInputs = Pick<ReturnType<typeof useChatComposerState>, 'queryClient'>

export function useChatBreakdownRefresh({ queryClient }: ChatBreakdownRefreshInputs) {
  function handleBreakdownConfirmed() {
    void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
    void queryClient.invalidateQueries({ queryKey: habitKeys.searches() })
  }
  return { handleBreakdownConfirmed }
}

function createComposerReply({ t, activeStepsRef, setActiveSteps, stopReply, setStreamingMessageId, setIsTyping, addMessage, scrollToBottom }: Pick<ChatStreamInputs, 't' | 'activeStepsRef' | 'setActiveSteps' | 'stopReply' | 'setStreamingMessageId' | 'setIsTyping' | 'addMessage' | 'scrollToBottom'>, attempted: ChatStreamRequest<File>) {

  const startingAccountGeneration = getAccountGeneration()
  const ownsAccount = () => getAccountGeneration() === startingAccountGeneration
  let controller = new AbortController()
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const armIdleTimer = () => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => controller.abort(), CHAT_STREAM_IDLE_TIMEOUT_MS)
  }

  let draftMessageId: string | null = null
  const firstReveal = { completion: Promise.resolve() }
  const reply = new ChatReplyLifecycle({
    getChat: useChatStore.getState, ownsAccount, getDraftMessageId: () => draftMessageId,
    createMessageId: () => crypto.randomUUID(), stoppedMessage: t('shell.composer.queue.stopped'),
    clearActivity: () => { activeStepsRef.current = []; setActiveSteps([]) }, abort: () => controller.abort(),
  })
  const acceptSelectedOffer = () => {
    if (ownsAccount() && attempted.selectedOfferKey) useChatStore.getState().dismissOffer(attempted.selectedOfferKey)
  }
  const { isCancelled, isHidden, stop } = reply
  stopReply.current = stop
  const ensureDraftMessage = () => {
    if (draftMessageId) return draftMessageId
    draftMessageId = crypto.randomUUID()
    setStreamingMessageId(draftMessageId)
    setIsTyping(false)
    addMessage({ id: draftMessageId, role: 'ai', content: '', timestamp: new Date(), answerToBlockId: attempted.blockAnswer?.blockId })
    firstReveal.completion = new Promise<void>((resolve) => scrollToBottom(resolve))
    return draftMessageId
  }
  return { ownsAccount, armIdleTimer, firstReveal, reply, isCancelled, isHidden, stop, ensureDraftMessage, acceptSelectedOffer, getDraftMessageId: () => draftMessageId, resetController: () => { controller = new AbortController(); return controller }, clearIdleTimer: () => clearTimeout(idleTimer) }
}
