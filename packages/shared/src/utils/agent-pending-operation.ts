const LOCALIZED_CAPABILITY_IDS = new Set([
  'habits.delete',
  'habits.bulk.write',
  'habits.bulk.delete',
  'goals.delete',
  'tags.delete',
  'notifications.delete',
  'calendar.sync.manage',
  'user-facts.delete',
  'subscriptions.manage',
  'api-keys.manage',
  'sync.write',
  'account.manage',
])

const LOCALIZED_POLICY_REASONS = new Set(['confirmation_required', 'step_up_required'])

/**
 * i18n key for a confirmation-gated agent capability's display name, or null when the
 * capability has no localized label yet (callers fall back to the server's English
 * DisplayName). Dots in capability ids are folded to hyphens because both i18n runtimes
 * treat dots as nesting separators.
 */
export function getAgentCapabilityLabelKey(capabilityId: string): string | null {
  return LOCALIZED_CAPABILITY_IDS.has(capabilityId)
    ? `chat.pendingOp.capability.${capabilityId.replace(/\./g, '-')}`
    : null
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
