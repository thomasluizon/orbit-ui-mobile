import type { PendingAgentOperation, PendingOperationChange } from '../types/ai'
import { PENDING_OPERATION_WEEKDAYS, summarizePendingOperationItem } from './pending-operation-item-summary'
import { getAgentCapabilityActionLabelKey, getAgentCapabilityLabelKey } from '../utils/agent-pending-operation'

export { PENDING_OPERATION_WEEKDAYS } from './pending-operation-item-summary'
export const PENDING_OPERATION_ITEM_SEARCH_THRESHOLD = 8

export interface PendingOperationCardLabels {
  formatTime: (value: string) => string
  approve: string
  acting: string
  cancel: string
  edit: string
  edited: string
  editTitle: string
  reject: string
  remove: string
  rejected: (count: number) => string
  summarize: (fields: readonly PendingOperationChange[]) => string
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
  open: string
  openNamed: (name: string) => string
  failed: string
  denied: string
  unsupported: string
  more: (count: number) => string
  stepUpAction: string
  stepUpMessage: string
}

export function buildPendingOperationCardLabels(
  pendingOperation: PendingAgentOperation,
  translate: (key: string, values?: Record<string, string | number>) => string,
  formatTime: (value: string) => string,
  locale = 'en',
): PendingOperationCardLabels {
  const capabilityKey = getAgentCapabilityLabelKey(pendingOperation.capabilityId)
  return {
    formatTime,
    approve: translate('chat.operation.approve'),
    acting: translate('blockFrame.status.acting'),
    cancel: translate('common.cancel'),
    edit: translate('chat.operation.edit'),
    edited: translate('chat.operation.edited'),
    editTitle: translate('chat.operation.editTitle'),
    reject: translate('chat.operation.reject'),
    remove: translate('chat.operation.remove'),
    rejected: (count) => translate('chat.operation.rejected', { count }),
    summarize: (fields) => summarizePendingOperationItem(fields, translate, formatTime, locale),
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
    open: translate('chat.action.open'),
    openNamed: (name) => translate('chat.action.openEntity', { name }),
    failed: translate('chat.operationFailed'),
    denied: translate('chat.operation.status.Denied'),
    unsupported: translate('chat.operation.status.UnsupportedByPolicy'),
    more: (count) => translate('chat.preview.more', { count }),
    stepUpAction: translate('chat.operation.stepUpAction'),
    stepUpMessage: translate('chat.operation.stepUpMessage'),
  }
}
