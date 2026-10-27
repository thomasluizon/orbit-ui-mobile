import type { HabitPlacement, PendingAgentOperation, PendingOperationChange, PendingOperationPlacement } from '../types/ai'
import { PENDING_OPERATION_WEEKDAYS, PREVIEW_ACTION_KEYS, summarizePendingOperationItem } from './pending-operation-item-summary'
import { getAgentCapabilityActionLabelKey, getAgentCapabilityLabelKey } from '../utils/agent-pending-operation'

export { PENDING_OPERATION_WEEKDAYS } from './pending-operation-item-summary'
export const PENDING_OPERATION_ITEM_SEARCH_THRESHOLD = 8

export interface PendingOperationCardLabels {
  placementGroup: (name: string) => string
  placementOption: (value: HabitPlacement, destination: string) => string
  placementRecommended: string
  placementRecommendation: (placement: PendingOperationPlacement) => string
  placementChecklistNote: string
  formatTime: (value: string) => string
  approve: (count: number) => string
  approveName?: (count: number) => string
  parentChoiceRequired: string
  noParent: string
  acting: string
  empty: string
  cancel: string
  edit: string
  edited: string
  editTitle: string
  reject: string
  remove: string
  rejected: (count: number) => string
  summarize: (fields: readonly PendingOperationChange[], actionKey?: string) => string
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
  confirmBody: (count: number) => string
  confirmNote: string
  confirmTitle: (count: number) => string
  irreversible: string
  name: string
  pending: string
  pendingTitle: string
  proposed: string
  open: string
  openNamed: (name: string) => string
  failed: string
  retry: string
  batchFailed: string
  unavailableRecovery: string
  denied: string
  unsupported: string
  more: (count: number) => string
  stepUpAction: string
  stepUpMessage: string
}

const COUNTED_ACTIONS = ['createHabits', 'logHabits', 'skipHabits', 'updateHabits', 'rescheduleHabits', 'deleteHabits', 'updateHabitEmojis']
const COMPACT_ACTIONS = ['openBillingPortal', 'setCalendarSync', 'dismissCalendarImport', 'dismissCalendarSuggestion', 'manageCalendarSync', 'linkGoalsToHabit', 'markAllNotificationsRead', 'unsubscribePush', 'setProactiveAstra']

function hasReusedSubHabit(proposal: unknown): boolean {
  if (Array.isArray(proposal)) return proposal.some(hasReusedSubHabit)
  return typeof proposal === 'object' && proposal !== null
    && ('habit_id' in proposal || ('sub_habits' in proposal && hasReusedSubHabit(proposal.sub_habits)))
}

function getToggleOutcome(actionKey: string | null | undefined, fields: readonly PendingOperationChange[]): 'turnOn' | 'turnOff' | null {
  if (!actionKey || !PREVIEW_ACTION_KEYS.includes(actionKey)
    || !['setProactiveAstra', 'setAiSummary', 'setAiMemory'].includes(actionKey)) return null
  const enabled = fields.find((field) => field.field === 'enabled')
  if (typeof enabled?.proposedValue === 'boolean') return enabled.proposedValue ? 'turnOn' : 'turnOff'
  const value = enabled?.newValue?.toLowerCase()
  return value === 'true' ? 'turnOn' : value === 'false' ? 'turnOff' : null
}

function getApprovalLabel(actionKey: string | null | undefined, toggleOutcome: 'turnOn' | 'turnOff' | null,
  translate: (key: string) => string): string {
  if (toggleOutcome) return translate(`chat.operation.toggleApprove.${toggleOutcome}`)
  return actionKey && PREVIEW_ACTION_KEYS.includes(actionKey)
    ? translate(`chat.operation.${COMPACT_ACTIONS.includes(actionKey) ? 'approveAction' : 'source'}.${actionKey}`)
    : translate('chat.operation.approve')
}

