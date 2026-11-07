import { z } from 'zod'
import { API } from '../api/endpoints'
import type { AgentOperationResult } from '../types/ai'
import { chatResponseSchema, type ChatMessage } from '../types/chat'
import { conversationPreviewOutcomeSchema, type ConversationPage, type ConversationPreviewOutcome } from '../types/conversation'
import { getPendingOperationItemResults, reportsPendingOperationItemResults } from '../hooks/pending-operation-card-core'
import { buildChatFinalMessageFields } from './final-message'
import { pendingOperationExecutionPatch, type PendingOperationMessageState } from './pending-operation-message-state'

function restoredExecutionState(execution: AgentOperationResult | undefined): PendingOperationMessageState {
  if (!execution || (reportsPendingOperationItemResults(execution) && !getPendingOperationItemResults(execution))) return { recordedOutcome: 'approved' }
  return { ...pendingOperationExecutionPatch({ ok: true, response: { operation: execution } }), canRetry: false }
}

function restoredOperationState(outcome: ConversationPreviewOutcome): PendingOperationMessageState | undefined {
  switch (outcome.Outcome) {
    case 'pending': return undefined
    case 'rejected': return { rejected: true, dismissed: true }
    case 'approved': return restoredExecutionState(outcome.Execution)
    default: return { recordedOutcome: outcome.Outcome }
  }
}

export function restoreConversationPage(page: ConversationPage): ChatMessage[] {
  return page.turns.map(turn => {
    const message: ChatMessage = {
      id: `stored-${turn.turnId}-${turn.role}`, role: turn.role === 'user' ? 'user' : 'ai',
      content: turn.content ?? '', timestamp: new Date(turn.createdAtUtc), restored: true,
    }
    if (turn.image) {
      message.imageUrl = API.chat.conversationImage(page.conversationId, turn.turnId)
      message.storedImage = { conversationId: page.conversationId, turnId: turn.turnId }
    }
    if (turn.role === 'assistant' && turn.responseJson) {
      Object.assign(message, buildChatFinalMessageFields(chatResponseSchema.parse(JSON.parse(turn.responseJson)), []))
      const outcomes = z.array(conversationPreviewOutcomeSchema).parse(JSON.parse(turn.previewOutcomesJson))
      message.pendingOperationStates = Object.fromEntries(outcomes.flatMap(outcome => {
        const state = restoredOperationState(outcome)
        return state ? [[outcome.PendingOperationId, state]] : []
      }))
    }
    if (turn.role === 'assistant' && turn.plan) message.plan = turn.plan
    return message
  })
}
