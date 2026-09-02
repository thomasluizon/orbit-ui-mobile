import type { ActionResult, ChatMessage, ClarificationRequest } from '../types/chat'
import { resolveUpgradeEntitlementFromPolicyDenial } from '../utils/upgrade'

export type ClarificationAction = ActionResult & {
  clarificationRequest: ClarificationRequest
}

interface MessageActionGroups {
  clarificationActions: ClarificationAction[]
  nonSuggestionActions: ActionResult[]
  suggestionActions: ActionResult[]
}

export function partitionMessageActions(
  actions: ChatMessage['actions'],
  policyDenials?: ChatMessage['policyDenials'],
): MessageActionGroups {
  const candidates = actions ?? []
  const entitlementDeniedActionTypes = new Set(
    (policyDenials ?? [])
      .filter((denial) => resolveUpgradeEntitlementFromPolicyDenial(denial).shouldUpgrade)
      .map((denial) =>
        denial.sourceName
          .split('_')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(''),
      ),
  )
  return {
    clarificationActions: candidates.filter(
      (action): action is ClarificationAction =>
        action.status === 'NeedsClarification' && action.clarificationRequest != null,
    ),
    nonSuggestionActions: candidates.filter(
      (action) =>
        action.status !== 'Suggestion' &&
        action.status !== 'NeedsClarification' &&
        !(action.status === 'Failed' && entitlementDeniedActionTypes.has(action.type)),
    ),
    suggestionActions: candidates.filter(
      (action) => action.status === 'Suggestion' && Boolean(action.suggestedSubHabits?.length),
    ),
  }
}
