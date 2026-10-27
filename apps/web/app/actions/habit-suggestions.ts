'use server'

import { API } from '@orbit/shared/api'
import { ApiClientError } from '@orbit/shared/utils'
import { agentExecuteOperationResponseSchema, habitSuggestionDraftSchema, habitSuggestionPreviewErrorSchema } from '@orbit/shared/types'
import type { HabitSuggestionDraft, HabitSuggestionPreviewResult } from '@orbit/shared/types'
import { serverAuthMutate } from '@/lib/server-fetch'
import { wrapServerAction } from './action-result'

export async function refineHabitSuggestion(draft: HabitSuggestionDraft, instruction: string, language: string, accountId: string | null) {
  return wrapServerAction(() => serverAuthMutate(API.chat.refineHabitSuggestion, {
    method: 'POST', body: JSON.stringify({ draft: habitSuggestionDraftSchema.parse(draft), instruction, language }),
  }, accountId, habitSuggestionDraftSchema))
}

export async function previewHabitSuggestions(drafts: HabitSuggestionDraft[], all: boolean, language: string, accountId: string | null) {
  return wrapServerAction(async (): Promise<HabitSuggestionPreviewResult> => {
    const checked = drafts.map(draft => habitSuggestionDraftSchema.parse(draft))
    try {
      const response = await serverAuthMutate(all ? API.chat.previewAllHabitSuggestions : API.chat.previewHabitSuggestion, {
        method: 'POST', body: JSON.stringify(all ? { drafts: checked, language } : { draft: checked[0], language }),
      }, accountId, agentExecuteOperationResponseSchema)
      return { response }
    } catch (error) {
      const conflict = habitSuggestionPreviewErrorSchema.safeParse(error instanceof ApiClientError ? error.data : null)
      if (conflict.success && conflict.data.errorCode === 'HABIT_SUGGESTION_UNAVAILABLE') return { conflictIndex: conflict.data.draftIndex }
      throw error
    }
  })
}
