import {
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  habitKeys,
  goalKeys,
  gamificationKeys,
  profileKeys,
  QUERY_STALE_TIMES,
} from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import {
  applyLinkedGoalUpdates,
  formatAPIDate,
  normalizeHabits,
} from '@orbit/shared/utils'
import type {
  HabitScheduleItem,
  LogHabitResponse,
  CreateHabitRequest,
  UpdateHabitRequest,
  ReorderHabitsRequest,
  ChecklistItem,
  CreateSubHabitRequest,
  MoveHabitParentRequest,
  BulkCreateRequest,
  BulkCreateResponse,
  BulkDeleteResponse,
  BulkLogItemRequest,
  BulkLogResult,
  BulkSkipItemRequest,
  BulkSkipResult,
} from '@orbit/shared/types/habit'
import type { Goal } from '@orbit/shared/types/goal'
import type { Profile } from '@orbit/shared/types/profile'
import type { GamificationProfile } from '@orbit/shared/types/gamification'
import {
  createTempEntityId,
  isQueuedResult,
  type QueuedMarker,
} from '@/lib/offline-mutations'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import {
  optimisticInsertHabit,
  optimisticInsertSubHabit,
  optimisticPatchHabit,
  optimisticRemoveHabits,
  optimisticReorderHabits,
  optimisticToggleCompletion,
  optimisticUpdateChecklist,
} from '@/lib/habit-optimistic-helpers'
import {
  adjustHabitCount,
  buildOptimisticDuplicateHabit,
  buildOptimisticHabit,
  buildOptimisticHabitPatch,
  buildOptimisticSubHabit,
  finalizeHabitMutation,
  optimisticMoveHabitParent,
  restoreHabitLists,
  snapshotHabitLists,
  updateHabitLists,
} from '@/lib/habit-mutation-helpers'
import { useReviewReminderStore } from '@/stores/review-reminder-store'
import { useUIStore } from '@/stores/ui-store'

type CreateHabitMutationInput = CreateHabitRequest & { __offlineTempId?: string }
type BulkCreateHabitMutationInput = BulkCreateRequest & { __offlineTempIds?: string[] }
type CreateSubHabitMutationInput = {
  parentId: string
  data: CreateSubHabitRequest
  __offlineTempId?: string
}
type HabitListSnapshots = ReadonlyArray<
  readonly [readonly unknown[], HabitScheduleItem[] | undefined]
>
export {
  EMPTY_CHILDREN_BY_PARENT,
  EMPTY_HABITS_BY_ID,
  EMPTY_NORMALIZED_HABITS,
  normalizeHabits,
  sortByPosition,
  type NormalizedHabitsData,
  useHabitDetail,
  useHabitFullDetail,
  useHabitLogs,
  useHabitMetrics,
  useHabits,
  useTotalHabitCount,
} from './use-habit-queries'
export { useCalendarData } from './use-calendar-data'
export { useSummary } from './use-summary'

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useLogHabit() {
  const queryClient = useQueryClient()
  const { setStreakCelebration, checkAllDoneCelebration, activeFilters } = useUIStore.getState()

  return useMutation<
    LogHabitResponse | QueuedMarker,
    Error,
    { habitId: string; note?: string; date?: string },
    { previousLists: HabitListSnapshots }
  >({
    mutationFn: ({ habitId, note, date }) =>
      performQueuedApiMutation<LogHabitResponse>({
        type: 'logHabit',
        scope: 'habits',
        endpoint: API.habits.log(habitId),
        method: 'POST',
        payload: note || date ? { note, date } : undefined,
        entityType: 'habit',
        targetEntityId: habitId,
      }),

    onMutate: async ({ habitId, date }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      // Snapshot all list queries for rollback
      const previousLists = snapshotHabitLists(queryClient)

      // Optimistic toggle: find the habit in any list cache and flip isCompleted
      if (!date) {
        updateHabitLists(queryClient, (items) => optimisticToggleCompletion(items, habitId))
      }

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      // Rollback optimistic update
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          if (data) {
            queryClient.setQueryData(key, data)
          }
        }
      }
    },

    onSuccess: (response, variables) => {
      // Streak celebration + update profile streak immediately so StreakBadge reflects it
      if (isQueuedResult(response)) {
        return
      }

      useReviewReminderStore
        .getState()
        .trackCompletion(variables.date ?? formatAPIDate(new Date()))

      if (response?.isFirstCompletionToday && response.currentStreak > 0) {
        setStreakCelebration({ streak: response.currentStreak })
        queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
          old ? { ...old, currentStreak: response.currentStreak } : old,
        )
      }

      // Apply targeted goal updates from enriched response (instant, no refetch needed)
      if (response?.linkedGoalUpdates?.length) {
        queryClient.setQueriesData<Goal[]>(
          { queryKey: goalKeys.lists() },
          (old) => old ? applyLinkedGoalUpdates(old, response.linkedGoalUpdates!) : old,
        )
      }

      // Apply gamification XP/achievement updates from enriched response (instant)
      if (response?.xpEarned || response?.newAchievementIds?.length) {
        queryClient.setQueryData<GamificationProfile>(gamificationKeys.profile(), (old) => {
          if (!old) return old
          return { ...old, totalXp: old.totalXp + (response.xpEarned ?? 0) }
        })
      }

      // Check all-done celebration
      const habitsData = queryClient.getQueryData<HabitScheduleItem[]>(
        habitKeys.list(activeFilters as Record<string, unknown>),
      )
      if (habitsData) {
        const normalized = normalizeHabits(habitsData)
        checkAllDoneCelebration(normalized)
      }

    },

    onSettled: (data, error) =>
      finalizeHabitMutation(queryClient, data, error, {
        includeGoals: true,
        includeProfile: true,
        includeGamification: true,
      }),
  })
}

