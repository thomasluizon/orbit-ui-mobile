import { applyHabitStructurePatch } from '@orbit/shared/hooks'
import { type HabitAccount,withAccountGuard } from './use-habit-mutation-shared'
import type { HabitListSnapshots,HabitDetailUpdates } from '@orbit/shared/query'
import { useQueryClient } from '@tanstack/react-query'
import { useHabitMutation } from './use-habit-mutation'
import { habitKeys,restoreCachedHabitDetails,invalidateHabitParentDetails } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { validateApiRequest } from '@orbit/shared'
import type { UpdateHabitRequest } from '@orbit/shared/types/habit'
import { type QueuedMarker,isQueuedResult } from '@/lib/offline-mutations'
import { queuedHabitUpdateRequestSchema } from '@/lib/habit-update-request'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { snapshotHabitLists,buildOptimisticHabitPatch,restoreHabitLists,finalizeHabitMutation } from '@/lib/habit-mutation-helpers'

export function useUpdateHabit() {
  const queryClient = useQueryClient()

  const mutation = useHabitMutation<
    void | QueuedMarker,
    Error,
    { habitId: string; data: UpdateHabitRequest; dependsOn?: string[]; account?: HabitAccount },
    { previousLists: HabitListSnapshots; previousDetails: HabitDetailUpdates; account: HabitAccount }
  >({
    mutationFn: async (input) => {
      return withAccountGuard(async (guardedAccount) => {
        input.account ??= guardedAccount
        input.account.assertCurrent()
        const { habitId, data, dependsOn, account } = input
        const request = validateApiRequest(data, queuedHabitUpdateRequestSchema)
        return performQueuedApiMutation<void>({
          isCurrent: account.stillCurrent,
          type: 'updateHabit',
          scope: 'habits',
          endpoint: API.habits.update(habitId),
          method: 'PUT',
          payload: request,
          entityType: 'habit',
          targetEntityId: habitId,
          dependsOn: [...(dependsOn ?? []), ...(data.parentId ? [data.parentId] : [])],
        })

      }, input.account)
    },

    onMutate: async (input) => {
      return withAccountGuard(async (guardedAccount) => {
        input.account ??= guardedAccount
        const { habitId, data, account } = input
        await Promise.all([
          queryClient.cancelQueries({ queryKey: habitKeys.lists() }),
          queryClient.cancelQueries({ queryKey: habitKeys.details() }),
          queryClient.cancelQueries({ queryKey: data.parentId != null || data.clearParent === true ? habitKeys.fullDetails() : habitKeys.fullDetail(habitId) }),
        ])

        account.assertCurrent()
        const previousLists = snapshotHabitLists(queryClient)
        const patch = buildOptimisticHabitPatch(queryClient, data)
        const previousDetails = applyHabitStructurePatch(queryClient, habitId, data, patch)

        return { previousLists, previousDetails, account }

      }, input.account)
    },

    onError: (_err, _variables, context) => {
      if (context && !context.account.stillCurrent()) return
      if (context?.previousLists) {
        restoreHabitLists(queryClient, context.previousLists)
      }
      if (context?.previousDetails) restoreCachedHabitDetails(queryClient, context.previousDetails)
    },

    onSettled: (data, error, { habitId, account, data: request }, context) => {
      if (account && !account.stillCurrent()) return
      if (!error && !isQueuedResult(data) && (request.parentId != null || request.clearParent === true)) invalidateHabitParentDetails(queryClient, context?.previousDetails, habitId)
      return finalizeHabitMutation(queryClient, data, error, { habitId, includeProfile: true, includeCount: true })
    },
  })
  return {
    ...mutation,
    mutate: (input: { habitId: string; data: UpdateHabitRequest; dependsOn?: string[] }) => withAccountGuard((account) => mutation.mutate({ ...input, account: account })),
    mutateAsync: async (input: { habitId: string; data: UpdateHabitRequest; dependsOn?: string[] }) => {
      return withAccountGuard(async (guardedAccount) => {
        const account = guardedAccount
        const result = await mutation.mutateAsync({ ...input, account })
        account.assertCurrent()
        return result

      })
    },
  }
}
