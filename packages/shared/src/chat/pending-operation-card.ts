import type { PendingAgentOperation } from '../types/ai'
import { getAgentCapabilityActionLabelKey, getAgentCapabilityLabelKey } from '../utils/agent-pending-operation'

export const PENDING_OPERATION_WEEKDAYS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const
export const PENDING_OPERATION_ITEM_SEARCH_THRESHOLD = 8

export interface PendingOperationCardLabels {
  approve: string
  acting: string
  cancel: string
  edit: string
  edited: string
  editTitle: string
  reject: string
  remove: string
  rejected: string
  save: string
  search: string
  invalid: string
  stale: string
  refresh: string
  refreshFailed: string
  staleUnavailable: string
  fieldLabels: Readonly<Record<string, string>>
  dayLabels: Readonly<Record<string, string>>
  yes: string
  no: string
  addListRow: string
  checklistLimit: string
  scheduledLimit: string
  checked: string
  confirm: string
  reminderWhen: string
  reminderSameDay: string
  reminderDayBefore: string
  reminderTime: string
  confirmBody: string
  confirmNote: string
  confirmTitle: string
  irreversible: string
  name: string
  pending: string
  pendingTitle: string
  proposed: string
  notSet: string
  open: string
  failed: string
  denied: string
  unsupported: string
  diff: (field: string, oldValue: string, newValue: string) => string
  more: (count: number) => string
  stepUpAction: string
  stepUpMessage: string
}

export function buildPendingOperationCardLabels(
  pendingOperation: PendingAgentOperation,
  translate: (key: string, values?: Record<string, string | number>) => string,
): PendingOperationCardLabels {
  const capabilityKey = getAgentCapabilityLabelKey(pendingOperation.capabilityId)
  return {
    approve: translate('chat.operation.approve'),
    acting: translate('blockFrame.status.acting'),
    cancel: translate('common.cancel'),
    edit: translate('chat.operation.edit'),
    edited: translate('chat.operation.edited'),
    editTitle: translate('chat.operation.editTitle'),
    reject: translate('chat.operation.reject'),
    remove: translate('chat.operation.remove'),
    rejected: translate('chat.operation.rejected'),
    save: translate('common.save'),
    search: translate('common.search'),
    invalid: translate('chat.operation.invalid'),
    stale: translate('chat.operation.stale'),
    refresh: translate('chat.operation.refresh'),
    refreshFailed: translate('chat.operation.refreshFailed'),
    staleUnavailable: translate('chat.operation.staleUnavailable'),
    fieldLabels: Object.fromEntries([
      'title', 'description', 'emoji', 'frequency_unit', 'frequency_quantity',
      'interval_weeks', 'days', 'due_date', 'end_date', 'due_time',
      'is_bad_habit', 'is_general', 'is_flexible', 'checklist_items',
      'sub_habits', 'date', 'enabled', 'is_completed', 'reminder_enabled',
      'reminder_times', 'scheduled_reminders', 'delete', 'dismiss_import', 'run_sync',
    ].map((field) => [field, translate(`chat.operation.field.${field}`)])),
    dayLabels: Object.fromEntries(PENDING_OPERATION_WEEKDAYS.map((day) => [day, translate(`dates.daysLong.${day.toLowerCase()}`)])),
    yes: translate('common.yes'),
    no: translate('common.no'),
    addListRow: translate('chat.operation.list.add'),
    checklistLimit: translate('chat.operation.list.checklistLimit'),
    scheduledLimit: translate('chat.operation.list.scheduledLimit'),
    checked: translate('chat.operation.list.checked'),
    confirm: translate(getAgentCapabilityActionLabelKey(pendingOperation.capabilityId) ?? 'chat.pendingOp.action.applyChanges'),
    reminderWhen: translate('chat.operation.list.when'),
    reminderSameDay: translate('chat.operation.list.sameDay'),
    reminderDayBefore: translate('chat.operation.list.dayBefore'),
    reminderTime: translate('chat.operation.list.time'),
    confirmBody: translate('chat.operation.confirmBody'),
    confirmNote: translate('chat.operation.confirmNote'),
    confirmTitle: translate('chat.operation.confirmTitle'),
    irreversible: translate('chat.operation.irreversible'),
    name: translate(capabilityKey ?? 'chat.operation.unknown'),
    pending: translate('chat.operation.pending'),
    pendingTitle: translate('chat.operation.pendingTitle'),
    proposed: translate('chat.preview.proposed'),
    notSet: translate('chat.preview.notSet'),
    open: translate('chat.action.open'),
    failed: translate('chat.operationFailed'),
    denied: translate('chat.operation.status.Denied'),
    unsupported: translate('chat.operation.status.UnsupportedByPolicy'),
    diff: (field, oldValue, newValue) => translate('chat.preview.diff', { field, old: oldValue, new: newValue }),
    more: (count) => translate('chat.preview.more', { count }),
    stepUpAction: translate('chat.operation.stepUpAction'),
    stepUpMessage: translate('chat.operation.stepUpMessage'),
  }
}
