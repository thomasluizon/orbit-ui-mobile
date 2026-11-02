import { withAccountGuard, type HabitAccount , type RestoreHabitInput } from './use-habit-mutation-shared'
import type { HabitDetailSnapshots, HabitDetailUpdates, HabitListSnapshots } from '@orbit/shared/query'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cachedHabitDeletionIds, isCachedHabitDeleted, removeDeletedHabitQueries, restoreDeletedHabitQueries, restoreCachedHabitDetails, updateCachedHabitDetails, invalidateHabitParentDetails, habitKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { createHabitRequestSchema, extractBackendErrorCode, validateApiRequest } from '@orbit/shared'
import { appendHabitDetailChild, removeHabitDetailChild } from '@orbit/shared/utils'
import type { HabitDetail, HabitFullDetail, CreateHabitRequest, UpdateHabitRequest, ReorderHabitsRequest, ChecklistItem, CreateSubHabitRequest, MoveHabitParentRequest } from '@orbit/shared/types/habit'
import { cancelQueuedDeleteForUndo, createTempEntityId, isQueuedResult, type QueuedMarker } from '@/lib/offline-mutations'
import { queuedHabitUpdateRequestSchema } from '@/lib/habit-update-request'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { optimisticInsertHabit, optimisticInsertSubHabit, optimisticPatchHabit, optimisticRemoveHabits, optimisticReorderHabits, optimisticUpdateChecklist } from '@/lib/habit-optimistic-helpers'
import { adjustHabitCount, buildOptimisticDuplicateHabit, buildOptimisticHabit, buildOptimisticHabitPatch, buildOptimisticSubHabit, finalizeHabitMutation, optimisticMoveHabitParent, restoreHabitLists, snapshotHabitLists, updateHabitLists } from '@/lib/habit-mutation-helpers'
import { useUIStore } from '@/stores/ui-store'
import { useOfflineSyncStore } from '@/stores/offline-sync-store'
import { useTranslation } from 'react-i18next'
import { useAppToast } from '@/hooks/use-app-toast'
import { useUndoToast } from '@/hooks/use-undo-toast'

type CreateHabitMutationInput = CreateHabitRequest & { __offlineTempId?: string; __offlineDependsOn?: string[] }

type CreateSubHabitMutationInput = {
  parentId: string
  data: CreateSubHabitRequest
  __offlineTempId?: string
}

export function useCreateHabit() {
  const queryClient = useQueryClient()

  return useMutation<
    { id: string },
    Error,
    CreateHabitMutationInput,
    { previousLists: HabitListSnapshots; tempId: string }
  >({
    mutationFn: async (input) => {
      const { __offlineTempId, __offlineDependsOn, ...data } = input
      const request = validateApiRequest(data, createHabitRequestSchema)
      const tempId = __offlineTempId ?? createTempEntityId('habit')

      return performQueuedApiMutation<{ id: string }, { id: string } & QueuedMarker>({
        type: 'createHabit',
        scope: 'habits',
        endpoint: API.habits.create,
        method: 'POST',
        payload: request,
        entityType: 'habit',
        clientEntityId: tempId,
        dependsOn: __offlineDependsOn,
        queuedResultFactory: (mutationId) => ({
          id: tempId,
          queued: true,
          queuedMutationId: mutationId,
        }),
      })
    },

    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = snapshotHabitLists(queryClient)
      const tempId = createTempEntityId('habit')
      data.__offlineTempId = tempId
      const optimisticHabit = buildOptimisticHabit(queryClient, tempId, data)

      updateHabitLists(queryClient, (items) => optimisticInsertHabit(items, optimisticHabit))

      return { previousLists, tempId }
    },

    onError: (_err, _vars, context) => {
      if (!context) return
      restoreHabitLists(queryClient, context.previousLists)
    },

    onSuccess: (result) => {
      useUIStore.getState().setLastCreatedHabitId(result.id)
    },

    onSettled: (data, error) =>
      finalizeHabitMutation(queryClient, data, error, { includeCount: true }),
  })
}

export function useUpdateHabit() {
  const queryClient = useQueryClient()

  const mutation = useMutation<
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
        const parentId = data.clearParent === true ? null : data.parentId ?? undefined
        const parentChange = parentId === undefined ? undefined : { habitId, parentId }
        const previousDetails = updateCachedHabitDetails(queryClient, (habit) => habit.id === habitId
          ? { ...patch, ...(parentChange ? { parentId } : {}) } : {}, parentChange)
        updateHabitLists(queryClient, (items) => {
          const patched = optimisticPatchHabit(items, habitId, patch)
          return parentChange ? optimisticMoveHabitParent(patched, habitId, parentChange.parentId, true) : patched
        })

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

export function useRestoreHabit() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const { showSuccess, showError } = useAppToast()

  return useMutation<void | QueuedMarker, Error, RestoreHabitInput>({
    mutationFn: (input) =>
      performQueuedApiMutation<void>({
        type: 'restoreHabit',
        scope: 'habits',
        endpoint: API.habits.restore(typeof input === 'string' ? input : input.habitId),
        method: 'POST',
        payload: null,
        entityType: 'habit',
        targetEntityId: typeof input === 'string' ? input : input.habitId,
      }),

    onSuccess: (result, input) => {
      if (!isQueuedResult(result)) {
        restoreDeletedHabitQueries(queryClient, typeof input === 'string' ? input : input.habitId)
        void queryClient.invalidateQueries({ queryKey: habitKeys.all })
      }
      showSuccess(t('undo.restored'))
    },

    onError: (error, input) => {
      if (typeof input !== 'string' && extractBackendErrorCode(error) === 'HABIT_NOT_FOUND') return
      showError(t('undo.restoreFailed'))
    },

    onSettled: (data, error) =>
      finalizeHabitMutation(queryClient, data, error, {
        includeGoals: true,
        includeCount: true,
        includeProfile: true,
      }),
  })
}

