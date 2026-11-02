'use client'

import type { HabitListKey } from '@orbit/shared/query'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { cachedHabitDeletionIds, isCachedHabitDeleted, removeDeletedHabitQueries, restoreDeletedHabitQueries, restoreCachedHabitDetails, updateCachedHabitDetails, invalidateHabitParentDetails, habitKeys, profileKeys, invalidateHabitDependents } from '@orbit/shared/query'
import { appendHabitDetailChild, optimisticMoveHabitParent, optimisticRemoveHabits, removeHabitDetailChild, getFriendlyErrorMessage } from '@orbit/shared/utils'
import { optimisticPatchHabit, optimisticUpdateChecklist } from '@/lib/habit-optimistic-helpers'
import { applyReorderPositions, buildOptimisticHabitPatch, restoreHabitLists, snapshotHabitLists, updateHabitLists } from '@/lib/habit-mutation-helpers'
import type { HabitScheduleItem, HabitDetail, HabitFullDetail, CreateHabitRequest, UpdateHabitRequest, ReorderHabitsRequest, ChecklistItem, CreateSubHabitRequest, MoveHabitParentRequest } from '@orbit/shared/types/habit'
import { createHabit as createHabitAction, updateHabit as updateHabitAction, deleteHabit as deleteHabitAction, restoreHabit as restoreHabitAction, reorderHabits as reorderHabitsAction, duplicateHabit as duplicateHabitAction, updateChecklist as updateChecklistAction, createSubHabit as createSubHabitAction, moveHabitParent as moveHabitParentAction } from '@/lib/actions/habits'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { useUIStore } from '@/stores/ui-store'
import { useAppToast } from '@/hooks/use-app-toast'
import { useUndoToast } from '@/hooks/use-undo-toast'
import { invalidateHabitInventoryQueries, invalidateHabitDeleteQueries, invalidateHabitListQueries, invalidateHabitStructureQueries } from './use-habit-mutation-shared'

let optimisticSubHabitSequence = 0

function createOptimisticSubHabitId(): string {
  optimisticSubHabitSequence += 1
  return `optimistic-sub-habit-${optimisticSubHabitSequence}`
}

export function useCreateHabit() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: (data: CreateHabitRequest, intendedAccountId) =>
      createHabitAction(data, intendedAccountId),

    onSuccess: (result) => {
      useUIStore.getState().setLastCreatedHabitId(result.id)
    },

    onSettled: () => {
      invalidateHabitInventoryQueries(queryClient)
    },
  })
}

export function useUpdateHabit() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: ({ habitId, data }: { habitId: string; data: UpdateHabitRequest }, intendedAccountId) =>
      updateHabitAction(habitId, data, intendedAccountId),

    onMutate: async ({ habitId, data }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: habitKeys.lists() }),
        queryClient.cancelQueries({ queryKey: habitKeys.details() }),
        queryClient.cancelQueries({ queryKey: data.parentId != null || data.clearParent === true ? habitKeys.fullDetails() : habitKeys.fullDetail(habitId) }),
      ])

      const previousLists = snapshotHabitLists(queryClient)
      const patch = buildOptimisticHabitPatch(queryClient, data)
      const parentId = data.clearParent === true ? null : data.parentId ?? undefined
      const parentChange = parentId === undefined ? undefined : { habitId, parentId }
      const previousDetails = updateCachedHabitDetails(queryClient, (habit) => habit.id === habitId
        ? { ...patch, ...(parentChange ? { parentId } : {}) } : {}, parentChange)
      updateHabitLists(queryClient, (items) => {
        const patched = optimisticPatchHabit(items, habitId, patch)
        return parentChange ? optimisticMoveHabitParent(patched, habitId, parentChange.parentId, true) : patched
      })

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

export function useRestoreHabit() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const { showSuccess, showError } = useAppToast()

  return useAccountScopedMutation({
    mutationFn: (habitId: string, intendedAccountId) =>
      restoreHabitAction(habitId, intendedAccountId),

    onSuccess: (_result, habitId) => {
      restoreDeletedHabitQueries(queryClient, habitId)
      void queryClient.invalidateQueries({ queryKey: habitKeys.all })
      invalidateHabitDeleteQueries(queryClient)
      showSuccess(t('undo.restored'))
    },

    onError: (error) => {
      showError(getFriendlyErrorMessage(error, t, 'undo.restoreFailed'))
    },
  })
}

