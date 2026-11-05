'use client'

import { settleBulkSkippedHabits,checkCompletionAfterSkip } from '@orbit/shared/query/skip-completion'
import { useQueryClient } from '@tanstack/react-query'
import { habitKeys,profileKeys,applyCachedHabitSkip } from '@orbit/shared/query'
import { getAccountDay, buildBulkCompletionChunks, normalizeBulkCompletionInput, type BulkCompletionInput, type BulkRetryChunk } from '@orbit/shared/utils'
import { snapshotHabitLists,restoreHabitLists } from '@/lib/habit-mutation-helpers'
import type { BulkSkipItemRequest,BulkSkipResult } from '@orbit/shared/types/habit'
import type { Profile } from '@orbit/shared/types/profile'
import { bulkSkipHabits as bulkSkipHabitsAction } from '@/lib/actions/habits'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { useUIStore } from '@/stores/ui-store'
import { captureAccountIntent } from '@/lib/client-action'
import { invalidateHabitStructureQueries } from './use-habit-mutation-shared'

export function useBulkSkipHabits() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: async (
      input: BulkCompletionInput<BulkSkipItemRequest>,
      intendedAccountId,
    ): Promise<BulkSkipResult & { ambiguousIds: string[]; retryChunks: BulkRetryChunk<BulkSkipItemRequest>[] }> => {
      const account = captureAccountIntent()
      const retryChunks: BulkRetryChunk<BulkSkipItemRequest>[] = []
      const results: BulkSkipResult['results'] = []
      const ambiguousIds: string[] = []
      for (const chunk of buildBulkCompletionChunks(input, () => crypto.randomUUID())) {
        if (!account.stillCurrent()) break
        try {
          const response = await bulkSkipHabitsAction(chunk.items, intendedAccountId, chunk.idempotencyKey)
          results.push(...response.results.map((result) => ({ ...result, index: chunk.indices[result.index]! })))
        } catch (error) {
          if (reportsAccountChanged(error)) throw error
          retryChunks.push({ items: chunk.items, idempotencyKey: chunk.idempotencyKey })
          ambiguousIds.push(...chunk.items.map((item) => item.habitId))
        }
      }
      return { results, ambiguousIds, retryChunks }
    },

    onMutate: async (input) => {
      const { items } = normalizeBulkCompletionInput(input)
      const account = captureAccountIntent()
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })
      if (!account.stillCurrent()) throw new Error('Account changed')
      const previousLists = snapshotHabitLists(queryClient)
      const occurrenceDate = getAccountDay(new Date(), queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone)
      for (const item of items) applyCachedHabitSkip(queryClient, item.habitId, item.date ?? occurrenceDate)

      return { previousLists, occurrenceDate }
    },

    onError: (_error, _items, context) => {
      if (context?.previousLists) restoreHabitLists(queryClient, context.previousLists)
    },

    onSuccess: (result, input, context) => {
      const { items } = normalizeBulkCompletionInput(input)
      const acceptedIds = new Set(result.results.filter((entry) => entry.status === 'Success').map((entry) => entry.habitId))
      const rejectedIds = new Set([...result.ambiguousIds, ...items.filter((item) => !acceptedIds.has(item.habitId)).map((item) => item.habitId)])
      const confirmed = settleBulkSkippedHabits(queryClient, items, context.previousLists, rejectedIds, context.occurrenceDate)
      checkCompletionAfterSkip(queryClient, confirmed, queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone,
        useUIStore.getState().checkAllDoneCelebration, context.previousLists)
    },

    onSettled: () => {
      invalidateHabitStructureQueries(queryClient)
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}
