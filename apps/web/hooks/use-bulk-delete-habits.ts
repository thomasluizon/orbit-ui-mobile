'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { isCachedHabitDeleted,removeDeletedHabitQueries,habitKeys,goalKeys,profileKeys } from '@orbit/shared/query'
import { plural } from '@orbit/shared/utils'
import { snapshotHabitLists,type HabitListSnapshots } from '@/lib/habit-mutation-helpers'
import type { BulkMutationOutcome,BulkDeleteResponse,HabitScheduleItem,HabitScheduleChild } from '@orbit/shared/types/habit'
import { deleteHabit as deleteHabitAction } from '@/lib/actions/habits'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { useUndoToast } from '@/hooks/use-undo-toast'
import { captureAccountIntent } from '@/lib/client-action'
import { invalidateHabitInventoryQueries } from './use-habit-mutation-shared'
import { useRestoreHabit } from './use-restore-habit'

function selectedDescendantsInSnapshots(
  snapshots: HabitListSnapshots,
  selectedIds: Set<string>,
): Set<string> {
  const descendants = new Set<string>()
  const visit = (habit: HabitScheduleItem | HabitScheduleChild, selectedAncestor: boolean) => {
    const selected = selectedIds.has(habit.id)
    if (selected && selectedAncestor) descendants.add(habit.id)
    for (const child of habit.children) visit(child, selectedAncestor || selected)
  }
  for (const [, habits] of snapshots) {
    for (const habit of habits ?? []) visit(habit, false)
  }
  return descendants
}

export function useBulkDeleteHabits() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const restoreHabit = useRestoreHabit()
  const showUndoToast = useUndoToast()

  return useAccountScopedMutation({
    mutationFn: async (
      habitIds: string[],
      intendedAccountId,
    ): Promise<BulkMutationOutcome<BulkDeleteResponse>> => {
      const account = captureAccountIntent()
      const results: BulkDeleteResponse['results'] = []
      const ambiguousIds: string[] = []
      for (let index = 0;index < habitIds.length;index += 4) {
        if (!account.stillCurrent()) break
        const chunk = habitIds.slice(index, index + 4)
        const outcomes = await Promise.allSettled(
          chunk.map(async (habitId) => {
            if (isCachedHabitDeleted(queryClient, habitId)) return
            await deleteHabitAction(habitId, intendedAccountId)
            if (account.stillCurrent()) await removeDeletedHabitQueries(queryClient, habitId, undefined, account.stillCurrent)
          }),
        )
        for (const outcome of outcomes) {
          if (outcome.status === 'rejected' && reportsAccountChanged(outcome.reason)) {
            throw outcome.reason
          }
        }
        outcomes.forEach((outcome, itemIndex) => {
          const habitId = chunk[itemIndex]
          if (!habitId) return
          if (outcome.status === 'rejected') {
            ambiguousIds.push(habitId)
            return
          }
          results.push({
            index: index + itemIndex,
            status: 'Success',
            habitId,
            error: null,
          })
        })
      }
      return { results, ambiguousIds }
    },

    onMutate: async () => {
      const account = captureAccountIntent()
      await queryClient.cancelQueries({ queryKey: habitKeys.all })
      if (!account.stillCurrent()) throw new Error('Account changed')
      return { previousLists: snapshotHabitLists(queryClient) }
    },

    onSuccess: (result, _habitIds, context) => {
      const account = captureAccountIntent()
      const deleted = result.results.filter((item) => item.status === 'Success')
      if (deleted.length === 0) return
      const selectedIds = new Set(deleted.map((item) => item.habitId))
      const selectedDescendants = selectedDescendantsInSnapshots(context.previousLists, selectedIds)
      const restoreIds = deleted.map((item) => item.habitId)
        .filter((id) => !selectedDescendants.has(id))
      const message = plural(t('undo.habitsDeleted', { count: deleted.length }), deleted.length)
      showUndoToast(message, () => {
        if (!account.stillCurrent()) return
        for (const habitId of restoreIds) restoreHabit.mutate(habitId)
      })
    },

    onSettled: () => {
      invalidateHabitInventoryQueries(queryClient)
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}
