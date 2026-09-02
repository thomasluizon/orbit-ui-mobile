import type { AgentExecuteOperationResponse } from '../types/ai'
import type { ChatMessage } from '../types/chat'

export interface MessageBubbleProps {
  animateEntry?: boolean
  isStreaming?: boolean
  message: ChatMessage
  onActionChipClick?: (entityId: string, actionType: string) => void
  onBreakdownConfirmed?: () => void
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
