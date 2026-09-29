import type { ChatMessage } from '../types/chat'
import { coalesceAgentOperationOutcomes, type AgentOperationOutcome } from '../utils/agent-operation-outcomes'

export interface MessageOperationBlocks {
  actions: NonNullable<ChatMessage['actions']>
  outcomes: AgentOperationOutcome[]
}

function sameOperation(actionType: string, sourceName: string): boolean {
  return actionType.replaceAll('_', '').toLowerCase() === sourceName.replaceAll('_', '').toLowerCase()
}

export function selectMessageOperationBlocks(message: ChatMessage): MessageOperationBlocks {
  const operations = message.operations ?? []
  const outcomes = coalesceAgentOperationOutcomes(operations, message.policyDenials ?? [])
    .filter((outcome) => outcome.status === 'Failed' || outcome.status === 'Denied' || outcome.status === 'UnsupportedByPolicy')
  const representedFailures = [...outcomes]
  const pendingSources = operations
    .filter((operation) => operation.status === 'PendingConfirmation' && message.pendingOperations?.some((pending) => pending.id === operation.pendingOperationId))
    .map((operation) => operation.sourceName)
  const actions = (message.actions ?? []).filter((action) => {
    if (pendingSources.some((source) => sameOperation(action.type, source))) return false
    if (action.status !== 'Failed') return true
    const outcomeIndex = representedFailures.findIndex((outcome) => sameOperation(action.type, outcome.source))
    if (outcomeIndex === -1) return true
    representedFailures.splice(outcomeIndex, 1)
    return false
  })
  return { actions, outcomes }
}
