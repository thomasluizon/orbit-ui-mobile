import {
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  habitKeys,
  goalKeys,
  gamificationKeys,
  profileKeys,
} from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import {
  applyLinkedGoalUpdates,
  appendHabitDetailChild,
  buildOptimisticSkipPatch,
  findHabitInList,
  formatAPIDate,
  normalizeHabits,
  removeHabitDetailChild,
} from '@orbit/shared/utils'
import type {
  HabitScheduleItem,
  HabitDetail,
  HabitFullDetail,
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
import type { HabitLog } from '@orbit/shared/types/calendar'
import {
  createTempEntityId,
  isQueuedResult,
  OfflineMutationPreflightError,
  type QueuedMarker,
} from '@/lib/offline-mutations'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import {
  optimisticInsertHabit,
  optimisticInsertSubHabit,
  optimisticPatchHabit,
  optimisticRemoveHabits,
  optimisticReorderHabits,
  optimisticSetDatedCompletion,
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
  updateHabitListsForDate,
} from '@/lib/habit-mutation-helpers'
import {
  getMilestoneShareStreakKey,
  getReviewMomentStreakKey,
} from '@orbit/shared/stores'
import {
  isReviewMomentEligible,
  useReviewReminderStore,
} from '@/stores/review-reminder-store'
import { useUIStore } from '@/stores/ui-store'
import { useTranslation } from 'react-i18next'
import { useAppToast } from '@/hooks/use-app-toast'
import { useUndoToast } from '@/hooks/use-undo-toast'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'

type CreateHabitMutationInput = CreateHabitRequest & { __offlineTempId?: string }
type BulkCreateHabitMutationInput = BulkCreateRequest & { __offlineTempIds?: string[] }
type LogHabitMutationInput = {
  habitId: string
  date?: string
  intent: 'log' | 'unlog'
}
type CreateSubHabitMutationInput = {
  parentId: string
  data: CreateSubHabitRequest
  __offlineTempId?: string
}
type HabitListSnapshots = readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[]
type HabitDetailSnapshots = readonly (readonly [readonly unknown[], HabitDetail | undefined])[]
type LogHabitSnapshot = {
  previousLists: HabitListSnapshots
  previousLogs: HabitLog[] | undefined
}
type OfflineBulkMutationOutcome<TResponse> = TResponse & {
  ambiguousIds: string[]
  offlineFailureIds: string[]
}

function restoreRejectedBulkItems(
  queryClient: ReturnType<typeof useQueryClient>,
  previousLists: HabitListSnapshots,
  results: readonly { habitId: string; status: 'Success' | 'Failed' }[],
  offlineFailureIds: readonly string[] = [],
): void {
  const rejectedHabitIds = [
    ...results.flatMap((item) => item.status !== 'Success' ? [item.habitId] : []),
    ...offlineFailureIds,
  ]

  for (const [queryKey, previousItems] of previousLists) {
    if (!previousItems) continue

    queryClient.setQueryData<HabitScheduleItem[]>(queryKey, (currentItems) => {
      if (!currentItems) return currentItems

      return rejectedHabitIds.reduce((nextItems, habitId) => {
        const previousHabit = findHabitInList(previousItems, habitId)
        return previousHabit
          ? optimisticPatchHabit(nextItems, habitId, {
              isCompleted: previousHabit.isCompleted,
            })
          : nextItems
      }, currentItems)
    })
  }
}

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
export { useCalendarData, useCalendarRange } from './use-calendar-data'

export function useLogHabit() {
  const queryClient = useQueryClient()
  const { setStreakCelebration, checkAllDoneCelebration, activeFilters } = useUIStore.getState()

  return useMutation<
    LogHabitResponse | QueuedMarker,
    Error,
    LogHabitMutationInput,
    LogHabitSnapshot
  >({
    mutationFn: ({ habitId, date }) => {
      const occurrenceDate = date ?? formatAPIDate(new Date())
      return performQueuedApiMutation<LogHabitResponse>({
        type: 'logHabit',
        scope: 'habits',
        endpoint: API.habits.log(habitId),
        method: 'POST',
        payload: date ? { date } : undefined,
        entityType: 'habit',
        targetEntityId: habitId,
        dedupeKey: `habit-toggle:${habitId}:${occurrenceDate}`,
      })
    },

    onMutate: ({ habitId, date, intent }) => {
      void queryClient.cancelQueries({ queryKey: habitKeys.lists() })
      if (date) void queryClient.cancelQueries({ queryKey: habitKeys.logs(habitId) })

      const previousLists = snapshotHabitLists(queryClient)
      const previousLogs = date
        ? queryClient.getQueryData<HabitLog[]>(habitKeys.logs(habitId))
        : undefined

      if (date) {
        const completed = intent === 'log'
        const optimisticLogId = `optimistic-log:${habitId}:${date}`

        queryClient.setQueryData<HabitLog[]>(habitKeys.logs(habitId), (old) => {
          const logs = old ?? []
          if (!completed) {
            return logs.filter((log) => log.date !== date || log.value <= 0)
          }
          if (logs.some((log) => log.date === date && log.value > 0)) return logs
          return [...logs, {
            id: optimisticLogId,
            date,
            value: 1,
            createdAtUtc: new Date().toISOString(),
          }]
        })
        updateHabitListsForDate(queryClient, date, (items) =>
          optimisticSetDatedCompletion(
            items,
            habitId,
            date,
            completed,
            optimisticLogId,
          ))
      } else {
        updateHabitLists(queryClient, (items) => optimisticToggleCompletion(items, habitId))
      }

      return { previousLists, previousLogs }
    },

    onError: (_err, variables, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          if (data) {
            queryClient.setQueryData(key, data)
          }
        }
      }
      if (context && variables.date) {
        queryClient.setQueryData(habitKeys.logs(variables.habitId), context.previousLogs)
      }
    },

    onSuccess: (response, variables) => {
      const queuedResult = isQueuedResult(response)

      if (variables.intent === 'log' && (!queuedResult || response.retained !== true)) {
        useReviewReminderStore
          .getState()
          .trackCompletion(variables.date ?? formatAPIDate(new Date()))
      }

      if (queuedResult) {
        return
      }

      const loggedHabit = findHabitInList(
        queryClient
          .getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })
          .flatMap(([, items]) => items ?? []),
        variables.habitId,
      )
      /**
       * The CELEBRATION still needs a known good habit, and deliberately so: a bad habit's
       * "streak" is consecutive abstinence, the opposite semantics, and an unresolvable habit
       * cannot be shown to be either. Celebrating on a guess is user-visible harm.
       *
       * The RECONCILIATION below does not, which is the defect. See the comment there.
       */
      const countsTowardStreak = loggedHabit !== null && !loggedHabit.isBadHabit

      if (countsTowardStreak && response.isFirstCompletionToday && response.currentStreak > 0) {
        setStreakCelebration({ streak: response.currentStreak })
        queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
          old ? { ...old, currentStreak: response.currentStreak } : old,
        )
        const milestoneShareKey = getMilestoneShareStreakKey(response.currentStreak)
        if (milestoneShareKey) {
          useEngagementPromptStore.getState().armMilestoneSharePrompt(milestoneShareKey)
        }
        const reviewMomentKey = getReviewMomentStreakKey(response.currentStreak)
        if (
          reviewMomentKey &&
          isReviewMomentEligible(
            useReviewReminderStore.getState(),
            queryClient.getQueryData<Profile>(profileKeys.detail())
              ?.hasCompletedOnboarding ?? false,
            formatAPIDate(new Date()),
          )
        ) {
          useEngagementPromptStore.getState().armReviewPrompt(reviewMomentKey)
        }
      }

      if (response.linkedGoalUpdates?.length) {
        queryClient.setQueriesData<Goal[]>(
          { queryKey: goalKeys.lists() },
          (old) => old ? applyLinkedGoalUpdates(old, response.linkedGoalUpdates!) : old,
        )
        void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      }

      /**
       * Rewards the server already granted are reconciled from the RESPONSE, with no list-cache
       * requirement. Gating these on `countsTowardStreak` dropped them entirely whenever the habit
       * was not in cache, which is the ordinary state on a deep link or a cold navigation: XP
       * silently unbanked and the achievement list never refreshed.
       *
       * The habit kind cannot change the answer here, so it is not consulted. A bad habit earns
       * ZERO XP server-side (GamificationService.cs:170, `habit.IsBadHabit ? 0 : ...`), so adding
       * `response.xpEarned` is a no-op for one; and a bad habit CAN still grant an achievement,
       * because GamificationService.cs:175 grants BadHabitBreaker at a 30 day abstinence streak.
       * The old gate therefore dropped a real achievement as well.
       */
      if (response.xpEarned || response.newAchievementIds?.length) {
        queryClient.setQueryData<GamificationProfile>(gamificationKeys.profile(), (old) => {
          if (!old) return old
          return { ...old, totalXp: old.totalXp + (response.xpEarned ?? 0) }
        })
        void queryClient.invalidateQueries({ queryKey: profileKeys.all })
      }

      if (response.isFirstCompletionToday || response.xpEarned || response.newAchievementIds?.length) {
        void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
      }

      const habitsData = queryClient.getQueryData<HabitScheduleItem[]>(
        habitKeys.list(activeFilters),
      )
      if (habitsData) {
        const normalized = normalizeHabits(habitsData)
        checkAllDoneCelebration(normalized)
      }

    },

    onSettled: (data, error, { habitId }) => {
      finalizeHabitMutation(queryClient, data, error, { habitId, includeHistory: true })
    },
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

      if (!date) {
        updateHabitLists(queryClient, (items) => {
          const habit = findHabitInList(items, habitId)
          if (!habit) return items
          return optimisticPatchHabit(items, habitId, buildOptimisticSkipPatch(habit))
        })
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

    onSettled: (data, error) =>
      finalizeHabitMutation(queryClient, data, error, { includeCount: true }),
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

    onError: (_err, _variables, context) => {
      if (context?.previousLists) {
        restoreHabitLists(queryClient, context.previousLists)
      }
    },

    onSettled: (data, error, { habitId }) =>
      finalizeHabitMutation(queryClient, data, error, { habitId }),
  })
}

