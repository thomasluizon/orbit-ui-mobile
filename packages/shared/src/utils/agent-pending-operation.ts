const LOCALIZED_CAPABILITY_IDS = new Set([
  'habits.delete',
  'habits.bulk.write',
  'habits.bulk.delete',
  'goals.delete',
  'tags.delete',
  'notifications.delete',
  'calendar.sync.manage',
  'subscriptions.manage',
  'api-keys.manage',
  'sync.write',
  'account.manage',
])

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

/** Returns local copy for a typed operation source without exposing a server symbol. */
export function getAgentOperationLabelKey(sourceName: string): string | null {
  return OPERATION_LABEL_KEYS[sourceName] ?? getAgentCapabilityLabelKey(sourceName)
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
