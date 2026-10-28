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
import { pendingOperationExecutionPatch } from './pending-operation-message-state'

export interface MessageBubbleProps {
  onSendMessage?: (message: string) => Promise<void>
  blockAnswerInteraction?: BlockAnswerInteraction
  earlierMessages?: readonly ChatMessage[]
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
  showUnreadableReply: boolean
  showOperationUpdate: boolean
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
  const previewIds = new Set(canRenderPendingOperations(props)
    ? [...(props.earlierMessages ?? []), message].flatMap(entry => messageOperationIds(entry, true)) : [])
  const outcomes = operationBlocks.outcomes.filter(outcome => !outcome.pendingOperationId || !previewIds.has(outcome.pendingOperationId))
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
    showOperationUpdate: !isUser && !isStreaming && parts.length === 0 && outcomes.length === 0
      && operationBlocks.outcomes.length > 0 && !operationBlocks.actions.length,
    showUnreadableReply: !isUser && !isStreaming && parts.length === 0
      && !message.imageUrl && !operationBlocks.actions.length && !operationBlocks.outcomes.length
      && !message.pendingOperations?.length && !message.policyDenials?.length
      && !Object.keys(message.clarificationPreviews ?? {}).length,
    parts,
    relatedSurfaces: getRelatedSurfaces([...(message.relatedSurfaces ?? []),
      ...(parts.some(part => part.type === 'block' && part.part.kind === 'gamification') ? ['gamification'] : [])]),
    nonSuggestionActions: actions.nonSuggestionActions,
    suggestions: actions.suggestionActions.flatMap(action => {
      const key = action.entityId ?? action.entityName ?? 'suggestion'
      return dismissedBreakdowns.has(key) ? [] : [{ key, parentName: action.entityName || 'Habit',
        subHabits: action.suggestedSubHabits ?? [], warning: action.conflictWarning }]
    }),
    outcomes,
  }
}

export function getChatCompletionText(message: ChatMessage, words: { ready: string; unreadable: string }): string {
  const view = getMessageBubbleView({ message }, new Set())
  if (view.showUnreadableReply) return words.unreadable
  return view.parts.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n').trim() || words.ready
}

function messageOperationIds(message: ChatMessage, canRenderPending: boolean): string[] {
  const pendingOperations = canRenderPending ? message.pendingOperations ?? [] : []
  return [...pendingOperations, ...Object.values(message.clarificationPreviews ?? {})].map(operation => operation.id)
}

function canRenderPendingOperations(props: MessageBubbleProps): boolean {
  return Boolean(props.onPendingOperationConfirmExecute && props.onPendingOperationPrepareStepUp && props.onPendingOperationVerifyStepUp)
}

function selectOwnedOperationBlocks(props: MessageBubbleProps) {
  const canRenderPending = canRenderPendingOperations(props)
  const previousIds = new Set(props.earlierMessages?.flatMap(message => messageOperationIds(message, canRenderPending)))
  const pendingOperations = [...new Map((props.message.pendingOperations ?? []).map(operation => [operation.id, operation])).values()]
    .filter(operation => !previousIds.has(operation.id))
  const renderedOperations = canRenderPending ? pendingOperations : []
  const claimedIds = new Set([...previousIds, ...renderedOperations.map(operation => operation.id)])
  const clarificationIds = new Set<string>()
  const clarifications = partitionMessageActions(selectMessageOperationBlocks(props.message).actions, props.message.policyDenials).clarificationActions
    .filter(action => {
      if (clarificationIds.has(action.clarificationRequest.operationId)) return false
      clarificationIds.add(action.clarificationRequest.operationId)
      const preview = props.message.clarificationPreviews?.[action.clarificationRequest.operationId]
      if (!preview) return true
      if (claimedIds.has(preview.id)) return false
      claimedIds.add(preview.id)
      return true
    })
  return { pendingOperations, clarifications }
}

function currentOperationState(props: MessageBubbleProps, operationId: string): PendingOperationMessageState | undefined {
  const saved = props.message.pendingOperationStates?.[operationId]
  const current = props.laterMessages?.flatMap(message => message.operations ?? [])
    .filter(operation => operation.pendingOperationId === operationId && operation.status !== 'PendingConfirmation').at(-1)
  return current ? { ...saved, ...pendingOperationExecutionPatch({ ok: current.status === 'Succeeded', response: { operation: current } }) } : saved
}

export function getMessageBubbleOperations(props: MessageBubbleProps, transitionMessage: ChatStoreState['transitionMessage']) {
  const { message, onPendingOperationConfirmExecute, onPendingOperationPrepareStepUp, onPendingOperationVerifyStepUp } = props
  const owned = selectOwnedOperationBlocks(props)
  const onStateChange = (operationId: string, patch: PendingOperationMessageState) => transitionMessage(message.id,
    current => updatePendingOperationMessage(current, operationId, patch))
  return {
    clarifications: owned.clarifications.map(action => ({
      key: action.clarificationRequest.operationId,
      clarificationRequest: action.clarificationRequest,
      entityName: action.entityName,
      pendingOperation: message.clarificationPreviews?.[action.clarificationRequest.operationId],
      savedState: currentOperationState(props, message.clarificationPreviews?.[action.clarificationRequest.operationId]?.id ?? ''),
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
      ? owned.pendingOperations.map(pendingOperation => ({
        key: pendingOperation.id,
        pendingOperation,
        focusTitleOnMount: Object.values(message.habitSuggestionOperations ?? {}).includes(pendingOperation.id) && !message.pendingOperationStates?.[pendingOperation.id],
        savedState: currentOperationState(props, pendingOperation.id),
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
