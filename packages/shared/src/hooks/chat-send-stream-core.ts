import type { QueryClient } from '@tanstack/query-core'
import type { ChatStoreState } from '../stores/chat-store'
import type { ChatClientContext,ChatResponse } from '../types/chat'
import { CHAT_STREAM_IDLE_TIMEOUT_MS, ChatReplyLifecycle } from '../chat'
import type { ChatStreamRequest, ChatStreamResult, PreparedChatTurn, ChatTurnReconciliation, sendChatStreamTurn } from '../chat'
import { loadModule } from '../utils/load-module'
import { classifySendFailure,reconcileAgentQueries } from './chat-composer-core'
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

export type ToolStep = { domain: string; access: string }
type Translate = (key: string, values?: Record<string, string | number | Date>) => string
type Current<Value> = { current: Value }
interface ComposerReplyContext extends Pick<ChatStoreState, 'setStreamingMessageId' | 'setIsTyping' | 'addMessage'> {
  t: Translate
  onModuleLoadError: (error: unknown) => void
  activeStepsRef: Current<ToolStep[]>
  setActiveSteps: (steps: ToolStep[]) => void
  stopReply: Current<(() => void) | null>
  scrollToBottom: (afterScroll?: () => void) => void
  getAccountGeneration: () => number
  getChat: () => ChatStoreState
  createMessageId: () => string
}
export interface ComposerSettlementContext extends Omit<ComposerReplyContext, 'stopReply' | 'getAccountGeneration' | 't'>, Pick<ChatStoreState, 'updateMessage'> {
  queryClient: QueryClient
  threadScroll: ReturnType<typeof createChatThreadScroll>
  setChat: (state: Partial<ChatStoreState>) => void
}
export interface ComposerStreamContext<Image, Payload> extends ComposerReplyContext, Pick<ChatStoreState, 'appendToMessageContent' | 'updateMessage'> {
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
  const { t, activeStepsRef, setActiveSteps, stopReply, setIsTyping, scrollToBottom, turnReconciliation, queryClient, getAccountGeneration, getChat, createMessageId, setStreamingMessageId, addMessage } = context
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
  const { isHidden, stop } = reply
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
    const { executeComposerStream } = await loadModule(() => import('./chat-stream-execution-core'), context.onModuleLoadError)
    if (isHidden()) return { kind: 'cancelled' }
    if (turnReconciliation.isPending) await turnReconciliation.reconcile(() => reconcileAgentQueries(queryClient))
    if (isHidden()) return { kind: 'cancelled' }
    attempted.turn ??= { key: context.createTurnKey(), payload: context.buildChatFormData(attempted) }
    const open = context.createTransport(attempted, {
      resetController: () => { controller.abort(); controller = new AbortController(); return controller }, armIdleTimer, ownsAccount,
    }, onAccepted)
    const outcome = await executeComposerStream(context, attempted, attempted.turn, {
      reply, ensureDraftMessage, getDraftMessageId: () => draftMessageId, getFirstReveal: () => firstReveal,
      ownsAccount,
    }, open)
    finalReceived = outcome.kind === 'final'
    return outcome
  } catch (error: unknown) {
    return resolveComposerStreamFailure(context, reply, error, draftMessageId)
  } finally {
    clearTimeout(idleTimer)
    controller.abort()
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

export async function settleComposerResponse(...args: Parameters<typeof import('./chat-stream-execution-core').settleComposerResponse>) {
  const { settleComposerResponse: settle } = await loadModule(() => import('./chat-stream-execution-core'), args[0].onModuleLoadError)
  return settle(...args)
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
