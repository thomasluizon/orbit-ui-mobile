'use client'

import { useQueryClient } from '@tanstack/react-query'
import { profileKeys, subscriptionKeys } from '@orbit/shared/query'

import { refineHabitSuggestion, previewHabitSuggestions } from '@/app/actions/habit-suggestions'
import { accountIntentWithOrigin, runServerAction } from '@/lib/client-action'
import { getHeldAccountId } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useChatStore } from '@/stores/chat-store'
import type { HabitSuggestionActions } from '@orbit/shared/chat'

export function useHabitSuggestionActions(messageId: string, language: string): HabitSuggestionActions {
  const queryClient = useQueryClient()
  const generation = getAccountGeneration()
  const accountId = getHeldAccountId()
  const isCurrent = () => generation === getAccountGeneration() && accountId === getHeldAccountId()
  return {
    isCurrent,
    transition: update => useChatStore.getState().transitionMessage(messageId, update),
    refine: async (draft, instruction) => {
      const refined = await runServerAction(refineHabitSuggestion(draft, instruction, language, accountIntentWithOrigin(accountId)), 'reject')
      if (isCurrent()) {
        void queryClient.invalidateQueries({ queryKey: subscriptionKeys.status() })
        void queryClient.invalidateQueries({ queryKey: profileKeys.detail() })
      }
      return refined
    },
    preview: (drafts, all) => runServerAction(previewHabitSuggestions(drafts, all, language, accountIntentWithOrigin(accountId)), 'reject'),
  }
}
