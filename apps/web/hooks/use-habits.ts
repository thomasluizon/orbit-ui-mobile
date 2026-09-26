'use client'

import type { HabitListKey } from '@orbit/shared/query'

import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { habitKeys, goalKeys, gamificationKeys, profileKeys, updateHabitListsForDate, invalidateHabitDependents } from '@orbit/shared/query'
import { isStreakCelebrationMilestone } from '@orbit/shared/stores'
import {
  applyLinkedGoalUpdates,
  appendHabitDetailChild,
  buildUnresolvedBulkFailures,
  buildOptimisticSkipPatch,
  findHabitInList,
  formatAPIDate,
  normalizeHabits,
  plural,
  optimisticRemoveHabits,
  optimisticSetCalendarHabitLog,
  removeHabitDetailChild,
  rollbackOptimisticCalendarHabitLog,
  getFriendlyErrorMessage,
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
  HabitScheduleChild,
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
  CalendarMonthResponse,
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
} from '@/lib/actions/habits'
import { getMilestoneShareStreakKey } from '@orbit/shared/stores'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { reportsAccountChanged } from '@/app/actions/action-result'
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

  return useAccountScopedMutation({
    mutationFn: ({
      habitId,
      date,
    }: {
      habitId: string
      date?: string
      intent: 'log' | 'unlog'
    }, intendedAccountId) => logHabitAction(habitId, date ? { date } : undefined, intendedAccountId),

    onMutate: ({ habitId, date, intent }) => {
      void queryClient.cancelQueries({ queryKey: habitKeys.lists() })
      if (date) void queryClient.cancelQueries({ queryKey: habitKeys.calendarPrefix() })

      const previousLists = queryClient.getQueriesData<HabitScheduleItem[]>({
        queryKey: habitKeys.lists(),
      })
      const previousCalendars = date
        ? queryClient.getQueriesData<CalendarMonthResponse>({
            queryKey: habitKeys.calendarPrefix(),
          })
        : []

      if (date) {
        const completed = intent === 'log'
        const optimisticLogId = `optimistic-log:${habitId}:${date}`
        const createdAtUtc = new Date().toISOString()
        queryClient.setQueriesData<CalendarMonthResponse>(
          { queryKey: habitKeys.calendarPrefix() },
          (old) => old
            ? optimisticSetCalendarHabitLog(
                old,
                habitId,
                date,
                completed,
                optimisticLogId,
                createdAtUtc,
              )
            : old,
        )
      } else {
        updateHabitListsForDate(queryClient, formatAPIDate(new Date()),
          (items) => optimisticToggleCompletion(items, habitId))
      }

      return { previousLists, previousCalendars }
    },

    onError: (_err, variables, context) => {
      if (!variables.date && context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          if (data) {
            queryClient.setQueryData(key, data)
          }
        }
      }
      if (!variables.date) return

      const date = variables.date
      const optimisticLogId = `optimistic-log:${variables.habitId}:${date}`
      for (const [key, previousCalendar] of context?.previousCalendars ?? []) {
        if (!previousCalendar) continue
        queryClient.setQueryData<CalendarMonthResponse>(key, (currentCalendar) =>
          currentCalendar
            ? rollbackOptimisticCalendarHabitLog(
                currentCalendar,
                previousCalendar,
                variables.habitId,
                date,
                optimisticLogId,
              )
            : currentCalendar)
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
       */
      const countsTowardStreak = loggedHabit !== null && !loggedHabit.isBadHabit

      const startsStreak = countsTowardStreak
        && response.isFirstCompletionToday
        && response.currentStreak > 0
      if (startsStreak && isStreakCelebrationMilestone(response.currentStreak)) {
        setStreakCelebration({ streak: response.currentStreak })
      }
      if (startsStreak) {
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
       * requirement. The habit kind cannot change the answer here, so it is not consulted.
       */
      if (response.xpEarned || response.newAchievementIds?.length) {
        queryClient.setQueryData<GamificationProfile>(gamificationKeys.profile(), (old) => {
          if (!old) return old
          return { ...old, totalXp: old.totalXp + (response.xpEarned ?? 0) }
        })
      }

      void queryClient.invalidateQueries({ queryKey: profileKeys.all })

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

    onSettled: (_data, error, { habitId }) => {
      if (error) return
      invalidateHabitDependents(queryClient, habitId)
    },
  })
}

export function useSkipHabit() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: ({ habitId, date }: { habitId: string; date?: string }, intendedAccountId) =>
      skipHabitAction(habitId, date, intendedAccountId),

    onMutate: async ({ habitId, date }) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = queryClient.getQueriesData<HabitScheduleItem[]>({
        queryKey: habitKeys.lists(),
      })

      if (!date) {
        updateHabitListsForDate(queryClient, formatAPIDate(new Date()), (items) => {
          const habit = findHabitInList(items, habitId)
          return habit ? optimisticPatchHabit(items, habitId, buildOptimisticSkipPatch(habit)) : items
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

    onSettled: (_data, error, { habitId }) => {
      if (error) return
      invalidateHabitDependents(queryClient, habitId)
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
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
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.searches() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useUpdateHabit() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: ({ habitId, data }: { habitId: string; data: UpdateHabitRequest }, intendedAccountId) =>
      updateHabitAction(habitId, data, intendedAccountId),

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

    onSettled: (_data, error, { habitId }) => {
      if (error) return
      invalidateHabitDependents(queryClient, habitId)
      void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}

function invalidateHabitDeleteQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.searches() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
  void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
  void queryClient.invalidateQueries({ queryKey: profileKeys.all })
}

export function useRestoreHabit() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const { showSuccess, showError } = useAppToast()

  return useAccountScopedMutation({
    mutationFn: (habitId: string, intendedAccountId) =>
      restoreHabitAction(habitId, intendedAccountId),

    onSuccess: () => {
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
      deleteHabitAction(habitId, intendedAccountId),

    onMutate: async (habitId) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: habitKeys.details() }),
        queryClient.cancelQueries({ queryKey: habitKeys.lists() }),
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
      return { previousLists, previousDetails }
    },

    onError: (_error, _habitId, context) => {
      if (context?.previousLists) restoreHabitLists(queryClient, context.previousLists)
      for (const [queryKey, detail] of context?.previousDetails ?? []) {
        if (detail) queryClient.setQueryData(queryKey, detail)
      }
    },

    onSuccess: (_data, habitId) => {
      showUndoToast(t('undo.habitDeleted'), () => restoreHabit.mutate(habitId))
    },

    onSettled: (_response, error, habitId) => {
      if (error) return
      invalidateHabitDependents(queryClient, habitId)
      void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
      void queryClient.invalidateQueries({ queryKey: habitKeys.details() })
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
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.searches() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
    },
  })
}

export function useDuplicateHabit() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: (habitId: string, intendedAccountId) =>
      duplicateHabitAction(habitId, intendedAccountId),

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.searches() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
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
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.searches() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.detail(habitId) })
      void queryClient.invalidateQueries({ queryKey: habitKeys.fullDetail(habitId) })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
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
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.searches() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
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
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.searches() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useBulkCreateHabits() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: (data: BulkCreateRequest, intendedAccountId) =>
      bulkCreateHabitsAction(data, intendedAccountId),

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.searches() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

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
      const results: BulkDeleteResponse['results'] = []
      const ambiguousIds: string[] = []
      for (let index = 0; index < habitIds.length; index += 4) {
        const chunk = habitIds.slice(index, index + 4)
        const outcomes = await Promise.allSettled(
          chunk.map((habitId) => deleteHabitAction(habitId, intendedAccountId)),
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

    onMutate: () => ({ previousLists: snapshotHabitLists(queryClient) }),

    onSuccess: (result, _habitIds, context) => {
      const deleted = result.results.filter((item) => item.status === 'Success')
      if (deleted.length === 0) return
      const selectedIds = new Set(deleted.map((item) => item.habitId))
      const selectedDescendants = selectedDescendantsInSnapshots(context.previousLists, selectedIds)
      const restoreIds = deleted.map((item) => item.habitId)
        .filter((id) => !selectedDescendants.has(id))
      const message = plural(t('undo.habitsDeleted', { count: deleted.length }), deleted.length)
      showUndoToast(message, () => {
        for (const habitId of restoreIds) restoreHabit.mutate(habitId)
      })
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.searches() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}

export function useBulkLogHabits() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: async (items: BulkLogItemRequest[], intendedAccountId): Promise<BulkLogResult> => {
      const results: BulkLogResult['results'] = []
      for (let index = 0; index < items.length; index += 100) {
        try {
          const response = await bulkLogHabitsAction(
            items.slice(index, index + 100),
            intendedAccountId,
          )
          results.push(...response.results.map((result) => ({ ...result, index: result.index + index })))
        } catch (error) {
          if (reportsAccountChanged(error)) throw error
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
      if (result.results.some((item) => item.status === 'Success')) {
        void queryClient.invalidateQueries({ queryKey: profileKeys.all })
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.searches() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
    },
  })
}

export function useBulkSkipHabits() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: async (
      items: BulkSkipItemRequest[],
      intendedAccountId,
    ): Promise<BulkMutationOutcome<BulkSkipResult>> => {
      const results: BulkSkipResult['results'] = []
      const ambiguousIds: string[] = []
      for (let index = 0; index < items.length; index += 100) {
        const chunk = items.slice(index, index + 100)
        try {
          const response = await bulkSkipHabitsAction(chunk, intendedAccountId)
          results.push(...response.results.map((result) => ({ ...result, index: result.index + index })))
        } catch (error) {
          if (reportsAccountChanged(error)) throw error
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
      void queryClient.invalidateQueries({ queryKey: habitKeys.searches() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}
