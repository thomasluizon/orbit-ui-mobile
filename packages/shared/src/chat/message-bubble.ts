import type { AgentExecuteOperationResponse } from '../types/ai'
import type { RefreshPendingOperation, RevisePendingOperation } from '../hooks/pending-operation-revision-core'
import type { ChatMessage } from '../types/chat'
import type { BlockAnswerInteraction } from './block-answer'

export interface MessageBubbleProps {
  blockAnswerInteraction?: BlockAnswerInteraction
  hasLaterMessage?: boolean
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
