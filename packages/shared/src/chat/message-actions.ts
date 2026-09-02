import type { ActionResult, ChatMessage, ClarificationRequest } from '../types/chat'

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
): MessageActionGroups {
  const candidates = actions ?? []
  return {
    clarificationActions: candidates.filter(
      (action): action is ClarificationAction =>
        action.status === 'NeedsClarification' && action.clarificationRequest != null,
    ),
    nonSuggestionActions: candidates.filter(
      (action) => action.status !== 'Suggestion' && action.status !== 'NeedsClarification',
    ),
    suggestionActions: candidates.filter(
      (action) => action.status === 'Suggestion' && Boolean(action.suggestedSubHabits?.length),
    ),
  }
}