export function useRestoreHabit() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const { showSuccess, showError } = useAppToast()

  return useMutation<void | QueuedMarker, Error, string>({
    mutationFn: (habitId) =>
      performQueuedApiMutation<void>({
        type: 'restoreHabit',
        scope: 'habits',
        endpoint: API.habits.restore(habitId),
        method: 'POST',
        payload: null,
        entityType: 'habit',
        targetEntityId: habitId,
      }),

    onSuccess: () => {
      showSuccess(t('undo.restored'))
    },

    onError: () => {
      showError(t('undo.restoreFailed'))
    },

    onSettled: (data, error) =>
      finalizeHabitMutation(queryClient, data, error, {
        includeGoals: true,
        includeCount: true,
      }),
  })
}

export function useDeleteHabit() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const restoreHabit = useRestoreHabit()
  const showUndoToast = useUndoToast()

  return useMutation<
    void | QueuedMarker,
    Error,
    string,
    { previousLists: HabitListSnapshots; previousDetails: HabitDetailSnapshots }
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
      await Promise.all([
        queryClient.cancelQueries({ queryKey: habitKeys.lists() }),
        queryClient.cancelQueries({ queryKey: habitKeys.details() }),
      ])

      const previousLists = snapshotHabitLists(queryClient)
      const previousDetails = queryClient.getQueriesData<HabitDetail>({
        queryKey: habitKeys.details(),
      })
      updateHabitLists(queryClient, (items) => optimisticRemoveHabits(items, [habitId]))
      queryClient.setQueriesData<HabitDetail>(
        { queryKey: habitKeys.details() },
        (detail) => detail ? removeHabitDetailChild(detail, habitId) : detail,
      )
      adjustHabitCount(queryClient, -1)

      return { previousLists, previousDetails }
    },

    onError: (_err, _vars, context) => {
      if (!context) return
      restoreHabitLists(queryClient, context.previousLists)
      for (const [queryKey, detail] of context.previousDetails) {
        if (detail) queryClient.setQueryData(queryKey, detail)
      }
      adjustHabitCount(queryClient, 1)
    },

    onSuccess: (_data, habitId) => {
      showUndoToast(t('undo.habitDeleted'), () => restoreHabit.mutate(habitId))
    },

    onSettled: (data, error) => {
      if (!isQueuedResult(data)) {
        void queryClient.invalidateQueries({ queryKey: habitKeys.details() })
      }
      finalizeHabitMutation(queryClient, data, error, {
        includeGoals: true,
        includeCount: true,
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
      finalizeHabitMutation(queryClient, data, error, { habitId: variables.habitId }),
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
            title: habit.title,
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

    onSettled: (data, error) =>
      finalizeHabitMutation(queryClient, data, error, { includeCount: true }),
  })
}