export function useDeleteHabit({ requiresConnection = false }: { requiresConnection?: boolean } = {}) {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const restoreHabit = useRestoreHabit()
  const showUndoToast = useUndoToast()

  return useMutation<
    void | QueuedMarker,
    Error,
    string,
    { previousLists: HabitListSnapshots; previousDetails: HabitDetailSnapshots; deletedIds: string[] }
  >({
    mutationFn: (habitId) =>
      isCachedHabitDeleted(queryClient, habitId) ? Promise.resolve() : performQueuedApiMutation<void>({
        type: requiresConnection ? 'bulkCascadeDeleteHabits' : 'deleteHabit',
        scope: 'habits',
        endpoint: API.habits.delete(habitId),
        method: 'DELETE',
        payload: null,
        entityType: 'habit',
        targetEntityId: habitId,
      }),

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

    onError: (_err, _vars, context) => {
      if (!context) return
      restoreHabitLists(queryClient, context.previousLists)
      for (const [queryKey, detail] of context.previousDetails) {
        if (detail) queryClient.setQueryData(queryKey, detail)
      }
    },

    onSuccess: async (data, habitId, context) => {
      if (!isQueuedResult(data)) await removeDeletedHabitQueries(queryClient, habitId, context.deletedIds)
      showUndoToast(t('undo.habitDeleted'), () => {
        if (isQueuedResult(data)) {
          void cancelQueuedDeleteForUndo(data.queuedMutationId).then((outcome) => {
            if (outcome !== 'replayed') {
              restoreHabitLists(queryClient, context.previousLists)
              void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
              void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
            }
            if (outcome === 'dropped') {
              useOfflineSyncStore.getState().dismissDrop(data.queuedMutationId)
              restoreHabit.mutate({ habitId, reconcileNotFound: true })
            }
            else if (outcome === 'replayed' || outcome === 'uncertain') restoreHabit.mutate(habitId)
          })
          return
        }
        restoreHabit.mutate(habitId)
      }, isQueuedResult(data) ? data.queuedMutationId : undefined)
    },

    onSettled: (data, error) => {
      if (error) return
      finalizeHabitMutation(queryClient, data, error, {
        includeGoals: true,
        includeCount: true,
        includeProfile: true,
      })
    },
  })
}

export function useReorderHabits() {
  const queryClient = useQueryClient()

  return useMutation<
    void | QueuedMarker,
    Error,
    ReorderHabitsRequest,
    { previousLists: HabitListSnapshots }
  >({
    mutationFn: (data) =>
      performQueuedApiMutation<void>({
        type: 'reorderHabits',
        scope: 'habits',
        endpoint: API.habits.reorder,
        method: 'PUT',
        payload: data,
        dedupeKey: 'habits:reorder',
      }),

    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = snapshotHabitLists(queryClient)
      updateHabitLists(queryClient, (items) => optimisticReorderHabits(items, data.positions))

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        restoreHabitLists(queryClient, context.previousLists)
      }
    },

    onSettled: (data, error) => finalizeHabitMutation(queryClient, data, error),
  })
}

export function useDuplicateHabit() {
  const queryClient = useQueryClient()

  return useMutation<
    void | QueuedMarker,
    Error,
    string,
    { previousLists: HabitListSnapshots; tempId: string | null }
  >({
    mutationFn: (habitId) =>
      performQueuedApiMutation<void>({
        type: 'duplicateHabit',
        scope: 'habits',
        endpoint: API.habits.duplicate(habitId),
        method: 'POST',
        payload: null,
        entityType: 'habit',
        targetEntityId: habitId,
      }),

    onMutate: async (habitId) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = snapshotHabitLists(queryClient)
      const tempId = createTempEntityId('habit')
      const optimisticDuplicate = buildOptimisticDuplicateHabit(queryClient, habitId, tempId)

      if (optimisticDuplicate) {
        updateHabitLists(queryClient, (items) => optimisticInsertHabit(items, optimisticDuplicate))
        adjustHabitCount(queryClient, 1)
      }

      return { previousLists, tempId: optimisticDuplicate ? tempId : null }
    },

    onError: (_err, _vars, context) => {
      if (!context) return
      restoreHabitLists(queryClient, context.previousLists)
      if (context.tempId) {
        adjustHabitCount(queryClient, -1)
      }
    },

    onSettled: (data, error) => finalizeHabitMutation(queryClient, data, error),
  })
}

