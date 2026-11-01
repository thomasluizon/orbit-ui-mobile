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
    removal: { offerKey: 'preview::111111111111111111111111:repeat_reminder', field: 'repeat_reminder', fields: ['reminder_enabled', 'repeat_reminder'] },
  }
  const requested: PendingOperationChange = { ...field, field: 'title', newValue: 'Water', proposedValue: 'Water', provenance: 'requested', removal: null }
  const enabled = { ...field, field: 'reminder_enabled', newValue: 'True', valueType: 'boolean', proposedValue: true,
    removal: { ...field.removal!, offerKey: 'preview::111111111111111111111111:reminder_enabled', field: 'reminder_enabled' } }
  return pendingAgentOperationSchema.parse(makePendingAgentOperation({
    actionKey: 'createHabit', previewFingerprint: 'preview-one',
    changes: [requested, enabled, field], changeTargetCount: 1,
    items: [{ itemId: '0', entityId: null, entityName: 'Water', stateFingerprint: 'state-one', fields: [requested, enabled, field] }],
  }))
}

export function makeOfferedTaskPreview(): PendingAgentOperation {
  const operation = makeOfferedPreview()
  const entityName = 'Virada no Terraço Itália'
  const requested = operation.items![0]!.fields[0]!
  const suggested = operation.items![0]!.fields[2]!
  const reminderFields = ['reminder_enabled', 'scheduled_reminders']
  const fields: PendingOperationChange[] = [
    { ...requested, newValue: entityName, proposedValue: entityName },
    { ...requested, field: 'frequency_unit', newValue: 'OneTime', proposedValue: 'OneTime' },
    { ...requested, field: 'due_date', newValue: '2026-12-31', proposedValue: '2026-12-31', valueType: 'date' },
    { ...requested, field: 'due_time', newValue: '20:30', proposedValue: '20:30', valueType: 'time' },
    { ...suggested, field: 'emoji', newValue: '🎆', proposedValue: '🎆', valueType: 'text',
      removal: { offerKey: 'preview::111111111111111111111111:emoji', field: 'emoji', fields: ['emoji'] } },
    { ...suggested, field: 'reminder_enabled', newValue: 'True', proposedValue: true, valueType: 'boolean',
      removal: { offerKey: 'preview::111111111111111111111111:reminder_enabled', field: 'reminder_enabled', fields: reminderFields } },
    { ...suggested, field: 'scheduled_reminders', newValue: '[{"time":"19:30","when":"same_day"}]',
      proposedValue: [{ time: '19:30', when: 'same_day' }], valueType: 'list',
      removal: { offerKey: 'preview::111111111111111111111111:scheduled_reminders', field: 'scheduled_reminders', fields: reminderFields } },
  ].map(field => ({ ...field, entityName }))
  return pendingAgentOperationSchema.parse({ ...operation, capabilityId: 'habits.write', riskClass: 'Low', displayName: 'create_habit', changes: fields,
    items: [{ ...operation.items![0]!, entityName, fields }] })
}

export function makeOfferedChildPreview(removedChildIndex?: number): PendingAgentOperation {
  const operation = makeOfferedTaskPreview()
  const requested = operation.items![0]!.fields[0]!
  const children = ['Read', 'Stretch'].map((title, index) => ({ title,
    ...(index === removedChildIndex ? {} : { reminder_enabled: true,
      scheduled_reminders: [{ time: index === 0 ? '19:30' : '20:00', when: 'same_day' }] }),
  }))
  const nested = children.flatMap((child, index) => operation.items![0]!.fields
    .filter(field => index !== removedChildIndex && ['reminder_enabled', 'scheduled_reminders'].includes(field.field))
    .map(field => ({ ...field, entityName: child.title, field: `sub_habits/${index}/${field.field}`,
      proposedValue: field.field === 'reminder_enabled' ? child.reminder_enabled : child.scheduled_reminders,
      newValue: field.field === 'reminder_enabled' ? 'True' : JSON.stringify(child.scheduled_reminders),
      removal: { offerKey: `preview::${String(index + 2).repeat(24)}:sub_habits/${index}/${field.field}`, field: `sub_habits/${index}/${field.field}`,
        fields: field.removal!.fields!.map(name => `sub_habits/${index}/${name}`) } })))
  const fields: PendingOperationChange[] = [
    { ...requested, entityName: 'Evening routine', newValue: 'Evening routine', proposedValue: 'Evening routine' },
    { ...requested, entityName: 'Evening routine', field: 'sub_habits', valueType: 'list',
      newValue: JSON.stringify(children), proposedValue: children },
    ...nested,
  ]
  return pendingAgentOperationSchema.parse({ ...operation, changes: fields,
    items: [{ ...operation.items![0]!, entityName: 'Evening routine', fields }] })
}
