import type { PendingAgentOperation } from '../types/ai'
import { getAgentCapabilityLabelKey } from '../utils/agent-pending-operation'

export interface PendingOperationCardLabels {
  approve: string
  cancel: string
  edit: string
  editTitle: string
  reject: string
  remove: string
  rejected: string
  save: string
  invalid: string
  stale: string
  fieldLabels: Readonly<Record<string, string>>
  confirm: string
  confirmBody: string
  confirmNote: string
  confirmTitle: string
  irreversible: string
  name: string
  pending: string
  pendingTitle: string
  risk: string
  stepUpAction: string
  stepUpMessage: string
}

export function buildPendingOperationCardLabels(
  pendingOperation: PendingAgentOperation,
  translate: (key: string) => string,
): PendingOperationCardLabels {
  const capabilityKey = getAgentCapabilityLabelKey(pendingOperation.capabilityId)
  return {
    approve: translate('chat.operation.approve'),
    cancel: translate('common.cancel'),
    edit: translate('chat.operation.edit'),
    editTitle: translate('chat.operation.editTitle'),
    reject: translate('chat.operation.reject'),
    remove: translate('chat.operation.remove'),
    rejected: translate('chat.operation.rejected'),
    save: translate('common.save'),
    invalid: translate('chat.operation.invalid'),
    stale: translate('chat.operation.stale'),
    fieldLabels: Object.fromEntries([
      'title', 'description', 'emoji', 'frequency_unit', 'frequency_quantity',
      'interval_weeks', 'days', 'due_date', 'end_date', 'due_time',
      'is_bad_habit', 'is_general', 'is_flexible', 'checklist_items',
      'sub_habits', 'date', 'enabled', 'is_completed', 'reminder_enabled',
      'reminder_times', 'scheduled_reminders',
    ].map((field) => [field, translate(`chat.operation.field.${field}`)])),
    confirm: translate('chat.operation.confirm'),
    confirmBody: translate('chat.operation.confirmBody'),
    confirmNote: translate('chat.operation.confirmNote'),
    confirmTitle: translate('chat.operation.confirmTitle'),
    irreversible: translate('chat.operation.irreversible'),
    name: translate(capabilityKey ?? 'chat.operation.unknown'),
    pending: translate('chat.operation.pending'),
    pendingTitle: translate('chat.operation.pendingTitle'),
    risk: translate(`chat.operation.risk.${pendingOperation.riskClass.toLowerCase()}`),
    stepUpAction: translate('chat.operation.stepUpAction'),
    stepUpMessage: translate('chat.operation.stepUpMessage'),
  }
}