export function useUpdateChecklist() {
  const queryClient = useQueryClient()

  return useMutation<
    void | QueuedMarker,
    Error,
    { habitId: string; items: ChecklistItem[] },
    {
      previousLists: HabitListSnapshots
      previousDetail: HabitDetail | undefined
      previousFullDetail: HabitFullDetail | undefined
    }
  >({
    mutationFn: ({ habitId, items }) =>
      performQueuedApiMutation<void>({
        type: 'updateChecklist',
        scope: 'habits',
        endpoint: API.habits.checklist(habitId),
        method: 'PUT',
        payload: { checklistItems: items },
        entityType: 'habit',
        targetEntityId: habitId,
      }),

    onMutate: async ({ habitId, items }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: habitKeys.lists() }),
        queryClient.cancelQueries({ queryKey: habitKeys.detail(habitId) }),
        queryClient.cancelQueries({ queryKey: habitKeys.fullDetail(habitId) }),
      ])

      const previousLists = snapshotHabitLists(queryClient)
      const previousDetail = queryClient.getQueryData<HabitDetail>(habitKeys.detail(habitId))
      const previousFullDetail = queryClient.getQueryData<HabitFullDetail>(
        habitKeys.fullDetail(habitId),
      )

      updateHabitLists(queryClient, (oldItems) =>
        optimisticUpdateChecklist(oldItems, habitId, items),
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
      restoreHabitLists(queryClient, context.previousLists)
      if (context.previousDetail) {
        queryClient.setQueryData(habitKeys.detail(habitId), context.previousDetail)
      }
      if (context.previousFullDetail) {
        queryClient.setQueryData(habitKeys.fullDetail(habitId), context.previousFullDetail)
      }
    },

    onSettled: (data, error, variables) =>
      finalizeHabitMutation(queryClient, data, error, { habitId: variables.habitId, includeProfile: true }),
  })
}

export function useCreateSubHabit() {
  const queryClient = useQueryClient()

  return useMutation<
    void | QueuedMarker,
    Error,
    CreateSubHabitMutationInput,
    { previousLists: HabitListSnapshots; previousDetail: HabitDetail | undefined }
  >({
    mutationFn: async ({ parentId, data, __offlineTempId }) => {
      const tempId = __offlineTempId ?? createTempEntityId('habit')

      return performQueuedApiMutation<void>({
        type: 'createSubHabit',
        scope: 'habits',
        endpoint: API.habits.subHabits(parentId),
        method: 'POST',
        payload: data,
        entityType: 'habit',
        targetEntityId: parentId,
        clientEntityId: tempId,
        dependsOn: parentId.startsWith('offline-') ? [parentId] : [],
      })
    },

    onMutate: async (input) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: habitKeys.lists() }),
        queryClient.cancelQueries({ queryKey: habitKeys.detail(input.parentId) }),
      ])

      const { parentId, data } = input
      const previousLists = snapshotHabitLists(queryClient)
      const previousDetail = queryClient.getQueryData<HabitDetail>(habitKeys.detail(parentId))
      const tempId = createTempEntityId('habit')
      input.__offlineTempId = tempId
      const optimisticChild = buildOptimisticSubHabit(queryClient, parentId, tempId, data)
      updateHabitLists(queryClient, (items) =>
        optimisticInsertSubHabit(
          optimisticPatchHabit(items, parentId, { hasSubHabits: true }),
          parentId,
          optimisticChild,
        ),
      )
      queryClient.setQueryData<HabitDetail>(habitKeys.detail(parentId), (detail) =>
        detail ? appendHabitDetailChild(detail, tempId, data) : detail,
      )

      return { previousLists, previousDetail }
    },

    onError: (_err, variables, context) => {
      if (context?.previousLists) {
        restoreHabitLists(queryClient, context.previousLists)
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(habitKeys.detail(variables.parentId), context.previousDetail)
      }
    },

    onSettled: (data, error, { parentId }) =>
      finalizeHabitMutation(queryClient, data, error, { habitId: parentId }),
  })
}

export function useMoveHabitParent() {
  const queryClient = useQueryClient()

  return useMutation<void | QueuedMarker, Error, {
    habitId: string
    data: MoveHabitParentRequest
  }, {
    previousLists: HabitListSnapshots
  }>({
    mutationFn: async ({ habitId, data }) => {
      const targetEntityId =
        data.parentId?.startsWith('offline-') ? data.parentId : habitId

      return performQueuedApiMutation<void>({
        type: 'moveHabitParent',
        scope: 'habits',
        endpoint: API.habits.parent(habitId),
        method: 'PUT',
        payload: data,
        entityType: 'habit',
        targetEntityId,
        dependsOn: data.parentId ? [data.parentId] : [],
      })
    },

    onMutate: async ({ habitId, data }) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = snapshotHabitLists(queryClient)
      updateHabitLists(queryClient, (items) =>
        optimisticMoveHabitParent(items, habitId, data.parentId),
      )

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        restoreHabitLists(queryClient, context.previousLists)
      }
    },

    onSettled: (data, error) => finalizeHabitMutation(queryClient, data, error),
  })
}
