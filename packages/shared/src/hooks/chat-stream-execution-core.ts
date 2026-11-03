import { updateMessagePlanStep, buildChatFinalMessageFields, needsNewChatTurn, getChatTurnFailure } from '../chat'
import { sendChatStreamTurn } from '../chat/send-stream-turn'
import type { ChatStreamCallbacks, ChatStreamRequest, ChatStreamResult, PreparedChatTurn, ChatReplyLifecycle } from '../chat'
import type { ChatResponse } from '../types/chat'
import type { ChatTurnOptions } from '../chat/stream-turn'
import { reconcileAgentQueries, settleChatResponse } from './chat-composer-core'
import type { ComposerStreamContext, ComposerSettlementContext, ToolStep } from './chat-send-stream-core'

interface StreamLifecycle {
  reply: ChatReplyLifecycle
  ensureDraftMessage: () => string
  getDraftMessageId: () => string | null
  getFirstReveal: () => Promise<void>
  ownsAccount: () => boolean
}

export async function executeComposerStream<Image, Payload>(
  context: ComposerStreamContext<Image, Payload>,
  attempted: ChatStreamRequest<Image> & { turn?: PreparedChatTurn<Payload> },
  turn: PreparedChatTurn<Payload>,
  lifecycle: StreamLifecycle,
  open: ChatTurnOptions<Payload>['open'],
): Promise<ChatStreamResult> {
  const { reply, ensureDraftMessage, getDraftMessageId, getFirstReveal, ownsAccount } = lifecycle
  const { turnReconciliation, queryClient, applyFinalResponse, activeStepsRef, getChat, t } = context
  const outcome = await sendChatStreamTurn({
    turn,
    isCancelled: reply.isCancelled,
    open,
    callbacks: createComposerStreamCallbacks(context, reply.isHidden, ensureDraftMessage, getDraftMessageId),
  })
  if (outcome.kind === 'cancelled') return outcome
  if (needsNewChatTurn(outcome)) attempted.turn = undefined
  await turnReconciliation.reconcileAfterTurn(outcome, () => reconcileAgentQueries(queryClient))
  if (reply.isHidden() && outcome.kind !== 'final') return { kind: 'cancelled' }
  if (outcome.kind === 'final') {
    if (ownsAccount() && attempted.selectedOfferKey) getChat().dismissOffer(attempted.selectedOfferKey)
    await applyFinalResponse(outcome.response, getDraftMessageId(), activeStepsRef.current, getFirstReveal(), attempted.messageCost, reply)
    return reply.canComplete() ? { kind: 'final' } : { kind: 'cancelled' }
  }
  return { kind: 'failed', failure: getChatTurnFailure(outcome, t('chat.sendError')), draftMessageId: getDraftMessageId() }
}

function createComposerStreamCallbacks(
  { appendToMessageContent, scrollToBottom, updateMessage, setIsTyping, activeStepsRef, setActiveSteps, getChat }: Pick<ComposerStreamContext<never, never>, 'appendToMessageContent' | 'scrollToBottom' | 'updateMessage' | 'setIsTyping' | 'activeStepsRef' | 'setActiveSteps' | 'getChat'>,
  isHidden: () => boolean,
  ensureDraftMessage: () => string,
  getDraftMessageId: () => string | null,
): ChatStreamCallbacks {
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
    onPlan: (plan) => {
      if (isHidden()) return
      updateMessage(ensureDraftMessage(), { plan })
      scrollToBottom()
    },
    onPlanStep: (planId, step) => {
      const draftMessageId = getDraftMessageId()
      if (isHidden() || !draftMessageId) return
      getChat().transitionMessage(draftMessageId, message => updateMessagePlanStep(message, planId, step))
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

