import type { QueryClient } from '@tanstack/query-core'
import type { ChatStoreState } from '../stores/chat-store'
import type { ChatClientContext,ChatResponse } from '../types/chat'
import { type ChatStreamRequest,type ChatStreamResult,type PreparedChatTurn,type ChatTurnReconciliation,buildChatFinalMessageFields,CHAT_STREAM_IDLE_TIMEOUT_MS,sendChatStreamTurn,ChatReplyLifecycle,needsNewChatTurn,getChatTurnFailure } from '../chat'
import { classifySendFailure,reconcileAgentQueries,settleChatResponse } from './chat-composer-core'
import type { createChatThreadScroll } from './chat-thread-scroll-core'
import { getFriendlyErrorMessage } from '../utils/error-utils'

export interface ComposerAttempt<Image, Payload> {
  turn?: PreparedChatTurn<Payload>
  intendedAccountId?: string | null
  content: string
  draftContent: string
  image: Image | null
  preview: string | null
  textFile: { name: string; content: string } | null
  restoreDraftOnFailure: boolean
  clearDraftOnSuccess: boolean
  restoredDraftRevision: number | null
  messageOrigin?: 'followUp'
  selectedOfferKey?: ChatClientContext['selectedOfferKey']
  previousStartingStep?: ChatClientContext['previousStartingStep']
  contextualRequest?: NonNullable<ChatStoreState['contextualSuggestion']>
}

type ToolStep = { domain: string; access: string }
type Translate = (key: string, values?: Record<string, string | number | Date>) => string
type Current<Value> = { current: Value }
interface ComposerReplyContext extends Pick<ChatStoreState, 'setStreamingMessageId' | 'setIsTyping' | 'addMessage'> {
  t: Translate
  activeStepsRef: Current<ToolStep[]>
  setActiveSteps: (steps: ToolStep[]) => void
  stopReply: Current<(() => void) | null>
  scrollToBottom: (afterScroll?: () => void) => void
  getAccountGeneration: () => number
  getChat: () => ChatStoreState
  createMessageId: () => string
}
interface ComposerSettlementContext extends Omit<ComposerReplyContext, 'stopReply' | 'getAccountGeneration' | 't'>, Pick<ChatStoreState, 'updateMessage'> {
  queryClient: QueryClient
  threadScroll: ReturnType<typeof createChatThreadScroll>
  setChat: (state: Partial<ChatStoreState>) => void
}
interface ComposerStreamContext<Image, Payload> extends ComposerReplyContext, Pick<ChatStoreState, 'appendToMessageContent' | 'updateMessage'> {
  createTurnKey: () => string
  queryClient: QueryClient
  turnReconciliation: ChatTurnReconciliation
  buildChatFormData: (attempted: ChatStreamRequest<Image>) => Payload
  createTransport: (attempted: ChatStreamRequest<Image>, reply: { resetController: () => AbortController; armIdleTimer: () => void; ownsAccount: () => boolean }, onAccepted?: () => void) => Parameters<typeof sendChatStreamTurn<Payload>>[0]['open']
  applyFinalResponse: (response: ChatResponse, draftMessageId: string | null, toolSteps: ToolStep[], firstReveal: Promise<void>, messageCost: 0 | 1, reply: ChatReplyLifecycle) => Promise<void>
  allowanceText: Translate
  isAbortError: (error: unknown) => boolean
}