export function useSkipHabit() {
  const queryClient = useQueryClient()

  return useMutation<
    void | QueuedMarker,
    Error,
    { habitId: string; date?: string },
    { previousLists: HabitListSnapshots }
  >({
    mutationFn: ({ habitId, date }) =>
      performQueuedApiMutation<void>({
        type: 'skipHabit',
        scope: 'habits',
        endpoint: API.habits.skip(habitId),
        method: 'POST',
        payload: date ? { date } : undefined,
        entityType: 'habit',
        targetEntityId: habitId,
      }),

    onMutate: async ({ habitId, date }) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = snapshotHabitLists(queryClient)

      // Optimistic: mark as completed (only when no specific date)
      if (!date) {
        updateHabitLists(queryClient, (items) => optimisticPatchHabit(items, habitId, {
          isCompleted: true,
        }))
      }

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          if (data) queryClient.setQueryData(key, data)
        }
      }
    },

    onSettled: (data, error) =>
      finalizeHabitMutation(queryClient, data, error, {
        includeGoals: true,
        includeProfile: true,
        includeGamification: true,
      }),
  })
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
      const { __offlineTempId, ...data } = input
      const tempId = __offlineTempId ?? createTempEntityId('habit')

      return performQueuedApiMutation<{ id: string }, { id: string } & QueuedMarker>({
        type: 'createHabit',
        scope: 'habits',
        endpoint: API.habits.create,
        method: 'POST',
        payload: data,
        entityType: 'habit',
        clientEntityId: tempId,
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
      adjustHabitCount(queryClient, 1)

      return { previousLists, tempId }
    },

    onError: (_err, _vars, context) => {
      if (!context) return
      restoreHabitLists(queryClient, context.previousLists)
      adjustHabitCount(queryClient, -1)
    },

    onSuccess: (result) => {
      useUIStore.getState().setLastCreatedHabitId(result.id)
    },

    onSettled: (data, error) => finalizeHabitMutation(queryClient, data, error),
  })
}

export function useUpdateHabit() {
  const queryClient = useQueryClient()

  return useMutation<
    void | QueuedMarker,
    Error,
    { habitId: string; data: UpdateHabitRequest },
    { previousLists: HabitListSnapshots }
  >({
    mutationFn: ({ habitId, data }) =>
      performQueuedApiMutation<void>({
        type: 'updateHabit',
        scope: 'habits',
        endpoint: API.habits.update(habitId),
        method: 'PUT',
        payload: data,
        entityType: 'habit',
        targetEntityId: habitId,
      }),

    onMutate: async ({ habitId, data }) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = snapshotHabitLists(queryClient)
      const patch = buildOptimisticHabitPatch(queryClient, data)
      updateHabitLists(queryClient, (items) =>
        optimisticPatchHabit(items, habitId, patch),
      )

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        restoreHabitLists(queryClient, context.previousLists)
      }
    },

    onSettled: (data, error, { habitId }) =>
      finalizeHabitMutation(queryClient, data, error, { habitId }),
  })
}