const DELETION_SUBJECTS: Readonly<Record<string, string>> = {
  'habits.write': 'habits', 'habits.delete': 'habits', 'habits.bulk.write': 'habits', 'habits.bulk.delete': 'habits',
  'goals.write': 'goals', 'goals.delete': 'goals', 'tags.write': 'tags', 'tags.delete': 'tags',
  'notifications.write': 'alerts', 'notifications.delete': 'alerts', 'user-facts.delete': 'memories',
  'checklist-templates.write': 'templates',
}

function pendingOperationTitle(
  operation: PendingAgentOperation,
  createsHabits: boolean,
  translate: (key: string, values?: Record<string, string | number>) => string,
): string {
  const count = operation.changeTargetCount ?? operation.items?.length ?? 1
  if (createsHabits) return translate('chat.operation.newHabits', { count })
  if (['updateHabit', 'updateHabits'].includes(operation.actionKey ?? '') && operation.items?.length === 1) {
    return translate('chat.operation.editHabit', { name: operation.items[0]!.entityName })
  }
  if (operation.capabilityId === 'habits.bulk.write') return translate('chat.operation.changeHabits', { count })
  return translate(getAgentCapabilityLabelKey(operation.capabilityId) ?? 'chat.operation.unknown')
}

export function buildPendingOperationCardLabels(
  pendingOperation: PendingAgentOperation,
  translate: (key: string, values?: Record<string, string | number>) => string,
  formatTime: (value: string) => string,
  locale = 'en',
): PendingOperationCardLabels {
  const hasMixedDeletion = pendingOperation.items?.some((item) => item.removesData === true)
    && pendingOperation.items.some((item) => item.removesData !== true)
  const actionKey = pendingOperation.actionKey
  const createsHabits = ['createHabit', 'createHabits', 'createSubHabit'].includes(actionKey ?? '')
    && !hasMixedDeletion && !pendingOperation.items?.some((item) => item.removesData === true
      || item.fields.some((field) => field.field === 'habit_id' || field.oldValue != null
        || (field.field === 'sub_habits' && hasReusedSubHabit(field.proposedValue))))
  const toggleOutcome = getToggleOutcome(actionKey, pendingOperation.items?.length
    ? pendingOperation.items.flatMap((item) => item.fields) : pendingOperation.changes ?? [])
  const actionLabel = getApprovalLabel(actionKey, toggleOutcome, translate)
  const deletionSubject = DELETION_SUBJECTS[pendingOperation.capabilityId]
  const confirm = deletionSubject && pendingOperation.items?.some((item) => item.removesData === true)
    ? translate(`chat.operation.deleteAction.${deletionSubject}`)
    : toggleOutcome ? translate(`chat.operation.toggleSource.${actionKey}.${toggleOutcome}`)
    : translate(actionKey && PREVIEW_ACTION_KEYS.includes(actionKey)
      ? `chat.operation.source.${actionKey}`
      : getAgentCapabilityActionLabelKey(pendingOperation.capabilityId) ?? 'chat.pendingOp.action.applyChanges')
  return {
    placementGroup: (name) => translate('chat.placement.group', { name }),
    placementOption: (value, name) => translate(`chat.placement.option.${value}`, { name }),
    placementRecommended: translate('chat.placement.recommended'),
    placementRecommendation: (placement) => `${translate('chat.placement.recommendation', {
      placement: translate(`chat.placement.option.${placement.recommended}`, { name: placement.destinationName }),
    })} ${placement.reason[locale.startsWith('pt') ? 'pt-BR' : 'en']}`,
    placementChecklistNote: translate('chat.placement.checklistNote'),
    formatTime,
    approve: (count) => createsHabits ? translate('chat.operation.create')
      : ['updateHabit', 'updateHabits'].includes(actionKey ?? '') ? translate('common.save')
      : hasMixedDeletion ? translate('chat.pendingOp.action.applyChanges')
      : actionKey && COUNTED_ACTIONS.includes(actionKey)
        ? translate(`chat.operation.approveCount.${actionKey}`, { count }) : actionLabel,
    approveName: (count) => hasMixedDeletion ? translate('chat.pendingOp.action.applyChanges') : actionKey && COUNTED_ACTIONS.includes(actionKey) ? translate(`chat.operation.approveCount.${actionKey}`, { count }) : actionLabel,
    parentChoiceRequired: translate('chat.operation.parentChoiceRequired'),
    noParent: translate('habits.moveParent.toRoot'),
    acting: translate('blockFrame.status.acting'),
    empty: translate('chat.operation.empty'),
    cancel: translate('common.cancel'),
    edit: translate('chat.operation.edit'),
    edited: translate('chat.operation.edited'),
    editTitle: translate('chat.operation.editTitle'),
    reject: translate('chat.operation.reject'),
    remove: translate('chat.operation.remove'),
    rejected: (count) => translate('chat.operation.rejected', { count }),
    summarize: (fields, summaryActionKey = actionKey ?? undefined) => {
      const outcome = getToggleOutcome(actionKey, fields)
      return outcome ? translate(`chat.operation.toggleSource.${actionKey}.${outcome}`)
        : summarizePendingOperationItem(fields, translate, formatTime, locale, summaryActionKey)
    },
    save: translate('common.save'),
    search: translate('common.search'),
    invalid: translate('chat.operation.invalid'),
    stale: translate('chat.operation.stale'),
    refresh: translate('chat.operation.refresh'),
    refreshFailed: translate('chat.operation.refreshFailed'),
    staleUnavailable: translate('chat.operation.staleUnavailable'),
    fieldLabels: { parent_habit_id: translate('habits.form.parentHabit'), ...Object.fromEntries([
      'title', 'description', 'emoji', 'frequency_unit', 'frequency_quantity',
      'interval_weeks', 'days', 'due_date', 'end_date', 'due_time',
      'is_bad_habit', 'is_general', 'is_flexible', 'checklist_items',
      'sub_habits', 'date', 'enabled', 'is_completed', 'reminder_enabled',
      'reminder_times', 'scheduled_reminders', 'delete', 'dismiss_import', 'run_sync',
    ].map((field) => [field, translate(`chat.operation.field.${field}`)])) },
    dayLabels: Object.fromEntries(PENDING_OPERATION_WEEKDAYS.map((day) => [day, translate(`dates.daysLong.${day.toLowerCase()}`)])),
    yes: translate('common.yes'),
    no: translate('common.no'),
    addListRow: translate('chat.operation.list.add'),
    checklistLimit: translate('chat.operation.list.checklistLimit'),
    scheduledLimit: translate('chat.operation.list.scheduledLimit'),
    checked: translate('chat.operation.list.checked'),
    confirm,
    reminderWhen: translate('chat.operation.list.when'),
    reminderSameDay: translate('chat.operation.list.sameDay'),
    reminderDayBefore: translate('chat.operation.list.dayBefore'),
    reminderTime: translate('chat.operation.list.time'),
    confirmBody: (count) => translate(deletionSubject
      ? `chat.operation.deleteBody.${deletionSubject}` : 'chat.operation.confirmNote', { count }),
    confirmNote: translate('chat.operation.confirmNote'),
    confirmTitle: (count) => deletionSubject
      ? translate(`chat.operation.deleteTitle.${deletionSubject}`, { count })
      : translate('chat.operation.confirmActionTitle', { action: confirm }),
    irreversible: translate('chat.operation.irreversible'),
    name: pendingOperationTitle(pendingOperation, createsHabits, translate),
    pending: translate('chat.operation.pending'),
    pendingTitle: translate('chat.operation.pendingTitle'),
    proposed: translate('chat.preview.proposed'),
    open: translate('chat.action.open'),
    openNamed: (name) => translate('chat.action.openEntity', { name }),
    failed: translate('chat.operationFailed'),
    retry: translate('common.retry'),
    batchFailed: translate('chat.operation.batchFailed'),
    unavailableRecovery: translate('chat.operation.unavailableRecovery'),
    denied: translate('chat.operation.status.Denied'),
    unsupported: translate('chat.operation.status.UnsupportedByPolicy'),
    more: (count) => translate('chat.preview.more', { count }),
    stepUpAction: translate('chat.operation.stepUpAction'),
    stepUpMessage: translate('chat.operation.stepUpMessage'),
  }
}