export async function runComposerStream<Image, Payload>(context: ComposerStreamContext<Image, Payload>, attempted: ChatStreamRequest<Image> & { turn?: PreparedChatTurn<Payload> }, onAccepted?: () => void): Promise<ChatStreamResult> {
  const { t, activeStepsRef, setActiveSteps, stopReply, setIsTyping, scrollToBottom, turnReconciliation, queryClient, applyFinalResponse, getAccountGeneration, getChat, createMessageId, setStreamingMessageId, addMessage } = context
  const startingAccountGeneration = getAccountGeneration()
  const ownsAccount = () => getAccountGeneration() === startingAccountGeneration
  let controller = new AbortController()
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const armIdleTimer = () => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => controller.abort(), CHAT_STREAM_IDLE_TIMEOUT_MS)
  }
  let draftMessageId: string | null = null
  let firstReveal = Promise.resolve()
  const reply = new ChatReplyLifecycle({
    getChat, ownsAccount, getDraftMessageId: () => draftMessageId, createMessageId,
    stoppedMessage: t('shell.composer.queue.stopped'),
    clearActivity: () => { activeStepsRef.current = []; setActiveSteps([]) }, abort: () => controller.abort(),
  })
  const { isCancelled, isHidden, stop } = reply
  stopReply.current = stop
  const ensureDraftMessage = () => {
    if (draftMessageId) return draftMessageId
    draftMessageId = createMessageId()
    setStreamingMessageId(draftMessageId)
    setIsTyping(false)
    addMessage({ id: draftMessageId, role: 'ai', content: '', timestamp: new Date(), answerToBlockId: attempted.blockAnswer?.blockId })
    firstReveal = new Promise<void>((resolve) => scrollToBottom(resolve))
    return draftMessageId
  }
  let finalReceived = false
  try {
    if (turnReconciliation.isPending) await turnReconciliation.reconcile(() => reconcileAgentQueries(queryClient))
    if (isHidden()) return { kind: 'cancelled' }
    attempted.turn ??= { key: context.createTurnKey(), payload: context.buildChatFormData(attempted) }
    const outcome = await sendChatStreamTurn({
      turn: attempted.turn,
      isCancelled,
      open: context.createTransport(attempted, {
        resetController: () => { controller = new AbortController(); return controller }, armIdleTimer, ownsAccount,
      }, onAccepted),
      callbacks: createComposerStreamCallbacks(context, isHidden, ensureDraftMessage, () => draftMessageId),
    })
    if (outcome.kind === 'cancelled') return outcome
    if (needsNewChatTurn(outcome)) attempted.turn = undefined
    await turnReconciliation.reconcileAfterTurn(outcome, () => reconcileAgentQueries(queryClient))
    if (isHidden() && outcome.kind !== 'final') return { kind: 'cancelled' }
    if (outcome.kind === 'final') {
      if (ownsAccount() && attempted.selectedOfferKey) getChat().dismissOffer(attempted.selectedOfferKey)
      await applyFinalResponse(outcome.response, draftMessageId, activeStepsRef.current, firstReveal, attempted.messageCost, reply)
      finalReceived = reply.canComplete()
      return finalReceived ? { kind: 'final' } : { kind: 'cancelled' }
    }
    return { kind: 'failed', failure: getChatTurnFailure(outcome, t('chat.sendError')), draftMessageId }
  } catch (error: unknown) {
    return resolveComposerStreamFailure(context, reply, error, draftMessageId)
  } finally {
    clearTimeout(idleTimer)
    if (stopReply.current === stop) stopReply.current = null
    reply.finish(finalReceived)
  }
}

function resolveComposerStreamFailure(
  context: Pick<ComposerStreamContext<never, never>, 'isAbortError' | 'allowanceText'>,
  reply: ChatReplyLifecycle,
  error: unknown,
  draftMessageId: string | null,
): ChatStreamResult {
  if (reply.isHidden()) return { kind: 'cancelled' }
  return { kind: 'failed', failure: {
    status: context.isAbortError(error) ? 408 : null,
    error: getFriendlyErrorMessage(error, context.allowanceText, 'chat.sendError', 'generic'), code: null,
  }, draftMessageId }
}

