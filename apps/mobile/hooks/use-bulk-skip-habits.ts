import { type HabitAccount,withAccountGuard } from './use-habit-mutation-shared'
import type { ParentPromptContinuation } from '@orbit/shared/types/sync'
import { settleBulkSkippedHabits,checkCompletionAfterSkip } from '@orbit/shared/query/skip-completion'
import type { HabitListSnapshots } from '@orbit/shared/query'
import { useQueryClient } from '@tanstack/react-query'
import { useHabitMutation } from './use-habit-mutation'
import { habitKeys,profileKeys,applyCachedHabitSkip } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { getAccountDay } from '@orbit/shared/utils'
import type { BulkSkipResult,BulkSkipItemRequest } from '@orbit/shared/types/habit'
import type { Profile } from '@orbit/shared/types/profile'
import { type QueuedMarker,isQueuedResult,OfflineMutationPreflightError } from '@/lib/offline-mutations'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { snapshotHabitLists,restoreHabitLists,finalizeHabitMutation } from '@/lib/habit-mutation-helpers'
import { useUIStore } from '@/stores/ui-store'

type OfflineBulkMutationOutcome<TResponse> = TResponse & {
  ambiguousIds: string[]
  offlineFailureIds: string[]
}

type BulkSkipMutationOutcome = OfflineBulkMutationOutcome<BulkSkipResult> & {
  queuedIds: string[]
}

function recordBulkFailure(
  error: unknown,
  habitIds: string[],
  failures: { ambiguousIds: string[]; offlineFailureIds: string[] },
): void {
  const rejectedIds = error instanceof OfflineMutationPreflightError ? failures.offlineFailureIds : failures.ambiguousIds
  rejectedIds.push(...habitIds)
}

type ParentPromptBulkInput<T> = T[] | { items: T[]; parentPromptContinuation: ParentPromptContinuation }

function normalizeParentPromptBulkInput<T>(input: ParentPromptBulkInput<T>): { items: T[]; parentPromptContinuation?: ParentPromptContinuation } {
  return Array.isArray(input) ? { items: input } : input
}

export function useBulkSkipHabits(options: { suppressParentSettlement?: boolean } = {}) {
  const queryClient = useQueryClient()

  return useHabitMutation<
    BulkSkipMutationOutcome,
    Error,
    ParentPromptBulkInput<BulkSkipItemRequest>,
    { previousLists: HabitListSnapshots; occurrenceDate: string; account: HabitAccount }
  >({
    mutationFn: async (input) => {
      const account = withAccountGuard(account => account)
      const { items, parentPromptContinuation } = normalizeParentPromptBulkInput(input)
      const results: BulkSkipResult['results'] = []
      const ambiguousIds: string[] = []
      const offlineFailureIds: string[] = []
      const queuedIds: string[] = []
      for (let index = 0;index < items.length;index += 100) {
        if (!account.stillCurrent()) break
        const chunk = items.slice(index, index + 100)
        try {
          const response = await performQueuedApiMutation<BulkSkipResult, BulkSkipResult & QueuedMarker>({
            type: 'bulkSkipHabits',
            scope: 'habits',
            suppressParentSettlement: options.suppressParentSettlement,
            parentPromptContinuation,
            endpoint: API.habits.bulkSkip,
            method: 'POST',
            payload: { items: chunk },
            queuedResultFactory: (mutationId) => ({
              results: chunk.map((item, itemIndex) => ({
                index: itemIndex,
                status: 'Success' as const,
                habitId: item.habitId,
                error: null,
              })),
              queued: true as const,
              queuedMutationId: mutationId,
            }),
          })
          if (isQueuedResult(response)) queuedIds.push(...chunk.map((item) => item.habitId))
          results.push(...response.results.map((result) => ({ ...result, index: result.index + index })))
        } catch (error: unknown) {
          const failedIds = chunk.map((item) => item.habitId)
          recordBulkFailure(error, failedIds, { ambiguousIds, offlineFailureIds })
        }
      }
      return { results, ambiguousIds, offlineFailureIds, queuedIds }
    },

    onMutate: async (input) => {
      const { items } = normalizeParentPromptBulkInput(input)
      return withAccountGuard(async (guardedAccount) => {
        const account = guardedAccount
        await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

        account.assertCurrent()
        const previousLists = snapshotHabitLists(queryClient)
        const occurrenceDate = getAccountDay(new Date(), queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone)
        for (const item of items) applyCachedHabitSkip(queryClient, item.habitId, item.date ?? occurrenceDate)

        return { previousLists, occurrenceDate, account }

      })
    },

    onError: (_err, _vars, context) => {
      if (context && !context.account.stillCurrent()) return
      if (context?.previousLists) {
        restoreHabitLists(queryClient, context.previousLists)
      }
    },

    onSuccess: (data, input, context) => {
      if (!context.account.stillCurrent()) return
      const { items } = normalizeParentPromptBulkInput(input)
      const acceptedIds = new Set(data.results.filter((entry) => entry.status === 'Success').map((entry) => entry.habitId))
      const failedIds = new Set(items.filter((item) => !acceptedIds.has(item.habitId)).map((item) => item.habitId))
      for (const habitId of data.offlineFailureIds) failedIds.add(habitId)
      for (const habitId of data.ambiguousIds) failedIds.add(habitId)
      for (const habitId of data.queuedIds) failedIds.add(habitId)
      const confirmed = settleBulkSkippedHabits(queryClient, items, context.previousLists, failedIds, context.occurrenceDate)
      checkCompletionAfterSkip(queryClient, confirmed, queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone,
        useUIStore.getState().checkAllDoneCelebration, context.previousLists)
    },

    onSettled: (data, error, _items, context) => {
      if (context && !context.account.stillCurrent()) return
      finalizeHabitMutation(queryClient, data, error, { includeProfile: true })
    },
  })
}
