import type { AgentOperationResult } from '../types/ai'

const WRITE_CAPABILITY_IDS = new Set([
  'habits.write',
  'goals.write',
  'tags.write',
  'profile.preferences.write',
  'profile.ai-memory.write',
  'profile.ai-summary.write',
  'profile.proactive-astra.write',
  'notifications.write',
  'checklist-templates.write',
  'referrals.write',
  'support.write',
])

const LOCALIZED_ACTION_CAPABILITY_IDS = new Set([
  'habits.delete',
  'habits.bulk.write',
  'habits.bulk.delete',
  'goals.delete',
  'tags.delete',
  'notifications.delete',
  'user-facts.delete',
  'calendar.sync.manage',
  'subscriptions.manage',
  'api-keys.manage',
  'sync.write',
  'account.manage',
])

const LOCALIZED_CAPABILITY_IDS = new Set([...WRITE_CAPABILITY_IDS, ...LOCALIZED_ACTION_CAPABILITY_IDS])

const LOCALIZED_POLICY_REASONS = new Set(['confirmation_required', 'step_up_required'])

const OPERATION_LABEL_KEYS: Readonly<Record<string, string>> = {
  CreateHabit: 'chat.operation.source.createHabit',
  LogHabit: 'chat.operation.source.logHabit',
  UpdateHabit: 'chat.operation.source.updateHabit',
  DeleteHabit: 'chat.operation.source.deleteHabit',
  SkipHabit: 'chat.operation.source.skipHabit',
  BulkLogHabits: 'chat.operation.source.bulkLogHabits',
  BulkSkipHabits: 'chat.operation.source.bulkSkipHabits',
  CreateSubHabit: 'chat.operation.source.createSubHabit',
  MoveHabit: 'chat.operation.source.moveHabit',
  CreateGoal: 'chat.operation.source.createGoal',
  UpdateGoal: 'chat.operation.source.updateGoal',
  DeleteGoal: 'chat.operation.source.deleteGoal',
  UpdateGoalProgress: 'chat.operation.source.updateGoalProgress',
  UpdateGoalStatus: 'chat.operation.source.updateGoalStatus',
  LinkHabitsToGoal: 'chat.operation.source.linkHabitsToGoal',
  AssignTags: 'chat.operation.source.assignTags',
  BulkCreateHabits: 'chat.operation.source.createHabits',
  BulkDeleteHabits: 'chat.operation.source.deleteHabits',
  BulkRescheduleHabits: 'chat.operation.source.rescheduleHabits',
  BulkUpdateHabitEmojis: 'chat.operation.source.updateHabitEmojis',
  BulkUpdateHabits: 'chat.operation.source.updateHabits',
  CreateChecklistTemplate: 'chat.operation.source.createChecklistTemplate',
  CreateTag: 'chat.operation.source.createTag',
  DeleteChecklistTemplate: 'chat.operation.source.deleteChecklistTemplate',
  DeleteNotifications: 'chat.operation.source.deleteNotifications',
  DeleteTag: 'chat.operation.source.deleteTag',
  DuplicateHabit: 'chat.operation.source.duplicateHabit',
  GetReferralCode: 'chat.operation.source.viewReferralCode',
  LinkGoalsToHabit: 'chat.operation.source.linkGoalsToHabit',
  ManageAccount: 'chat.operation.source.manageAccount',
  ManageApiKeys: 'chat.operation.source.manageApiKeys',
  ManageCalendarSync: 'chat.operation.source.manageCalendarSync',
  ManageSubscription: 'chat.operation.source.manageSubscription',
  MoveHabitParent: 'chat.operation.source.moveHabitParent',
  ReorderGoals: 'chat.operation.source.reorderGoals',
  ReorderHabits: 'chat.operation.source.reorderHabits',
  SendSupportRequest: 'chat.operation.source.sendSupportRequest',
  SetAiSummary: 'chat.operation.source.setAiSummary',
  SetProactiveAstra: 'chat.operation.source.setProactiveAstra',
  SuggestBreakdown: 'chat.operation.source.suggestBreakdown',
  UndoSkipHabit: 'chat.operation.source.undoSkipHabit',
  UnlogHabit: 'chat.operation.source.unlogHabit',
  UpdateChecklist: 'chat.operation.source.updateChecklist',
  UpdateChecklistTemplate: 'chat.operation.source.updateChecklistTemplate',
  UpdateNotifications: 'chat.operation.source.updateNotifications',
  UpdateProfilePreferences: 'chat.operation.source.updateProfilePreferences',
  UpdateTag: 'chat.operation.source.updateTag',
}

/**
 * i18n key for a confirmation-gated agent capability's display name, or null when the
 * capability has no localized label yet. Callers use generic local copy for null so a
 * server symbol never reaches the interface. Dots in capability ids are folded to hyphens
 * because both i18n runtimes treat dots as nesting separators.
 */
export function getAgentCapabilityLabelKey(capabilityId: string): string | null {
  return LOCALIZED_CAPABILITY_IDS.has(capabilityId)
    ? `chat.pendingOp.capability.${capabilityId.replaceAll('.', '-')}`
    : null
}

export function getAgentCapabilityActionLabelKey(capabilityId: string): string | null {
  return LOCALIZED_ACTION_CAPABILITY_IDS.has(capabilityId)
    ? `chat.pendingOp.action.${capabilityId.replaceAll('.', '-')}`
    : null
}

/** Returns local copy for a typed operation source without exposing a server symbol. */
export function getAgentOperationLabelKey(sourceName: string): string | null {
  const normalizedSource = sourceName.replaceAll('_', '').toLowerCase()
  return Object.entries(OPERATION_LABEL_KEYS).find(([source]) => source.toLowerCase() === normalizedSource)?.[1]
    ?? getAgentCapabilityLabelKey(sourceName)
}

/**
 * i18n key for a policy reason code surfaced to the user during the confirmation flow,
 * or null for codes without friendly copy (callers fall back to the generic send error
 * instead of leaking raw reason codes).
 */
export function getAgentPolicyReasonKey(reason: string | null | undefined): string | null {
  return reason && LOCALIZED_POLICY_REASONS.has(reason)
    ? `chat.pendingOp.errors.${reason}`
    : null
}

const ACCOUNT_DENIAL_REASONS = new Set([
  'PAY_GATE', 'HABIT_LIMIT_REACHED', 'NO_PERMISSION', 'HABIT_NOT_OWNED', 'UPGRADE_REQUIRED',
  'account_deactivated', 'user_not_found',
])
const ACCOUNT_DENIAL_PREFIXES = ['plan_required:', 'feature_plan_required:', 'target_not_owned:']

export function getAgentOperationCopyKeys(operation: Pick<AgentOperationResult, 'status' | 'policyReason' | 'errorCode'>): {
  titleKey: string
  statusKey: string
} {
  const reasonKey = getAgentPolicyReasonKey(operation.policyReason)
  const accountDenied = ACCOUNT_DENIAL_REASONS.has(operation.policyReason ?? '')
    || ACCOUNT_DENIAL_REASONS.has(operation.errorCode ?? '')
    || ACCOUNT_DENIAL_PREFIXES.some(prefix => operation.policyReason?.startsWith(prefix))
  const neutral = operation.status === 'Denied' && !accountDenied && !reasonKey
  return {
    titleKey: `chat.operation.outcome.${neutral ? 'changeNotMade' : operation.status}`,
    statusKey: reasonKey ?? `chat.operation.status.${neutral ? 'changeNotMade' : operation.status}`,
  }
}