export function useDeleteHabit() {
  const queryClient = useQueryClient()

  return useMutation<
    void | QueuedMarker,
    Error,
    string,
    { previousLists: HabitListSnapshots }
  >({
    mutationFn: (habitId) =>
      performQueuedApiMutation<void>({
        type: 'deleteHabit',
        scope: 'habits',
        endpoint: API.habits.delete(habitId),
        method: 'DELETE',
        payload: null,
        entityType: 'habit',
        targetEntityId: habitId,
      }),

    onMutate: async (habitId) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = snapshotHabitLists(queryClient)
      updateHabitLists(queryClient, (items) => optimisticRemoveHabits(items, [habitId]))
      adjustHabitCount(queryClient, -1)

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (!context) return
      restoreHabitLists(queryClient, context.previousLists)
      adjustHabitCount(queryClient, 1)
    },

    onSettled: (data, error) =>
      finalizeHabitMutation(queryClient, data, error, { includeGoals: true }),
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
    { previousLists: HabitListSnapshots }
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
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = snapshotHabitLists(queryClient)

      updateHabitLists(queryClient, (oldItems) =>
        optimisticUpdateChecklist(oldItems, habitId, items),
      )

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        restoreHabitLists(queryClient, context.previousLists)
      }
    },

    onSettled: (data, error, variables) =>
      finalizeHabitMutation(queryClient, data, error, { habitId: variables.habitId }),
  })
}

// ---------------------------------------------------------------------------
// Sub-habit and parent mutations
// ---------------------------------------------------------------------------

export function useCreateSubHabit() {
  const queryClient = useQueryClient()

  return useMutation<
    void | QueuedMarker,
    Error,
    CreateSubHabitMutationInput,
    { previousLists: HabitListSnapshots }
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
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const { parentId, data } = input
      const previousLists = snapshotHabitLists(queryClient)
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
        (data.parentId && data.parentId.startsWith('offline-'))
          ? data.parentId
          : habitId

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

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

export function useBulkCreateHabits() {
  const queryClient = useQueryClient()

  return useMutation<
    BulkCreateResponse,
    Error,
    BulkCreateHabitMutationInput,
    { previousLists: HabitListSnapshots; createdCount: number }
  >({
    mutationFn: async (input) => {
      const { __offlineTempIds, ...data } = input
      const tempIds =
        __offlineTempIds ?? data.habits.map(() => createTempEntityId('habit'))

      return performQueuedApiMutation<BulkCreateResponse, BulkCreateResponse & QueuedMarker>({
        type: 'bulkCreateHabits',
        scope: 'habits',
        endpoint: API.habits.bulk,
        method: 'POST',
        payload: data,
        queuedResultFactory: (mutationId) => ({
          results: data.habits.map((habit, index) => ({
            index,
            status: 'Success' as const,
            habitId: tempIds[index] ?? null,
            title: habit.title ?? null,
            error: null,
            field: null,
          })),
          queued: true as const,
          queuedMutationId: mutationId,
        }),
      })
    },

    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = snapshotHabitLists(queryClient)
      const tempIds = data.habits.map(() => createTempEntityId('habit'))
      data.__offlineTempIds = tempIds

      const optimisticHabits = data.habits.map((habit, index) =>
        buildOptimisticHabit(queryClient, tempIds[index]!, {
          title: habit.title,
          description: habit.description ?? undefined,
          frequencyUnit: habit.frequencyUnit ?? undefined,
          frequencyQuantity: habit.frequencyQuantity ?? undefined,
          days: habit.days ?? undefined,
          isBadHabit: habit.isBadHabit ?? undefined,
          isGeneral: habit.isGeneral ?? undefined,
          isFlexible: habit.isFlexible ?? undefined,
          dueDate: habit.dueDate ?? undefined,
          dueTime: habit.dueTime ?? undefined,
          dueEndTime: habit.dueEndTime ?? undefined,
          reminderEnabled: habit.reminderEnabled ?? undefined,
          reminderTimes: habit.reminderTimes ?? undefined,
          scheduledReminders: habit.scheduledReminders ?? undefined,
          checklistItems: habit.checklistItems ?? undefined,
          subHabits: habit.subHabits?.map((subHabit) => subHabit.title) ?? undefined,
          endDate: habit.endDate ?? undefined,
        }),
      )

      updateHabitLists(queryClient, (items) =>
        optimisticHabits.reduce(
          (nextItems, optimisticHabit) => optimisticInsertHabit(nextItems, optimisticHabit),
          items,
        ),
      )
      adjustHabitCount(queryClient, optimisticHabits.length)

      return { previousLists, createdCount: optimisticHabits.length }
    },

    onError: (_err, _vars, context) => {
      if (!context) return
      restoreHabitLists(queryClient, context.previousLists)
      adjustHabitCount(queryClient, -context.createdCount)
    },

    onSettled: (data, error) => finalizeHabitMutation(queryClient, data, error),
  })
}

