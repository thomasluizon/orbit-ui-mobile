import { astraNextActionSchema } from '../types/astra-offer'
import { pendingAgentOperationSchema, type PendingOperationChange, type PendingAgentOperation } from '../types/ai'
import { makePendingAgentOperation, focusedPeriodTotalFixture } from './chat-fixtures'

export const offerConversationId = '11111111-1111-4111-8111-111111111111'
export const astraOfferFixture = astraNextActionSchema.parse({
  offerKey: 'read:reminder', kind: 'preparePreview', label: 'Add a reminder',
  surface: null, prompt: 'Suggest a reminder for my habit.',
  entityId: '22222222-2222-4222-8222-222222222222', date: '2026-10-30',
})
export const offeredReadFixture = {
  ...focusedPeriodTotalFixture,
  read: { ...focusedPeriodTotalFixture.read, nextAction: astraOfferFixture },
}

export function makeOfferedPreview(): PendingAgentOperation {
  const field: PendingOperationChange = {
    entityId: '22222222-2222-4222-8222-222222222222', entityName: 'Water',
    field: 'repeat_reminder', oldValue: null, newValue: 'Every 2 hours', valueType: 'text',
    proposedValue: { interval_minutes: 120, active_start: '08:00', active_end: '22:00' },
    isEditable: true, provenance: 'suggested',
    removal: { offerKey: 'preview:reminder', field: 'repeat_reminder', fields: ['reminder_enabled', 'repeat_reminder'] },
  }
  const requested: PendingOperationChange = { ...field, field: 'title', newValue: 'Water', proposedValue: 'Water', provenance: 'requested', removal: null }
  const enabled = { ...field, field: 'reminder_enabled', newValue: 'true', valueType: 'boolean', proposedValue: true }
  return pendingAgentOperationSchema.parse(makePendingAgentOperation({
    actionKey: 'createHabit', previewFingerprint: 'preview-one',
    changes: [requested, enabled, field], changeTargetCount: 1,
    items: [{ itemId: '0', entityId: null, entityName: 'Water', stateFingerprint: 'state-one', fields: [requested, enabled, field] }],
  }))
}
