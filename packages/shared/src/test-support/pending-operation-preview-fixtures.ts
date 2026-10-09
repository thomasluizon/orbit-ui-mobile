import { agentExecuteOperationResponseSchema, pendingAgentOperationSchema, type PendingAgentOperation } from '../types/ai'

const emptyId = '00000000-0000-0000-0000-000000000000'

export function makeBulkCreateExecutionResponse(statuses?: readonly ('Success' | 'Failed')[]) {
  const successCount = statuses?.filter((status) => status === 'Success').length ?? 0
  return agentExecuteOperationResponseSchema.parse({
    operation: {
      operationId: 'bulk_create_habits', sourceName: 'bulk_create_habits', riskClass: 'Low',
      confirmationRequirement: 'FreshConfirmation', status: statuses ? 'Succeeded' : 'Failed',
      summary: 'Create habits', targetId: null,
      targetName: statuses ? `${successCount}/${statuses.length} habits created` : null,
      policyReason: statuses ? null : 'unexpected_error', pendingOperationId: null,
      payload: statuses ? { results: statuses.map((status, index) => ({
        index, status, habitId: status === 'Success' ? `00000000-0000-4000-8000-${String(index + 20).padStart(12, '0')}` : null,
        title: `Habit ${index + 1}`, error: status === 'Failed' ? 'Title cannot be empty.' : null,
        field: status === 'Failed' ? 'title' : null,
      })) } : null,
    },
    pendingOperation: null, policyDenial: null,
  })
}

export function makeCreateHabitsPreview(count = 12): PendingAgentOperation {
  return pendingAgentOperationSchema.parse({
    id: '00000000-0000-4000-8000-000000000001', capabilityId: 'habits.bulk.write',
    displayName: 'Bulk habit changes', summary: 'Create habits', riskClass: 'Low',
    confirmationRequirement: 'FreshConfirmation', expiresAtUtc: '2026-10-01T12:00:00Z',
    actionKey: 'createHabits', changes: [], changeTargetCount: count, previewFingerprint: 'create-preview',
    items: Array.from({ length: count }, (_, index) => ({
      itemId: String(index), entityId: null, entityName: `Habit ${index + 1}`,
      stateFingerprint: `create-state-${index}`, removesData: false,
      fields: [{ entityId: emptyId, entityName: `Habit ${index + 1}`, field: 'title',
        oldValue: null, newValue: `Habit ${index + 1}`, valueType: 'text',
        proposedValue: `Habit ${index + 1}`, isEditable: true }],
    })),
  })
}

export function makeDeleteHabitsPreview(count = 3): PendingAgentOperation {
  const items = Array.from({ length: count }, (_, index) => {
    const entityId = `00000000-0000-4000-8000-${String(index + 2).padStart(12, '0')}`
    const entityName = `Old habit ${index + 1}`
    return { itemId: entityId, entityId, entityName, stateFingerprint: `delete-state-${index}`,
      removesData: true, fields: [{ entityId, entityName, field: 'delete', oldValue: null,
        newValue: null, valueType: 'action', proposedValue: null, isEditable: false }] }
  })
  return pendingAgentOperationSchema.parse({
    id: '00000000-0000-4000-8000-000000000005', capabilityId: 'habits.bulk.delete',
    displayName: 'Delete habits', summary: 'Delete habits', riskClass: 'Destructive',
    confirmationRequirement: 'FreshConfirmation', expiresAtUtc: '2026-10-01T12:00:00Z',
    actionKey: 'deleteHabits', changes: items.slice(0, 10).flatMap((item) => item.fields),
    changeTargetCount: count, previewFingerprint: 'delete-preview', items,
  })
}

export function makeMixedHabitsPreview(): PendingAgentOperation {
  const create = makeCreateHabitsPreview(2)
  const deletion = makeDeleteHabitsPreview()
  return { ...create, riskClass: 'Destructive', previewFingerprint: 'mixed-preview',
    items: [...create.items!, ...deletion.items!], changeTargetCount: 5 }
}
