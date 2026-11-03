'use client'

import { useQueryClient } from '@tanstack/react-query'
import { habitKeys } from '@orbit/shared/query'
import { appendHabitDetailChild } from '@orbit/shared/utils'
import type { CreateSubHabitRequest,HabitDetail } from '@orbit/shared/types/habit'
import { createSubHabit as createSubHabitAction } from '@/lib/actions/habits'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { captureAccountIntent } from '@/lib/client-action'
import { invalidateHabitStructureQueries } from './use-habit-mutation-shared'

let optimisticSubHabitSequence = 0

function createOptimisticSubHabitId(): string {
  optimisticSubHabitSequence += 1
  return `optimistic-sub-habit-${optimisticSubHabitSequence}`
}

export function useCreateSubHabit() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: ({
      parentId,
      data,
    }: {
      parentId: string
      data: CreateSubHabitRequest
    }, intendedAccountId) => createSubHabitAction(parentId, data, intendedAccountId),

    onMutate: async ({ parentId, data }) => {
      const account = captureAccountIntent()
      await queryClient.cancelQueries({ queryKey: habitKeys.detail(parentId) })
      if (!account.stillCurrent()) throw new Error('Account changed')
      const previousDetail = queryClient.getQueryData<HabitDetail>(habitKeys.detail(parentId))
      const optimisticChildId = createOptimisticSubHabitId()
      queryClient.setQueryData<HabitDetail>(habitKeys.detail(parentId), (detail) =>
        detail ? appendHabitDetailChild(detail, optimisticChildId, data) : detail,
      )
      return { previousDetail }
    },

    onError: (_error, { parentId }, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(habitKeys.detail(parentId), context.previousDetail)
      }
    },

    onSettled: (_result, _error, { parentId }) => {
      invalidateHabitStructureQueries(queryClient)
      void queryClient.invalidateQueries({ queryKey: habitKeys.detail(parentId) })
    },
  })
}