export function useBulkDeleteHabits() {
  const queryClient = useQueryClient()

  return useMutation<
    OfflineBulkMutationOutcome<BulkDeleteResponse>,
    Error,
    string[],
    { previousLists: HabitListSnapshots; deletedCount: number }
  >({
    mutationFn: async (habitIds) => {
      try {
        const response = await performQueuedApiMutation<
          BulkDeleteResponse,
          BulkDeleteResponse & QueuedMarker
        >({
          type: 'bulkDeleteHabits',
          scope: 'habits',
          endpoint: API.habits.bulk,
          method: 'DELETE',
          payload: { habitIds },
          allowAutomaticReplay: false,
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
        })
        return { ...response, ambiguousIds: [], offlineFailureIds: [] }
      } catch (error: unknown) {
        if (error instanceof OfflineMutationPreflightError) {
          return { results: [], ambiguousIds: [], offlineFailureIds: habitIds }
        }
        return { results: [], ambiguousIds: habitIds, offlineFailureIds: [] }
      }
    },

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

    onSuccess: (result, _habitIds, context) => {
      if (result.offlineFailureIds.length === 0) return
      restoreHabitLists(queryClient, context.previousLists)
      adjustHabitCount(queryClient, result.offlineFailureIds.length)
    },

    onSettled: (data, error) =>
      finalizeHabitMutation(queryClient, data, error, {
        includeGoals: true,
        includeCount: true,
      }),
  })
}

