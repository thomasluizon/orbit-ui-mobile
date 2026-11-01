import { conversationPageSchema, type ConversationPage } from '../types/conversation'
import { makePendingAgentOperation } from './chat-fixtures'

export const storedConversationId = '00000000-0000-4000-8000-000000000001'
export const storedTurnId = '00000000-0000-4000-8000-000000000002'
export const storedOperationId = '00000000-0000-4000-8000-000000000003'

export function makeConversationPage(overrides: Partial<ConversationPage> = {}): ConversationPage {
  const preview = makePendingAgentOperation({ id: storedOperationId, expiresAtUtc: '2099-01-01T00:00:00Z' })
  return conversationPageSchema.parse({
    conversationId: storedConversationId, beforeOrder: 3,
    turns: [
      { turnId: storedTurnId, order: 3, role: 'user', createdAtUtc: '2026-01-01T00:00:00Z', content: 'Review this image', responseJson: null, previewOutcomesJson: '[]',
        image: { fileName: `${storedTurnId}.png`, contentType: 'image/png', sha256: 'checksum', url: `/api/chat/conversations/${storedConversationId}/images/${storedTurnId}` } },
      { turnId: storedTurnId, order: 4, role: 'assistant', createdAtUtc: '2026-01-01T00:00:00Z', content: 'Review ready',
        responseJson: JSON.stringify({ aiMessage: 'Review ready', actions: [], parts: [{ type: 'text', text: 'Review ready' }], pendingOperations: [preview] }),
        previewOutcomesJson: JSON.stringify([{ PendingOperationId: storedOperationId, Outcome: 'pending', Arguments: {}, Revision: 1 }]), image: null },
    ], ...overrides,
  })
}
