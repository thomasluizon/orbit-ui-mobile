import type { QueryClient } from '@tanstack/query-core'
import {
  apiKeyKeys,
  calendarKeys,
  gamificationKeys,
  goalKeys,
  habitKeys,
  notificationKeys,
  profileKeys,
  referralKeys,
  subscriptionKeys,
  tagKeys,
  userFactKeys,
} from '../query/keys'
import type {
  ActionResult,
  AgentExecuteOperationResponse,
  AgentPolicyDenial,
} from '../types/index'
import {
  resolveUpgradeEntitlementDenial,
  resolveUpgradeEntitlementFromPolicyDenial,
  type UpgradeEntitlementResolution,
} from '../utils/upgrade'

/**
 * Framework-agnostic chat-composer core shared by the web and mobile
 * `useChatComposer` hooks. Pure TypeScript: no React, no DOM, no I/O. Each app
 * injects its own state container and network closures; this module owns the
 * decisions both platforms must make identically.
 */

const CHAT_HABIT_ACTION_TYPES: ReadonlySet<string> = new Set([
  'CreateHabit',
  'LogHabit',
  'UpdateHabit',
  'DeleteHabit',
  'SkipHabit',
  'BulkLogHabits',
  'BulkSkipHabits',
  'CreateSubHabit',
  'AssignTags',
  'DuplicateHabit',
  'MoveHabit',
  'SuggestBreakdown',
  'ReorderHabits',
])

export const CHAT_GOAL_ACTION_TYPES: ReadonlySet<string> = new Set([
  'CreateGoal',
  'UpdateGoal',
  'DeleteGoal',
  'UpdateGoalProgress',
  'UpdateGoalStatus',
  'LinkHabitsToGoal',
  'ReorderGoals',
])

// Tag mutations refresh the tag list and, because habits carry tag chips, the
// habit lists too (handled via CHAT_HABIT_ACTION_TYPES membership below).
const CHAT_TAG_ACTION_TYPES: ReadonlySet<string> = new Set([
  'CreateTag',
  'UpdateTag',
  'DeleteTag',
])

export const CHAT_DRAFT_STORAGE_KEY = 'orbit-chat-draft'

/**
 * Resolves the assistant message text for an executed agent operation,
 * preferring the richest available signal. Keeps `operation.policyReason` in
 * the fallback chain so both platforms surface the same copy.
 */
export function buildAgentExecutionMessage(response: AgentExecuteOperationResponse): string {
  return (
    response.operation.summary ??
    response.policyDenial?.reason ??
    response.operation.policyReason ??
    response.operation.sourceName
  )
}

/**
 * Query-key families invalidated after any successful agent operation. Both
 * apps invalidate the same set; the hook maps each family to
 * `queryClient.invalidateQueries`.
 */
const AGENT_INVALIDATION_KEY_FAMILIES: readonly (readonly unknown[])[] = [
  habitKeys.all,
  goalKeys.all,
  profileKeys.all,
  tagKeys.all,
  notificationKeys.all,
  calendarKeys.all,
  userFactKeys.all,
  gamificationKeys.all,
  subscriptionKeys.all,
  referralKeys.all,
  apiKeyKeys.all,
]

export async function invalidateAgentQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    AGENT_INVALIDATION_KEY_FAMILIES.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  )
}

type SendFailureKind = 'upgrade' | 'timeout' | 'limit' | 'generic'

interface SendFailureInput {
  status?: number | null
  code?: string | null
  reason?: string | null
}

interface SendFailureClassification {
  kind: SendFailureKind
  reason: string
  upgrade: UpgradeEntitlementResolution
}

/**
 * Folds a normalized send failure (`{ status, code, reason }`) into the action
 * the composer should take. Web passes the Server Action's discriminated-union
 * status; mobile maps its thrown `apiClient` error into the same shape first.
 */
export function classifySendFailure(input: SendFailureInput): SendFailureClassification {
  const upgrade = resolveUpgradeEntitlementDenial(input)
  const reason = input.reason?.trim() ?? ''

  if (upgrade.shouldUpgrade) {
    return { kind: 'upgrade', reason, upgrade }
  }
  if (input.status === 408) {
    return { kind: 'timeout', reason, upgrade }
  }
  if (input.status === 403) {
    return { kind: 'limit', reason, upgrade }
  }
  return { kind: 'generic', reason, upgrade }
}

/**
 * Picks the first policy denial that requires an upgrade, so the hook can both
 * surface its reason and route the user to the upgrade screen.
 */
export function findPremiumPolicyDenial(
  denials: readonly AgentPolicyDenial[] | null | undefined,
): AgentPolicyDenial | undefined {
  return denials?.find((denial) => resolveUpgradeEntitlementFromPolicyDenial(denial).shouldUpgrade)
}

interface ActionInvalidations {
  habits: boolean
  goals: boolean
  tags: boolean
}

/**
 * Determines which list caches to invalidate from a chat turn's successful
 * actions. Returns `false` for all when there were no successful actions. Tag
 * mutations also flag `habits` because habit rows render tag chips.
 */
export function selectActionInvalidations(
  actions: readonly ActionResult[] | undefined,
): ActionInvalidations {
  const hasSuccess = actions?.some((action) => action.status === 'Success') ?? false
  if (!hasSuccess) {
    return { habits: false, goals: false, tags: false }
  }
  const tags = actions?.some((action) => CHAT_TAG_ACTION_TYPES.has(action.type)) ?? false
  return {
    habits:
      tags || (actions?.some((action) => CHAT_HABIT_ACTION_TYPES.has(action.type)) ?? false),
    goals: actions?.some((action) => CHAT_GOAL_ACTION_TYPES.has(action.type)) ?? false,
    tags,
  }
}
