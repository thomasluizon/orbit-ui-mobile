import type { AgentOperationResult, PendingAgentOperation } from '../types/ai'
import type { ChatMessage } from '../types/chat'
import { getPendingOperationExecutionCanRetry, getPendingOperationExecutionStatus, type PendingOperationExecutionResult } from '../hooks/pending-operation-card-core'

export interface PendingOperationMessageState {
  status?: 'done' | 'failed'
  completedOperation?: AgentOperationResult
  canRetry?: boolean
  dismissed?: boolean
  rejected?: boolean
  stale?: boolean
  refreshUnavailable?: boolean
  editedItemIds?: string[]
  operation?: PendingAgentOperation
}

export function pendingOperationExecutionPatch(result: PendingOperationExecutionResult): PendingOperationMessageState {
  return {
    status: getPendingOperationExecutionStatus(result),
    completedOperation: result.response?.operation,
    canRetry: getPendingOperationExecutionCanRetry(result),
  }
}

export function updatePendingOperationMessage(
  message: ChatMessage,
  operationId: string,
  patch: PendingOperationMessageState,
): ChatMessage {
  return {
    ...message,
    pendingOperationStates: {
      ...message.pendingOperationStates,
      [operationId]: { ...message.pendingOperationStates?.[operationId], ...patch },
    },
  }
}

export function attachClarificationPreview(
  message: ChatMessage,
  clarificationOperationId: string,
  operation: PendingAgentOperation,
): ChatMessage {
  return {
    ...message,
    clarificationPreviews: { ...message.clarificationPreviews, [clarificationOperationId]: operation },
  }
}
