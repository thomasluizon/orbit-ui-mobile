'use client'

import { applyHabitStructurePatch } from '@orbit/shared/hooks'
import { useQueryClient } from '@tanstack/react-query'
import { habitKeys,restoreCachedHabitDetails,invalidateHabitParentDetails,invalidateHabitDependents,profileKeys } from '@orbit/shared/query'
import { snapshotHabitLists,buildOptimisticHabitPatch,restoreHabitLists } from '@/lib/habit-mutation-helpers'
import type { UpdateHabitRequest } from '@orbit/shared/types/habit'
import { updateHabit as updateHabitAction } from '@/lib/actions/habits'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { captureAccountIntent } from '@/lib/client-action'

export function useUpdateHabit() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: ({ habitId, data }: { habitId: string; data: UpdateHabitRequest }, intendedAccountId) =>
      updateHabitAction(habitId, data, intendedAccountId),

    onMutate: async ({ habitId, data }) => {
      const account = captureAccountIntent()
      await Promise.all([
        queryClient.cancelQueries({ queryKey: habitKeys.lists() }),
        queryClient.cancelQueries({ queryKey: habitKeys.details() }),
        queryClient.cancelQueries({ queryKey: data.parentId != null || data.clearParent === true ? habitKeys.fullDetails() : habitKeys.fullDetail(habitId) }),
      ])
      if (!account.stillCurrent()) throw new Error('Account changed')

      const previousLists = snapshotHabitLists(queryClient)
      const patch = buildOptimisticHabitPatch(queryClient, data)
      const previousDetails = applyHabitStructurePatch(queryClient, habitId, data, patch)

      return { previousLists, previousDetails }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        restoreHabitLists(queryClient, context.previousLists)
      }
      if (context?.previousDetails) restoreCachedHabitDetails(queryClient, context.previousDetails)
    },

    onSettled: (_data, error, { habitId, data: request }, context) => {
      if (error) return
      if (request.parentId != null || request.clearParent === true) invalidateHabitParentDetails(queryClient, context?.previousDetails, habitId)
      invalidateHabitDependents(queryClient, habitId)
      void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}