export function useDeleteHabit() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const restoreHabit = useRestoreHabit()
  const showUndoToast = useUndoToast()

  return useAccountScopedMutation({
    mutationFn: (habitId: string, intendedAccountId) =>
      isCachedHabitDeleted(queryClient, habitId) ? Promise.resolve() : deleteHabitAction(habitId, intendedAccountId),

    onMutate: async (habitId) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.all })
      const deletedIds = cachedHabitDeletionIds(queryClient, [habitId])
      const previousLists = snapshotHabitLists(queryClient)
      const previousDetails = queryClient.getQueriesData<HabitDetail>({
        queryKey: habitKeys.details(),
      })
      updateHabitLists(queryClient, (items) => optimisticRemoveHabits(items, [habitId]))
      queryClient.setQueriesData<HabitDetail>(
        { queryKey: habitKeys.details() },
        (detail) => detail ? removeHabitDetailChild(detail, habitId) : detail,
      )
      return { previousLists, previousDetails, deletedIds }
    },

    onError: (_error, _habitId, context) => {
      if (context?.previousLists) restoreHabitLists(queryClient, context.previousLists)
      for (const [queryKey, detail] of context?.previousDetails ?? []) {
        if (detail) queryClient.setQueryData(queryKey, detail)
      }
    },

    onSuccess: async (_data, habitId, context) => {
      await removeDeletedHabitQueries(queryClient, habitId, context.deletedIds)
      showUndoToast(t('undo.habitDeleted'), () => restoreHabit.mutate(habitId))
    },

    onSettled: (_response, error) => {
      if (error) return
      invalidateHabitDeleteQueries(queryClient)
    },
  })
}

export function useReorderHabits() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const { showError } = useAppToast()

  return useAccountScopedMutation({
    mutationFn: (data: ReorderHabitsRequest, intendedAccountId) =>
      reorderHabitsAction(data, intendedAccountId),

    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = snapshotHabitLists(queryClient)
      updateHabitLists(queryClient, (items) =>
        applyReorderPositions(items, data.positions),
      )

      return { previousLists }
    },

    onError: (error, _vars, context) => {
      if (context?.previousLists) {
        restoreHabitLists(queryClient, context.previousLists)
      }
      showError(getFriendlyErrorMessage(error, t, 'habits.reorderFailed'))
    },

    onSettled: () => {
      invalidateHabitListQueries(queryClient)
    },
  })
}

export function useDuplicateHabit() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: (habitId: string, intendedAccountId) =>
      duplicateHabitAction(habitId, intendedAccountId),

    onSettled: () => {
      invalidateHabitStructureQueries(queryClient)
    },
  })
}

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
      await Promise.all([
        queryClient.cancelQueries({ queryKey: habitKeys.lists() }),
        queryClient.cancelQueries({ queryKey: habitKeys.detail(habitId) }),
        queryClient.cancelQueries({ queryKey: habitKeys.fullDetail(habitId) }),
      ])

      const previousLists = queryClient.getQueriesData<HabitScheduleItem[]>({
        queryKey: habitKeys.lists(),
      })
      const previousDetail = queryClient.getQueryData<HabitDetail>(habitKeys.detail(habitId))
      const previousFullDetail = queryClient.getQueryData<HabitFullDetail>(
        habitKeys.fullDetail(habitId),
      )

      queryClient.setQueriesData<HabitScheduleItem[], { queryKey: HabitListKey }>(
        { queryKey: habitKeys.lists() },
        (old) => old ? optimisticUpdateChecklist(old, habitId, items) : old,
      )
      queryClient.setQueryData<HabitDetail>(habitKeys.detail(habitId), (old) =>
        old ? { ...old, checklistItems: items } : old,
      )
      queryClient.setQueryData<HabitFullDetail>(habitKeys.fullDetail(habitId), (old) =>
        old ? { ...old, habit: { ...old.habit, checklistItems: items } } : old,
      )

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
      await queryClient.cancelQueries({ queryKey: habitKeys.detail(parentId) })
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

export function useMoveHabitParent() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: ({
      habitId,
      data,
    }: {
      habitId: string
      data: MoveHabitParentRequest
    }, intendedAccountId) => moveHabitParentAction(habitId, data, intendedAccountId),

    onSettled: () => {
      invalidateHabitStructureQueries(queryClient)
    },
  })
}
