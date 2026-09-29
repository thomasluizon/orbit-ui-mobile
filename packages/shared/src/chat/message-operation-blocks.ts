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
  const sourceActions = message.actions ?? []
  const hiddenActionIndexes = new Set<number>()
  for (const operation of operations) {
    if (operation.status !== 'PendingConfirmation') continue
    const pending = message.pendingOperations?.find((entry) => entry.id === operation.pendingOperationId)
    if (!pending) continue
    const matches = (index: number) => !hiddenActionIndexes.has(index)
      && sameOperation(sourceActions[index]!.type, operation.sourceName)
    const namedIndex = sourceActions.findIndex((action, index) => matches(index)
      && pending.items?.some((item) => item.entityName === action.entityName))
    const index = namedIndex === -1 ? sourceActions.findIndex((_, candidate) => matches(candidate)) : namedIndex
    if (index !== -1) hiddenActionIndexes.add(index)
  }
  const actions = sourceActions.filter((action, index) => {
    if (hiddenActionIndexes.has(index)) return false
    if (action.status !== 'Failed') return true
    const outcomeIndex = representedFailures.findIndex((outcome) => sameOperation(action.type, outcome.source))
    if (outcomeIndex === -1) return true
    representedFailures.splice(outcomeIndex, 1)
    return false
  })
  return { actions, outcomes }
}
