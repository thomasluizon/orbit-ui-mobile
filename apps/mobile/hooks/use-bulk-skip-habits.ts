import { type HabitAccount,withAccountGuard } from './use-habit-mutation-shared'
import { randomUUID } from 'expo-crypto'
import { buildBulkCompletionChunks, normalizeBulkCompletionInput, type BulkCompletionInput, type BulkRetryChunk } from '@orbit/shared/utils'
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
  retryChunks: BulkRetryChunk<BulkSkipItemRequest>[]
}

function recordBulkFailure(
  error: unknown,
  habitIds: string[],
  failures: { ambiguousIds: string[]; offlineFailureIds: string[]; retryChunks: BulkRetryChunk<BulkSkipItemRequest>[] },
  chunk: BulkRetryChunk<BulkSkipItemRequest>,
): void {
  if (!(error instanceof OfflineMutationPreflightError)) failures.retryChunks.push({ items: chunk.items, idempotencyKey: chunk.idempotencyKey })
  const rejectedIds = error instanceof OfflineMutationPreflightError ? failures.offlineFailureIds : failures.ambiguousIds
  rejectedIds.push(...habitIds)
}

export function useBulkSkipHabits(options: { suppressParentSettlement?: boolean } = {}) {
  const queryClient = useQueryClient()

  return useHabitMutation<
    BulkSkipMutationOutcome,
    Error,
    BulkCompletionInput<BulkSkipItemRequest>,
    { previousLists: HabitListSnapshots; occurrenceDate: string; account: HabitAccount }
  >({
    mutationFn: async (input) => {
      const account = withAccountGuard(account => account)
      const { items, parentPromptContinuation } = normalizeBulkCompletionInput(input)
      const retryChunks: BulkRetryChunk<BulkSkipItemRequest>[] = []
      const results: BulkSkipResult['results'] = []
      const ambiguousIds: string[] = []
      const offlineFailureIds: string[] = []
      const queuedIds: string[] = []
      for (const chunk of buildBulkCompletionChunks({ ...normalizeBulkCompletionInput(input), items }, randomUUID)) {
        if (!account.stillCurrent()) break
        try {
          const response = await performQueuedApiMutation<BulkSkipResult, BulkSkipResult & QueuedMarker>({
            manualRetry: true,
            idempotencyKey: chunk.idempotencyKey,
            type: 'bulkSkipHabits',
            scope: 'habits',
            suppressParentSettlement: options.suppressParentSettlement,
            parentPromptContinuation,
            endpoint: API.habits.bulkSkip,
            method: 'POST',
            payload: { items: chunk.items },
            queuedResultFactory: (mutationId) => ({
              results: chunk.items.map((item, itemIndex) => ({
                index: itemIndex,
                status: 'Success' as const,
                habitId: item.habitId,
                error: null,
              })),
              queued: true as const,
              queuedMutationId: mutationId,
            }),
          })
          if (isQueuedResult(response)) queuedIds.push(...chunk.items.map((item) => item.habitId))
          results.push(...response.results.map((result) => ({ ...result, index: chunk.indices[result.index]! })))
        } catch (error: unknown) {
          const failedIds = chunk.items.map((item) => item.habitId)
          recordBulkFailure(error, failedIds, { ambiguousIds, offlineFailureIds, retryChunks }, chunk)
        }
      }
      return { results, ambiguousIds, offlineFailureIds, queuedIds, retryChunks }
    },

    onMutate: async (input) => {
      const { items } = normalizeBulkCompletionInput(input)
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
      const { items } = normalizeBulkCompletionInput(input)
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