function createComposerStreamCallbacks(
  { appendToMessageContent, scrollToBottom, updateMessage, setIsTyping, activeStepsRef, setActiveSteps }: Pick<ComposerStreamContext<never, never>, 'appendToMessageContent' | 'scrollToBottom' | 'updateMessage' | 'setIsTyping' | 'activeStepsRef' | 'setActiveSteps'>,
  isHidden: () => boolean,
  ensureDraftMessage: () => string,
  getDraftMessageId: () => string | null,
) {
  return {
    onDelta: (text: string) => {
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
    onStep: (step: ToolStep) => {
      if (isHidden()) return
      activeStepsRef.current = [...activeStepsRef.current, step]
      setActiveSteps(activeStepsRef.current)
    },
  }
}

export async function settleComposerResponse(context: ComposerSettlementContext, response: ChatResponse, draftMessageId: string | null, toolSteps: ToolStep[], firstReveal: Promise<void>, messageCost: 0 | 1, reply: ChatReplyLifecycle) {
  const { threadScroll, setIsTyping, activeStepsRef, setActiveSteps, updateMessage, addMessage, setStreamingMessageId, scrollToBottom, queryClient, getChat, setChat, createMessageId } = context
    if (!reply.isHidden() && draftMessageId && response.parts?.some(part => part?.type === 'block')) {
      await reply.waitForReveal(firstReveal)
      if (!reply.isHidden()) threadScroll.holdPosition()
    }
    if (!reply.isCancelled() && response.conversationId) setChat({ conversationId: response.conversationId, serverConversationId: response.conversationId })
    if (!reply.isHidden()) {
      setIsTyping(false)
      activeStepsRef.current = []
      setActiveSteps([])

      const finalFields = buildChatFinalMessageFields(response, toolSteps)
      if (draftMessageId) {
        updateMessage(draftMessageId, finalFields)
      } else {
        addMessage({
          id: createMessageId(),
          role: 'ai',
          timestamp: new Date(),
          ...finalFields,
        })
      }
      if (getChat().streamingMessageId === draftMessageId) {
        setStreamingMessageId(null)
      }

      scrollToBottom()
    }
    if (!reply.isCancelled()) {
      const settlement = settleChatResponse(queryClient, response, messageCost)
      reply.finish(true)
      await settlement
    }
}

interface ComposerFailureContext<Attempt extends ComposerAttempt<unknown, unknown>> extends Pick<ChatStoreState, 'updateMessage' | 'addMessage' | 'setIsTyping'> {
  restoreImage: (image: Attempt['image'], preview: string | null) => void
  restoreTextFile: (file: Attempt['textFile']) => void
  setDailyBudgetDate: (date: string) => void
  today: string
  setSendError: (error: string | null) => void
  setLastFailedSend: (attempt: Attempt | null) => void
  allowanceText: Translate
  scrollToBottom: () => void
  activeStepsRef: Current<ToolStep[]>
  setActiveSteps: (steps: ToolStep[]) => void
  setInput: ChatStoreState['setDraft']
  t: Translate
  getChat: () => ChatStoreState
  setChat: (state: (chat: ChatStoreState) => Partial<ChatStoreState>) => void
  createMessageId: () => string
  accountChangedCode?: string
}

export function createComposerFailureHandlers<Attempt extends ComposerAttempt<unknown, unknown>>({ restoreImage, restoreTextFile, setDailyBudgetDate, today, setSendError, setLastFailedSend, allowanceText, updateMessage, addMessage, scrollToBottom, activeStepsRef, setActiveSteps, setIsTyping, setInput, t, getChat, setChat, createMessageId, accountChangedCode }: ComposerFailureContext<Attempt>) {
  const handleDailyBudgetExceeded = (draftMessageId: string | null, attempted?: Attempt) => {
    if (attempted?.clearDraftOnSuccess && attempted.restoredDraftRevision === getChat().draftRevision) {
      restoreImage(attempted.image, attempted.preview)
      restoreTextFile(attempted.textFile)
    }
    setDailyBudgetDate(today)
    setSendError(null)
    setLastFailedSend(null)
    if (draftMessageId) setChat(state => ({ messages: state.messages.filter(message => message.id !== draftMessageId) }))
  }

  const handleAllowanceExceeded = (draftMessageId: string | null) => {
    setSendError(null)
    setLastFailedSend(null)
    const limitReason = allowanceText('chat.limitReachedError')
    if (draftMessageId) {
      updateMessage(draftMessageId, { content: limitReason })
    } else {
      addMessage({
        id: createMessageId(),
        role: 'ai',
        content: limitReason,
        timestamp: new Date(),
      })
    }
    scrollToBottom()
  }

  const handleFailedSend = (
    failureInput: Extract<ChatStreamResult, { kind: 'failed' }>['failure'],
    attempted: Attempt,
    draftMessageId: string | null,
  ) => {
    activeStepsRef.current = []
    setActiveSteps([])
    setIsTyping(false)
    let failedAttempt = attempted
    if (attempted.restoreDraftOnFailure && !getChat().draft) {
      setInput(attempted.draftContent)
      failedAttempt = {
        ...attempted,
        restoreDraftOnFailure: false,
        restoredDraftRevision: getChat().draftRevision,
      }
    }
    if (accountChangedCode && failureInput.code === accountChangedCode) {
      const message = t('errors.api.accountChanged')
      setSendError(message)
      setLastFailedSend(null)
      if (draftMessageId) updateMessage(draftMessageId, { content: message })
      else addMessage({ id: createMessageId(), role: 'ai', content: message, timestamp: new Date() })
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
        id: createMessageId(),
        role: 'ai',
        content: t('chat.aiError'),
        timestamp: new Date(),
      })
    }
    scrollToBottom()
  }
  return { handleFailedSend, handleAllowanceExceeded, handleDailyBudgetExceeded }
}

export async function retryComposerSend<Attempt extends Pick<ComposerAttempt<unknown, unknown>, 'clearDraftOnSuccess' | 'restoredDraftRevision'>>(attempted: Attempt | null, performSend: (attempt: Attempt, isRetry: boolean) => Promise<boolean>, getChat: () => ChatStoreState, getAccountGeneration: () => number, clearDraft: () => void) {
  const sendState = getChat()
  if (!attempted || sendState.isTyping || sendState.streamingMessageId !== null) return
  const startingAccountGeneration = getAccountGeneration()
  const succeeded = await performSend(attempted, true)
  if (getAccountGeneration() === startingAccountGeneration && succeeded && attempted.clearDraftOnSuccess &&
    attempted.restoredDraftRevision !== null && getChat().draftRevision === attempted.restoredDraftRevision) clearDraft()
}