export function useBulkDeleteHabits() {
  const queryClient = useQueryClient()

  return useMutation<
    BulkDeleteResponse,
    Error,
    string[],
    { previousLists: HabitListSnapshots; deletedCount: number }
  >({
    mutationFn: (habitIds) =>
      performQueuedApiMutation<BulkDeleteResponse, BulkDeleteResponse & QueuedMarker>({
        type: 'bulkDeleteHabits',
        scope: 'habits',
        endpoint: API.habits.bulk,
        method: 'DELETE',
        payload: { habitIds },
        queuedResultFactory: (mutationId) => ({
          results: habitIds.map((habitId, index) => ({
            index,
            status: 'Success' as const,
            habitId,
            error: null,
          })),
          queued: true as const,
          queuedMutationId: mutationId,
        }),
      }),

    onMutate: async (habitIds) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = snapshotHabitLists(queryClient)
      updateHabitLists(queryClient, (items) => optimisticRemoveHabits(items, habitIds))
      adjustHabitCount(queryClient, -habitIds.length)

      return { previousLists, deletedCount: habitIds.length }
    },

    onError: (_err, _vars, context) => {
      if (!context) return
      restoreHabitLists(queryClient, context.previousLists)
      adjustHabitCount(queryClient, context.deletedCount)
    },

    onSettled: (data, error) =>
      finalizeHabitMutation(queryClient, data, error, { includeGoals: true }),
  })
}

export function useBulkLogHabits() {
  const queryClient = useQueryClient()

  return useMutation<
    BulkLogResult,
    Error,
    BulkLogItemRequest[],
    { previousLists: HabitListSnapshots }
  >({
    mutationFn: (items) =>
      performQueuedApiMutation<BulkLogResult, BulkLogResult & QueuedMarker>({
        type: 'bulkLogHabits',
        scope: 'habits',
        endpoint: API.habits.bulkLog,
        method: 'POST',
        payload: { items },
        queuedResultFactory: (mutationId) => ({
          results: items.map((item, index) => ({
            index,
            status: 'Success' as const,
            habitId: item.habitId,
            logId: null,
            error: null,
          })),
          queued: true as const,
          queuedMutationId: mutationId,
        }),
      }),

    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = snapshotHabitLists(queryClient)
      const immediateIds = items
        .filter((item) => !item.date)
        .map((item) => item.habitId)

      updateHabitLists(queryClient, (currentItems) =>
        immediateIds.reduce(
          (nextItems, habitId) => optimisticPatchHabit(nextItems, habitId, { isCompleted: true }),
          currentItems,
        ),
      )

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        restoreHabitLists(queryClient, context.previousLists)
      }
    },

    onSettled: (data, error) =>
      finalizeHabitMutation(queryClient, data, error, {
        includeGoals: true,
        includeGamification: true,
      }),
  })
}

export function useBulkSkipHabits() {
  const queryClient = useQueryClient()

  return useMutation<
    BulkSkipResult,
    Error,
    BulkSkipItemRequest[],
    { previousLists: HabitListSnapshots }
  >({
    mutationFn: (items) =>
      performQueuedApiMutation<BulkSkipResult, BulkSkipResult & QueuedMarker>({
        type: 'bulkSkipHabits',
        scope: 'habits',
        endpoint: API.habits.bulkSkip,
        method: 'POST',
        payload: { items },
        queuedResultFactory: (mutationId) => ({
          results: items.map((item, index) => ({
            index,
            status: 'Success' as const,
            habitId: item.habitId,
            error: null,
          })),
          queued: true as const,
          queuedMutationId: mutationId,
        }),
      }),

    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = snapshotHabitLists(queryClient)
      const immediateIds = items
        .filter((item) => !item.date)
        .map((item) => item.habitId)

      updateHabitLists(queryClient, (currentItems) =>
        immediateIds.reduce(
          (nextItems, habitId) => optimisticPatchHabit(nextItems, habitId, { isCompleted: true }),
          currentItems,
        ),
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
