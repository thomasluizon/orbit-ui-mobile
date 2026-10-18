import type { AgentExecuteOperationResponse } from '../types/ai'
import type { RefreshPendingOperation, RevisePendingOperation } from '../hooks/pending-operation-revision-core'
import type { ActionResult, ChatMessage, ChatPart } from '../types/chat'
import type { BlockAnswerInteraction } from './block-answer'
import type { ChatStoreState } from '../stores/chat-store'
import { getChatMessageParts } from './final-message'
import { hasChatProse, stripChatDirectives } from './message-prose'
import { getRelatedSurfaces } from './related-surfaces'
import { partitionMessageActions } from './message-actions'
import { selectMessageOperationBlocks } from './message-operation-blocks'
import { attachClarificationPreview, updatePendingOperationMessage, type PendingOperationMessageState } from './pending-operation-message-state'

export interface MessageBubbleProps {
  blockAnswerInteraction?: BlockAnswerInteraction
  laterMessages?: readonly ChatMessage[]
  animateEntry?: boolean
  isStreaming?: boolean
  message: ChatMessage
  onActionChipClick?: (entityId: string, actionType: string) => void
  onBreakdownConfirmed?: () => void
  onPendingOperationRevise?: RevisePendingOperation
  onPendingOperationRefresh?: RefreshPendingOperation
  onPendingOperationConfirmExecute?: (
    pendingOperationId: string,
  ) => Promise<{ ok: boolean; error?: string; response?: AgentExecuteOperationResponse }>
  onPendingOperationPrepareStepUp?: (
    pendingOperationId: string,
  ) => Promise<
    | { ok: true; challengeId: string; confirmationToken: string }
    | { ok: false; error?: string }
  >
  onPendingOperationVerifyStepUp?: (
    pendingOperationId: string,
    challengeId: string,
    code: string,
    confirmationToken: string,
  ) => Promise<{ ok: boolean; error?: string; response?: AgentExecuteOperationResponse }>
}

type MessageBubblePart = { type: 'block'; key: number; part: Extract<ChatPart, { type: 'block' }>; expired: boolean | undefined } |
  { type: 'text'; key: number; text: string; showImage: boolean }

export interface MessageBubbleView {
  isUser: boolean
  parts: MessageBubblePart[]
  relatedSurfaces: ReturnType<typeof getRelatedSurfaces>
  nonSuggestionActions: ReturnType<typeof partitionMessageActions>['nonSuggestionActions']
  suggestions: { key: string; parentName: string; subHabits: NonNullable<ActionResult['suggestedSubHabits']>; warning: ActionResult['conflictWarning'] }[]
  outcomes: ReturnType<typeof selectMessageOperationBlocks>['outcomes']
}

export function getMessageBubbleView(props: MessageBubbleProps, dismissedBreakdowns: ReadonlySet<string>): MessageBubbleView {
  const { message, isStreaming = false, laterMessages } = props
  const isUser = message.role === 'user'
  const operationBlocks = selectMessageOperationBlocks(message)
  const actions = partitionMessageActions(operationBlocks.actions, message.policyDenials)
  const parts = (isUser ? [{ type: 'text' as const, text: message.content }] : getChatMessageParts(message, isStreaming)).flatMap<MessageBubblePart>((part, key) => {
    if (!part) return []
    if (part.type === 'block') return [{ type: 'block' as const, key, part,
      expired: laterMessages?.some(later => !('blockId' in part.block) || later.answerToBlockId !== part.block.blockId) }]
    const text = isUser ? part.text : stripChatDirectives(part.text, isStreaming)
    if (!isUser && !hasChatProse(text) && !(key === 0 && message.imageUrl)) return []
    return [{ type: 'text' as const, key, text, showImage: key === 0 && Boolean(message.imageUrl) }]
  })
  return {
    isUser,
    parts,
    relatedSurfaces: getRelatedSurfaces(message.relatedSurfaces),
    nonSuggestionActions: actions.nonSuggestionActions,
    suggestions: actions.suggestionActions.flatMap(action => {
      const key = action.entityId ?? action.entityName ?? 'suggestion'
      return dismissedBreakdowns.has(key) ? [] : [{ key, parentName: action.entityName || 'Habit',
        subHabits: action.suggestedSubHabits ?? [], warning: action.conflictWarning }]
    }),
    outcomes: operationBlocks.outcomes,
  }
}

export function getMessageBubbleOperations(props: MessageBubbleProps, transitionMessage: ChatStoreState['transitionMessage']) {
  const { message, onPendingOperationConfirmExecute, onPendingOperationPrepareStepUp, onPendingOperationVerifyStepUp } = props
  const actions = partitionMessageActions(selectMessageOperationBlocks(message).actions, message.policyDenials)
  const onStateChange = (operationId: string, patch: PendingOperationMessageState) => transitionMessage(message.id,
    current => updatePendingOperationMessage(current, operationId, patch))
  return {
    clarifications: actions.clarificationActions.map(action => ({
      key: action.clarificationRequest.operationId,
      clarificationRequest: action.clarificationRequest,
      entityName: action.entityName,
      pendingOperation: message.clarificationPreviews?.[action.clarificationRequest.operationId],
      savedState: message.pendingOperationStates?.[message.clarificationPreviews?.[action.clarificationRequest.operationId]?.id ?? ''],
      onPreview: (operation: NonNullable<ChatMessage['pendingOperations']>[number]) => transitionMessage(message.id,
        current => attachClarificationPreview(current, action.clarificationRequest.operationId, operation)),
      onStateChange,
      onPendingOperationRevise: props.onPendingOperationRevise,
      onPendingOperationRefresh: props.onPendingOperationRefresh,
      onPendingOperationConfirmExecute: onPendingOperationConfirmExecute,
      onPendingOperationPrepareStepUp: onPendingOperationPrepareStepUp,
      onPendingOperationVerifyStepUp: onPendingOperationVerifyStepUp,
      onActionChipClick: props.onActionChipClick,
    })),
    pendingOperations: onPendingOperationConfirmExecute && onPendingOperationPrepareStepUp && onPendingOperationVerifyStepUp
      ? (message.pendingOperations ?? []).map(pendingOperation => ({
        key: pendingOperation.id,
        pendingOperation,
        savedState: message.pendingOperationStates?.[pendingOperation.id],
        onStateChange: (patch: PendingOperationMessageState) => onStateChange(pendingOperation.id, patch),
        onRevise: props.onPendingOperationRevise,
        onRefresh: props.onPendingOperationRefresh,
        onOpenTarget: props.onActionChipClick,
        onConfirmExecute: onPendingOperationConfirmExecute,
        onPrepareStepUp: onPendingOperationPrepareStepUp,
        onVerifyStepUp: onPendingOperationVerifyStepUp,
      })) : [],
  }
}
