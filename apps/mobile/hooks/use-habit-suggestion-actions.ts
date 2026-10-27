import { useQueryClient } from '@tanstack/react-query'
import { profileKeys, subscriptionKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { ApiClientError } from '@orbit/shared/utils'
import { agentExecuteOperationResponseSchema, habitSuggestionDraftSchema, habitSuggestionPreviewErrorSchema } from '@orbit/shared/types'
import { apiClient } from '@/lib/api-client'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useChatStore } from '@/stores/chat-store'
import type { HabitSuggestionActions } from '@orbit/shared/chat'

export function useHabitSuggestionActions(messageId: string, language: string): HabitSuggestionActions {
  const queryClient = useQueryClient()
  const generation = getAccountGeneration()
  const isCurrent = () => generation === getAccountGeneration()
  return {
    isCurrent,
    transition: update => useChatStore.getState().transitionMessage(messageId, update),
    refine: async (draft, instruction) => {
      const refined = await apiClient(API.chat.refineHabitSuggestion, {
        method: 'POST', isCurrent, body: JSON.stringify({ draft, instruction, language }),
      }, habitSuggestionDraftSchema)
      if (isCurrent()) {
        void queryClient.invalidateQueries({ queryKey: subscriptionKeys.status() })
        void queryClient.invalidateQueries({ queryKey: profileKeys.detail() })
      }
      return refined
    },
    preview: async (drafts, all) => {
      try {
        const response = agentExecuteOperationResponseSchema.parse(await apiClient(all ? API.chat.previewAllHabitSuggestions : API.chat.previewHabitSuggestion, {
          method: 'POST', isCurrent, body: JSON.stringify(all ? { drafts, language } : { draft: drafts[0], language }),
        }))
        return { response }
      } catch (error) {
        const conflict = habitSuggestionPreviewErrorSchema.safeParse(error instanceof ApiClientError ? error.data : null)
        if (conflict.success && conflict.data.errorCode === 'HABIT_SUGGESTION_UNAVAILABLE') return { conflictIndex: conflict.data.draftIndex }
        throw error
      }
    },
  }
}
