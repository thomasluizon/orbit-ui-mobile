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

export function makeRevisedConversationPage(outcome: 'approved' | 'edited' | 'expired'): ConversationPage {
  const memberId = '00000000-0000-4000-8000-000000000004'
  const removedId = '00000000-0000-4000-8000-000000000005'
  const items = ['Evening walk', 'Read'].map((title, index) => ({
    itemId: `${index}/new`, entityId: null, entityName: title, stateFingerprint: `state-${index}`,
    fields: [
      { entityId: '', entityName: title, field: 'title', oldValue: null, newValue: title, proposedValue: title, valueType: 'string' },
      { entityId: '', entityName: title, field: 'due_time', oldValue: null, newValue: '20:30', proposedValue: '20:30', valueType: 'string' },
    ],
  }))
  const preview = makePendingAgentOperation({ id: storedOperationId, capabilityId: 'chat.changes', actionKey: 'applyAccountChanges',
    items, changes: items.flatMap(item => item.fields), changeTargetCount: 2 })
  const page = makeConversationPage()
  page.turns[1]!.responseJson = JSON.stringify({ aiMessage: 'Review ready', actions: [], pendingOperations: [preview] })
  page.turns[1]!.previewOutcomesJson = JSON.stringify([{
    PendingOperationId: storedOperationId, Outcome: outcome, Revision: 2,
    Arguments: {
      operations: [{ PendingOperationId: memberId, OperationId: 'create_habit',
        Arguments: { title: 'Late evening walk', frequency_unit: 'OneTime', due_date: '2026-12-31', due_time: '21:00' },
        PreviewFingerprint: 'revised-preview', SourceFingerprint: 'source-first' }],
      reservations: [{ PendingOperationId: memberId, Fingerprint: 'source-first' }, { PendingOperationId: removedId, Fingerprint: 'source-second' }],
    },
  }])
  return page
}
