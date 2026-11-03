import { z } from 'zod'
import { API } from '../api/endpoints'
import { chatResponseSchema, type ChatMessage } from '../types/chat'
import { conversationPreviewOutcomeSchema, type ConversationPage } from '../types/conversation'
import { buildChatFinalMessageFields } from './final-message'

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
      message.pendingOperationStates = Object.fromEntries(outcomes.flatMap(outcome => outcome.Outcome === 'pending' ? [] : [[
        outcome.PendingOperationId, outcome.Outcome === 'rejected' ? { rejected: true, dismissed: true }
          : { recordedOutcome: outcome.Outcome },
      ]]))
    }
    if (turn.role === 'assistant' && turn.plan) message.plan = turn.plan
    return message
  })
}

