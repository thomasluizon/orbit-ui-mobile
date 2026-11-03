'use client'

import { applyHabitChecklistDetails } from '@orbit/shared/hooks'
import type { HabitListKey } from '@orbit/shared/query'
import { useQueryClient } from '@tanstack/react-query'
import { habitKeys,profileKeys } from '@orbit/shared/query'
import { optimisticUpdateChecklist } from '@/lib/habit-optimistic-helpers'
import type { ChecklistItem,HabitScheduleItem } from '@orbit/shared/types/habit'
import { updateChecklist as updateChecklistAction } from '@/lib/actions/habits'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { captureAccountIntent } from '@/lib/client-action'
import { invalidateHabitListQueries } from './use-habit-mutation-shared'

export function useUpdateChecklist() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: ({
      habitId,
      items,
    }: {
      habitId: string
      items: ChecklistItem[]
    }, intendedAccountId) => updateChecklistAction(habitId, items, intendedAccountId),

    onMutate: async ({ habitId, items }) => {
      const account = captureAccountIntent()
      await Promise.all([
        queryClient.cancelQueries({ queryKey: habitKeys.lists() }),
        queryClient.cancelQueries({ queryKey: habitKeys.detail(habitId) }),
        queryClient.cancelQueries({ queryKey: habitKeys.fullDetail(habitId) }),
      ])
      if (!account.stillCurrent()) throw new Error('Account changed')

      const previousLists = queryClient.getQueriesData<HabitScheduleItem[]>({
        queryKey: habitKeys.lists(),
      })


      queryClient.setQueriesData<HabitScheduleItem[], { queryKey: HabitListKey }>(
        { queryKey: habitKeys.lists() },
        (old) => old ? optimisticUpdateChecklist(old, habitId, items) : old,
      )
      const { previousDetail, previousFullDetail } = applyHabitChecklistDetails(queryClient, habitId, items)

      return { previousLists, previousDetail, previousFullDetail }
    },

    onError: (_err, { habitId }, context) => {
      if (!context) return
      for (const [key, data] of context.previousLists) {
        if (data) queryClient.setQueryData(key, data)
      }
      if (context.previousDetail) {
        queryClient.setQueryData(habitKeys.detail(habitId), context.previousDetail)
      }
      if (context.previousFullDetail) {
        queryClient.setQueryData(habitKeys.fullDetail(habitId), context.previousFullDetail)
      }
    },

    onSettled: (_data, _err, { habitId }) => {
      invalidateHabitListQueries(queryClient)
      void queryClient.invalidateQueries({ queryKey: habitKeys.detail(habitId) })
      void queryClient.invalidateQueries({ queryKey: habitKeys.fullDetail(habitId) })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.retrospectivePrefix() })
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}
