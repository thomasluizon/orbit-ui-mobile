'use client'

import {
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { habitKeys, goalKeys, gamificationKeys, profileKeys } from '@orbit/shared/query'
import {
  applyLinkedGoalUpdates,
  appendHabitDetailChild,
  buildUnresolvedBulkFailures,
  buildOptimisticSkipPatch,
  findHabitInList,
  normalizeHabits,
  removeHabitDetailChild,
} from '@orbit/shared/utils'
import {
  optimisticPatchHabit,
  optimisticToggleCompletion,
  optimisticUpdateChecklist,
} from '@/lib/habit-optimistic-helpers'
import {
  applyReorderPositions,
  buildOptimisticHabitPatch,
  restoreHabitLists,
  snapshotHabitLists,
  updateHabitLists,
  type HabitListSnapshots,
} from '@/lib/habit-mutation-helpers'
import type {
  HabitScheduleItem,
  HabitDetail,
  HabitFullDetail,
  CreateHabitRequest,
  UpdateHabitRequest,
  ReorderHabitsRequest,
  ChecklistItem,
  CreateSubHabitRequest,
  MoveHabitParentRequest,
  BulkCreateRequest,
  BulkLogItemRequest,
  BulkSkipItemRequest,
  BulkDeleteResponse,
  BulkMutationOutcome,
  BulkLogResult,
  BulkSkipResult,
} from '@orbit/shared/types/habit'
import type { Goal } from '@orbit/shared/types/goal'
import type { Profile } from '@orbit/shared/types/profile'
import type { GamificationProfile } from '@orbit/shared/types/gamification'
import {
  createHabit as createHabitAction,
  updateHabit as updateHabitAction,
  deleteHabit as deleteHabitAction,
  restoreHabit as restoreHabitAction,
  logHabit as logHabitAction,
  skipHabit as skipHabitAction,
  reorderHabits as reorderHabitsAction,
  duplicateHabit as duplicateHabitAction,
  updateChecklist as updateChecklistAction,
  createSubHabit as createSubHabitAction,
  moveHabitParent as moveHabitParentAction,
  bulkCreateHabits as bulkCreateHabitsAction,
  bulkLogHabits as bulkLogHabitsAction,
  bulkSkipHabits as bulkSkipHabitsAction,
} from '@/app/actions/habits'
import { getMilestoneShareStreakKey } from '@orbit/shared/stores'
import { useUIStore } from '@/stores/ui-store'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'
import { useAppToast } from '@/hooks/use-app-toast'
import { useUndoToast } from '@/hooks/use-undo-toast'

let optimisticSubHabitSequence = 0

function createOptimisticSubHabitId(): string {
  optimisticSubHabitSequence += 1
  return `optimistic-sub-habit-${optimisticSubHabitSequence}`
}

function restoreRejectedBulkItems(
  queryClient: ReturnType<typeof useQueryClient>,
  previousLists: HabitListSnapshots,
  results: readonly { habitId: string; status: 'Success' | 'Failed' }[],
): void {
  const rejectedHabitIds = results.flatMap((item) =>
    item.status !== 'Success' ? [item.habitId] : [],
  )

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

export function useLogHabit() {
  const queryClient = useQueryClient()
  const { setStreakCelebration, checkAllDoneCelebration, activeFilters } = useUIStore.getState()

  return useMutation({
    mutationFn: ({
      habitId,
      date,
    }: {
      habitId: string
      date?: string
    }) => logHabitAction(habitId, date ? { date } : undefined),

    onMutate: ({ habitId, date }) => {
      void queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = queryClient.getQueriesData<HabitScheduleItem[]>({
        queryKey: habitKeys.lists(),
      })

      if (!date) {
        queryClient.setQueriesData<HabitScheduleItem[]>(
          { queryKey: habitKeys.lists() },
          (old) => old ? optimisticToggleCompletion(old, habitId) : old,
        )
      }

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          if (data) {
            queryClient.setQueryData(key, data)
          }
        }
      }
    },

    onSuccess: (response, variables) => {
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

    onSettled: (_data, _error, { habitId }) => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.logs(habitId) })
      void queryClient.invalidateQueries({ queryKey: habitKeys.metrics(habitId) })
      /**
       * The mounted summary MUST refetch, so this cannot narrow to `refetchType: 'none'`.
       * `useSummary` sets `refetchOnWindowFocus: false` and a 5 minute `staleTime`, so marking the
       * query stale without refetching leaves the Today Astra card describing the pre-completion
       * state until its next time bucket. The summary is AI-generated text, so it cannot be
       * reconciled locally from the mutation response. One small request per habit log is the
       * correct trade against showing a user their own completion has not happened.
       */
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useSkipHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ habitId, date }: { habitId: string; date?: string }) =>
      skipHabitAction(habitId, date),

    onMutate: async ({ habitId, date }) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = queryClient.getQueriesData<HabitScheduleItem[]>({
        queryKey: habitKeys.lists(),
      })

      if (!date) {
        queryClient.setQueriesData<HabitScheduleItem[]>(
          { queryKey: habitKeys.lists() },
          (old) => {
            if (!old) return old
            const habit = findHabitInList(old, habitId)
            if (!habit) return old
            return optimisticPatchHabit(old, habitId, buildOptimisticSkipPatch(habit))
          },
        )
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

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}

export function useCreateHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateHabitRequest) => createHabitAction(data),

    onSuccess: (result) => {
      useUIStore.getState().setLastCreatedHabitId(result.id)
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useUpdateHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ habitId, data }: { habitId: string; data: UpdateHabitRequest }) =>
      updateHabitAction(habitId, data),

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

    onSettled: (_data, _err, { habitId }) => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.detail(habitId) })
      void queryClient.invalidateQueries({ queryKey: habitKeys.fullDetail(habitId) })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

function invalidateHabitDeleteQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
  void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
}

export function useRestoreHabit() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const { showSuccess, showError } = useAppToast()

  return useMutation({
    mutationFn: (habitId: string) => restoreHabitAction(habitId),

    onSuccess: () => {
      invalidateHabitDeleteQueries(queryClient)
      showSuccess(t('undo.restored'))
    },

    onError: () => {
      showError(t('undo.restoreFailed'))
    },
  })
}

export function useDeleteHabit() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const restoreHabit = useRestoreHabit()
  const showUndoToast = useUndoToast()

  return useMutation({
    mutationFn: (habitId: string) => deleteHabitAction(habitId),

    onMutate: async (habitId) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.details() })
      const previousDetails = queryClient.getQueriesData<HabitDetail>({
        queryKey: habitKeys.details(),
      })
      queryClient.setQueriesData<HabitDetail>(
        { queryKey: habitKeys.details() },
        (detail) => detail ? removeHabitDetailChild(detail, habitId) : detail,
      )
      return { previousDetails }
    },

    onError: (_error, _habitId, context) => {
      for (const [queryKey, detail] of context?.previousDetails ?? []) {
        if (detail) queryClient.setQueryData(queryKey, detail)
      }
    },

    onSuccess: (_data, habitId) => {
      showUndoToast(t('undo.habitDeleted'), () => restoreHabit.mutate(habitId))
    },

    onSettled: () => {
      invalidateHabitDeleteQueries(queryClient)
      void queryClient.invalidateQueries({ queryKey: habitKeys.details() })
    },
  })
}

export function useReorderHabits() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const { showError } = useAppToast()

  return useMutation({
    mutationFn: (data: ReorderHabitsRequest) => reorderHabitsAction(data),

    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = snapshotHabitLists(queryClient)
      updateHabitLists(queryClient, (items) =>
        applyReorderPositions(items, data.positions),
      )

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        restoreHabitLists(queryClient, context.previousLists)
      }
      showError(t('habits.reorderFailed'))
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
    },
  })
}

export function useDuplicateHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (habitId: string) => duplicateHabitAction(habitId),

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useUpdateChecklist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      habitId,
      items,
    }: {
      habitId: string
      items: ChecklistItem[]
    }) => updateChecklistAction(habitId, items),

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

      queryClient.setQueriesData<HabitScheduleItem[]>(
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
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.detail(habitId) })
      void queryClient.invalidateQueries({ queryKey: habitKeys.fullDetail(habitId) })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useCreateSubHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      parentId,
      data,
    }: {
      parentId: string
      data: CreateSubHabitRequest
    }) => createSubHabitAction(parentId, data),

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
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.detail(parentId) })
    },
  })
}

export function useMoveHabitParent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      habitId,
      data,
    }: {
      habitId: string
      data: MoveHabitParentRequest
    }) => moveHabitParentAction(habitId, data),

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useBulkCreateHabits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: BulkCreateRequest) => bulkCreateHabitsAction(data),

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useBulkDeleteHabits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (habitIds: string[]): Promise<BulkMutationOutcome<BulkDeleteResponse>> => {
      const results: BulkDeleteResponse['results'] = []
      const ambiguousIds: string[] = []
      for (let index = 0; index < habitIds.length; index += 4) {
        const chunk = habitIds.slice(index, index + 4)
        const outcomes = await Promise.allSettled(chunk.map((habitId) => deleteHabitAction(habitId)))
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

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    },
  })
}

export function useBulkLogHabits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (items: BulkLogItemRequest[]): Promise<BulkLogResult> => {
      const results: BulkLogResult['results'] = []
      for (let index = 0; index < items.length; index += 100) {
        try {
          const response = await bulkLogHabitsAction(items.slice(index, index + 100))
          results.push(...response.results.map((result) => ({ ...result, index: result.index + index })))
        } catch (error) {
          results.push(...buildUnresolvedBulkFailures(
            items.slice(index),
            index,
            error,
            (item, failureIndex, message) => ({
              index: failureIndex,
              status: 'Failed' as const,
              habitId: item.habitId,
              logId: null,
              error: message,
            }),
          ))
          break
        }
      }
      return { results }
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

    onError: (_error, _items, context) => {
      if (context?.previousLists) restoreHabitLists(queryClient, context.previousLists)
    },

    onSuccess: (result, _items, context) => {
      restoreRejectedBulkItems(queryClient, context.previousLists, result.results)
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
    },
  })
}

export function useBulkSkipHabits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (items: BulkSkipItemRequest[]): Promise<BulkMutationOutcome<BulkSkipResult>> => {
      const results: BulkSkipResult['results'] = []
      const ambiguousIds: string[] = []
      for (let index = 0; index < items.length; index += 100) {
        const chunk = items.slice(index, index + 100)
        try {
          const response = await bulkSkipHabitsAction(chunk)
          results.push(...response.results.map((result) => ({ ...result, index: result.index + index })))
        } catch {
          ambiguousIds.push(...chunk.map((item) => item.habitId))
        }
      }
      return { results, ambiguousIds }
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

    onError: (_error, _items, context) => {
      if (context?.previousLists) restoreHabitLists(queryClient, context.previousLists)
    },

    onSuccess: (result, _items, context) => {
      restoreRejectedBulkItems(queryClient, context.previousLists, result.results)
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}