export function useBulkLogHabits() {
  const queryClient = useQueryClient()

  return useMutation<
    OfflineBulkMutationOutcome<BulkLogResult>,
    Error,
    BulkLogItemRequest[],
    { previousLists: HabitListSnapshots }
  >({
    mutationFn: async (items) => {
      try {
        const response = await performQueuedApiMutation<
          BulkLogResult,
          BulkLogResult & QueuedMarker
        >({
          type: 'bulkLogHabits',
          scope: 'habits',
          endpoint: API.habits.bulkLog,
          method: 'POST',
          payload: { items },
          allowAutomaticReplay: false,
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
        })
        return { ...response, ambiguousIds: [], offlineFailureIds: [] }
      } catch (error: unknown) {
        if (error instanceof OfflineMutationPreflightError) {
          return {
            results: [],
            ambiguousIds: [],
            offlineFailureIds: items.map((item) => item.habitId),
          }
        }
        return {
          results: [],
          ambiguousIds: items.map((item) => item.habitId),
          offlineFailureIds: [],
        }
      }
    },

    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = snapshotHabitLists(queryClient)
      const completedIds = items.map((item) => item.habitId)

      updateHabitLists(queryClient, (currentItems) =>
        completedIds.reduce(
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

    onSuccess: (result, items, context) => {
      restoreRejectedBulkItems(
        queryClient,
        context.previousLists,
        result.results,
        result.offlineFailureIds,
      )

      for (const itemResult of result.results) {
        if (itemResult.status !== 'Success') continue
        const item = items[itemResult.index]
        if (!item) continue
        useReviewReminderStore
          .getState()
          .trackCompletion(item.date ?? formatAPIDate(new Date()))
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
    OfflineBulkMutationOutcome<BulkSkipResult>,
    Error,
    BulkSkipItemRequest[],
    { previousLists: HabitListSnapshots }
  >({
    mutationFn: async (items) => {
      try {
        const response = await performQueuedApiMutation<
          BulkSkipResult,
          BulkSkipResult & QueuedMarker
        >({
          type: 'bulkSkipHabits',
          scope: 'habits',
          endpoint: API.habits.bulkSkip,
          method: 'POST',
          payload: { items },
          allowAutomaticReplay: false,
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
        })
        return { ...response, ambiguousIds: [], offlineFailureIds: [] }
      } catch (error: unknown) {
        if (error instanceof OfflineMutationPreflightError) {
          return {
            results: [],
            ambiguousIds: [],
            offlineFailureIds: items.map((item) => item.habitId),
          }
        }
        return {
          results: [],
          ambiguousIds: items.map((item) => item.habitId),
          offlineFailureIds: [],
        }
      }
    },

    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = snapshotHabitLists(queryClient)
      const completedIds = items.map((item) => item.habitId)

      updateHabitLists(queryClient, (currentItems) =>
        completedIds.reduce(
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

    onSuccess: (result, _items, context) => {
      restoreRejectedBulkItems(
        queryClient,
        context.previousLists,
        result.results,
        result.offlineFailureIds,
      )
    },

    onSettled: (data, error) => finalizeHabitMutation(queryClient, data, error),
  })
}
