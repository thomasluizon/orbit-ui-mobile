import { agentOperationResultSchema, pendingOperationChangePreviewSchema, type AgentOperationResult, type PendingAgentOperation, type PendingOperationChangePreview } from '../types/ai'
import { conversationPageSchema, type ConversationPage } from '../types/conversation'
import { makePendingAgentOperation } from './chat-fixtures'
import { makeBulkCreateExecutionResponse, makeBulkUpdateExecutionResponse, makeBulkUpdateHabitsPreview, makeCreateHabitsPreview, makeTicketTaskPreview } from './pending-operation-preview-fixtures'

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

export const COMPACT_FAILED_INDEXES = [7, 32, 57, 82]

export function makeCompactBulkCreateExecution(): AgentOperationResult {
  const stored = agentOperationResultSchema.parse(JSON.parse('{"operationId":"bulk_create_habits","sourceName":"bulk_create_habits","riskClass":"Low","confirmationRequirement":"FreshConfirmation","status":"Succeeded","summary":"96/100 habits created","targetId":null,"targetName":null,"policyReason":null,"pendingOperationId":null,"payload":null}'))
  const results = Array.from({ length: 100 }, (_, index) => COMPACT_FAILED_INDEXES.includes(index)
    ? { index, status: 'Failed', habitId: null, title: null, error: null, field: null }
    : { index, status: 'Success', habitId: `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`, title: null, error: null, field: null })
  return { ...stored, payload: { partial: true, applied_count: 96, total_matched: 100, skipped_count: 4, results } }
}

export const REVISED_HABIT_TITLE = 'Ler 30 paginas 2048'
export const PROPOSED_HABIT_TITLE = 'Ler 20 paginas 2048'
export const REVISED_HABIT_ID = '42169ec6-3d2a-474b-b844-f2156ae548e9'

export function makeRevisedCreatePreview(title = REVISED_HABIT_TITLE): PendingOperationChangePreview {
  const field = (name: string, newValue: string, valueType: string, proposedValue: unknown) => ({ entityId: '00000000-0000-0000-0000-000000000000',
    entityName: title, field: name, oldValue: null, newValue, valueType, proposedValue, isEditable: true })
  const fields = [field('title', title, 'text', title), field('frequency_quantity', '1', 'number', 1), field('frequency_unit', 'Day', 'text', 'Day')]
  return pendingOperationChangePreviewSchema.parse({ changes: fields, changeTargetCount: 1,
    items: [{ itemId: '0', entityId: null, entityName: title, fields, removesData: false,
      stateFingerprint: title === REVISED_HABIT_TITLE ? 'F48DBF5E8204DA0782519F579B6248BC1F0614256F8A2C92B46C93C11AD2466E' : 'proposed-state' }],
    previewFingerprint: title === REVISED_HABIT_TITLE ? 'F8B5A0B62489C24048A0EE1EADDD42A2588779C8277CC0D4AD36C632965325D2' : 'proposed-preview' })
}

const revisedCreateExecution = {
  operationId: 'create_habit', sourceName: 'create_habit', riskClass: 'Low', confirmationRequirement: 'FreshConfirmation',
  status: 'Succeeded', summary: 'Create Habit requested via Chat', targetId: REVISED_HABIT_ID, targetName: REVISED_HABIT_TITLE,
  policyReason: null, pendingOperationId: null, payload: null, access: 'write',
} as const

export type StoredExecution = 'stored' | 'storedFailure' | 'truncated' | 'truncatedFailure' | 'failedWithoutPayload' | 'absent'
  | 'compact' | 'partialUpdate' | 'completeUpdate' | 'partialEmojis' | 'revised' | 'proposedOnly'

function storedExecution(execution: Exclude<StoredExecution, 'absent'>): AgentOperationResult {
  switch (execution) {
    case 'stored': return makeBulkCreateExecutionResponse(['Success']).operation
    case 'storedFailure': return makeBulkCreateExecutionResponse(['Failed']).operation
    case 'truncated': return { ...makeBulkCreateExecutionResponse(['Success']).operation, payload: null }
    case 'truncatedFailure': return { ...makeBulkCreateExecutionResponse(['Failed']).operation, payload: null }
    case 'failedWithoutPayload': return makeBulkCreateExecutionResponse().operation
    case 'compact': return makeCompactBulkCreateExecution()
    case 'partialUpdate': return makeBulkUpdateExecutionResponse(2, 3).operation
    case 'completeUpdate': return makeBulkUpdateExecutionResponse(3, 3).operation
    case 'partialEmojis': return makeBulkUpdateExecutionResponse(2, 3, 'bulk_update_habit_emojis').operation
    case 'revised': case 'proposedOnly': return agentOperationResultSchema.parse(revisedCreateExecution)
  }
}

function storedPreview(execution: StoredExecution): PendingAgentOperation {
  switch (execution) {
    case 'compact': return makeCreateHabitsPreview(100)
    case 'partialUpdate': case 'completeUpdate': case 'partialEmojis': return makeBulkUpdateHabitsPreview()
    case 'revised': case 'proposedOnly': return { ...makePendingAgentOperation({ capabilityId: 'habits.write', displayName: 'Create Habit', summary: 'Create Habit requested via Chat',
      riskClass: 'Low', actionKey: 'createHabit' }), ...makeRevisedCreatePreview(PROPOSED_HABIT_TITLE) }
    default: return makeTicketTaskPreview()
  }
}

export function makeExecutedConversationPage(execution: StoredExecution = 'stored'): ConversationPage {
  const page = makeConversationPage()
  page.turns[1]!.responseJson = JSON.stringify({ aiMessage: '', actions: [], pendingOperations: [{ ...storedPreview(execution), id: storedOperationId, expiresAtUtc: '2099-01-01T00:00:00Z' }] })
  page.turns[1]!.previewOutcomesJson = JSON.stringify([{ PendingOperationId: storedOperationId, Outcome: 'approved', Arguments: {}, Revision: execution === 'revised' ? 3 : 2,
    ...(execution === 'absent' ? {} : { Execution: storedExecution(execution) }),
    ...(execution === 'revised' ? { RevisedPreview: makeRevisedCreatePreview() } : {}) }])
  return conversationPageSchema.parse(page)
}
