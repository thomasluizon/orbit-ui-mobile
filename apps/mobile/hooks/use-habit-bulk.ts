import { withAccountGuard, type HabitAccount } from './use-habit-mutation-shared'
import type { UseMutationOptions } from '@tanstack/react-query'


import type { ParentPromptContinuation } from '@orbit/shared/types/sync'
import { checkCompletionAfterSkip, settleBulkSkippedHabits } from '@orbit/shared/query/skip-completion'
import type { HabitListSnapshots } from '@orbit/shared/query'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cachedHabitDeletionIds, isCachedHabitDeleted, removeDeletedHabitQueries, invalidateDerivedHabitLogQueries, habitKeys, invalidateBulkMoveParentQueries, profileKeys, applyCachedHabitSkip, getTodayHabitList } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { buildSuccessfulLogPatch, deriveBulkLogStreakTransition, findHabitInList, getAccountDay, normalizeHabits, buildChildrenIndex, plural } from '@orbit/shared/utils'
import type { HabitScheduleItem, HabitScheduleChild, BulkCreateRequest, BulkCreateResponse, BulkDeleteResponse, BulkLogItemRequest, BulkLogResult, BulkSkipItemRequest, BulkSkipResult, BulkMoveHabitParentRequest, BulkMoveHabitParentResult } from '@orbit/shared/types/habit'
import type { Profile } from '@orbit/shared/types/profile'
import { cancelQueuedDeleteForUndo, createQueuedAck, createTempEntityId, isQueuedResult, OfflineMutationPreflightError, type QueuedMarker } from '@/lib/offline-mutations'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { optimisticInsertHabit, optimisticPatchHabit, optimisticRemoveHabits, restoreDeletedHabits } from '@/lib/habit-optimistic-helpers'
import { buildOptimisticHabit, finalizeHabitMutation, restoreHabitCompletionForIds, restoreHabitLists, snapshotHabitLists, updateHabitLists, updateHabitListsForDate } from '@/lib/habit-mutation-helpers'
import { useReviewReminderStore } from '@/stores/review-reminder-store'
import { useUIStore } from '@/stores/ui-store'
import { useOfflineSyncStore } from '@/stores/offline-sync-store'
import { useTranslation } from 'react-i18next'
import { useUndoToast } from '@/hooks/use-undo-toast'
import { apiClient } from '@/lib/api-client'
import { useRestoreHabit } from './use-habit-structure'
import { resolveHabitLogDate } from './use-habit-mutation-shared'

type BulkCreateHabitMutationInput = BulkCreateRequest & { __offlineTempIds?: string[] }

type OfflineBulkMutationOutcome<TResponse> = TResponse & {
  ambiguousIds: string[]
  offlineFailureIds: string[]
}

type BulkLogMutationOutcome = OfflineBulkMutationOutcome<BulkLogResult> & {
  streakResponses: BulkLogResult[]
  hasConfirmedSuccess: boolean
  queuedIds: string[]
}

type BulkSkipMutationOutcome = OfflineBulkMutationOutcome<BulkSkipResult> & {
  queuedIds: string[]
}

type BulkDeleteMutationOutcome = OfflineBulkMutationOutcome<BulkDeleteResponse> & {
  queuedDeletes: { habitId: string; mutationId: string }[]
}

const bulkDeleteConnectionRequirements = new WeakMap<string[], boolean>()

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

function selectionRequiresCascadeDelete(snapshots: HabitListSnapshots, habitIds: string[]): boolean {
  return habitIds.some((habitId) => {
    const matches = snapshots.flatMap(([, habits]) => {
      const habit = habits && findHabitInList(habits, habitId)
      return habit ? [habit] : []
    })
    return matches.length === 0 || matches.some((habit) => habit.hasSubHabits || habit.children.length > 0)
  })
}

function checkTodayCompletionAfterLogs(
  queryClient: ReturnType<typeof useQueryClient>,
  habitIds: string[],
  today: string,
  checkAllDoneCelebration: ReturnType<typeof useUIStore.getState>['checkAllDoneCelebration'],
): void {
  updateHabitListsForDate(queryClient, today, (habits) =>
    habitIds.reduce((current, id) => {
      const habit = findHabitInList(current, id)
      return habit ? optimisticPatchHabit(current, id, buildSuccessfulLogPatch(habit)) : current
    }, habits))
  const habitsData = getTodayHabitList(queryClient, today)
  if (!habitsData) return
  const normalized = normalizeHabits(habitsData)
  checkAllDoneCelebration(normalized, buildChildrenIndex(normalized), today)
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
          relativeReminders: habit.relativeReminders ?? undefined,
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

      return { previousLists, createdCount: optimisticHabits.length }
    },

    onError: (_err, _vars, context) => {
      if (!context) return
      restoreHabitLists(queryClient, context.previousLists)
    },

    onSettled: (data, error) =>
      finalizeHabitMutation(queryClient, data, error, { includeCount: true }),
  })
}

export function useBulkDeleteHabits() {
  const context = useBulkDeleteHabitsContext()
  const { queryClient } = context
  return useMutation<
    BulkDeleteMutationOutcome,
    Error,
    string[],
    { previousLists: HabitListSnapshots }
  >({
    mutationFn: createBulkDeleteHabitsMutationFn(context),

    onMutate: async (habitIds) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.all })

      const previousLists = snapshotHabitLists(queryClient)
      bulkDeleteConnectionRequirements.set(habitIds, selectionRequiresCascadeDelete(previousLists, habitIds))
      updateHabitLists(queryClient, (items) => optimisticRemoveHabits(items, habitIds))

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (!context) return
      restoreHabitLists(queryClient, context.previousLists)
    },

    onSuccess: createBulkDeleteHabitsOnSuccess(context),

    onSettled: (data, error) =>
      finalizeHabitMutation(queryClient, data, error, {
        includeGoals: true,
        includeCount: true,
        includeProfile: true,
      }),
  })
}

type ParentPromptBulkInput<T> = T[] | { items: T[]; parentPromptContinuation: ParentPromptContinuation }

function normalizeParentPromptBulkInput<T>(input: ParentPromptBulkInput<T>): { items: T[]; parentPromptContinuation?: ParentPromptContinuation } {
  return Array.isArray(input) ? { items: input } : input
}

export function useBulkLogHabits(options: { suppressParentSettlement?: boolean } = {}) {
  const context = useBulkLogHabitsContext(options)
  const { queryClient } = context
  return useMutation<
    BulkLogMutationOutcome,
    Error,
    ParentPromptBulkInput<BulkLogItemRequest>,
    { previousLists: HabitListSnapshots; occurrenceDate: string; account: HabitAccount }
  >({
    mutationFn: createBulkLogHabitsMutationFn(context),

    onMutate: async (input) => {
      const { items } = normalizeParentPromptBulkInput(input)
      const occurrenceDate = getAccountDay(new Date(), queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone)
      return withAccountGuard(async (guardedAccount) => {
        const account = guardedAccount

        await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

        account.assertCurrent()
        const previousLists = snapshotHabitLists(queryClient)
        const completedIds = items.map((item) => item.habitId)

        updateHabitLists(queryClient, (currentItems) =>
          completedIds.reduce(
            (nextItems, habitId) => optimisticPatchHabit(nextItems, habitId, { isCompleted: true }),
            currentItems,
          ),
        )

        return { previousLists, account, occurrenceDate }

      })
    },

    onError: (_err, _vars, context) => {
      if (context && !context.account.stillCurrent()) return
      if (context?.previousLists) {
        restoreHabitLists(queryClient, context.previousLists)
      }
    },

    onSuccess: createBulkLogHabitsOnSuccess(context),

    onSettled: (data, error, _input, context) => {
      if (context && !context.account.stillCurrent()) return
      if (data?.hasConfirmedSuccess) invalidateDerivedHabitLogQueries(queryClient)
      finalizeHabitMutation(queryClient, data, error, {
        includeGoals: true,
        includeGamification: true,
      })
    },
  })
}

export function useBulkSkipHabits(options: { suppressParentSettlement?: boolean } = {}) {
  const queryClient = useQueryClient()

  return useMutation<
    BulkSkipMutationOutcome,
    Error,
    ParentPromptBulkInput<BulkSkipItemRequest>,
    { previousLists: HabitListSnapshots; occurrenceDate: string; account: HabitAccount }
  >({
    mutationFn: async (input) => {
      const { items, parentPromptContinuation } = normalizeParentPromptBulkInput(input)
      const results: BulkSkipResult['results'] = []
      const ambiguousIds: string[] = []
      const offlineFailureIds: string[] = []
      const queuedIds: string[] = []
      for (let index = 0;index < items.length;index += 100) {
        const chunk = items.slice(index, index + 100)
        try {
          const response = await performQueuedApiMutation<BulkSkipResult, BulkSkipResult & QueuedMarker>({
            type: 'bulkSkipHabits',
            scope: 'habits',
            suppressParentSettlement: options.suppressParentSettlement,
            parentPromptContinuation,
            endpoint: API.habits.bulkSkip,
            method: 'POST',
            payload: { items: chunk },
            queuedResultFactory: (mutationId) => ({
              results: chunk.map((item, itemIndex) => ({
                index: itemIndex,
                status: 'Success' as const,
                habitId: item.habitId,
                error: null,
              })),
              queued: true as const,
              queuedMutationId: mutationId,
            }),
          })
          if (isQueuedResult(response)) queuedIds.push(...chunk.map((item) => item.habitId))
          results.push(...response.results.map((result) => ({ ...result, index: result.index + index })))
        } catch (error: unknown) {
          const failedIds = chunk.map((item) => item.habitId)
          if (error instanceof OfflineMutationPreflightError) {
            offlineFailureIds.push(...failedIds)
          } else {
            ambiguousIds.push(...failedIds)
          }
        }
      }
      return { results, ambiguousIds, offlineFailureIds, queuedIds }
    },

    onMutate: async (input) => {
      const { items } = normalizeParentPromptBulkInput(input)
      return withAccountGuard(async (guardedAccount) => {
        const account = guardedAccount
        await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

        account.assertCurrent()
        const previousLists = snapshotHabitLists(queryClient)
        const occurrenceDate = getAccountDay(new Date(), queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone)
        for (const item of items) applyCachedHabitSkip(queryClient, item.habitId, item.date ?? occurrenceDate)

        return { previousLists, occurrenceDate, account }

      })
    },

    onError: (_err, _vars, context) => {
      if (context && !context.account.stillCurrent()) return
      if (context?.previousLists) {
        restoreHabitLists(queryClient, context.previousLists)
      }
    },

    onSuccess: (data, input, context) => {
      if (!context.account.stillCurrent()) return
      const { items } = normalizeParentPromptBulkInput(input)
      const acceptedIds = new Set(data.results.filter((entry) => entry.status === 'Success').map((entry) => entry.habitId))
      const failedIds = new Set(items.filter((item) => !acceptedIds.has(item.habitId)).map((item) => item.habitId))
      for (const habitId of data.offlineFailureIds) failedIds.add(habitId)
      for (const habitId of data.ambiguousIds) failedIds.add(habitId)
      for (const habitId of data.queuedIds) failedIds.add(habitId)
      const confirmed = settleBulkSkippedHabits(queryClient, items, context.previousLists, failedIds, context.occurrenceDate)
      checkCompletionAfterSkip(queryClient, confirmed, queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone,
        useUIStore.getState().checkAllDoneCelebration, context.previousLists)
    },

    onSettled: (data, error, _items, context) => {
      if (context && !context.account.stillCurrent()) return
      finalizeHabitMutation(queryClient, data, error, { includeProfile: true })
    },
  })
}

export function useBulkMoveHabitParent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: BulkMoveHabitParentRequest) =>
      performQueuedApiMutation<BulkMoveHabitParentResult, never>({
        type: 'bulkMoveHabitParent',
        scope: 'habits',
        endpoint: API.habits.bulkParent,
        method: 'POST',
        payload: input,
        entityType: 'habit',
        dependsOn: [...input.habitIds, ...(input.parentId ? [input.parentId] : [])],
      }),
    onSuccess: () => invalidateBulkMoveParentQueries(queryClient),
  })
}

function useBulkDeleteHabitsContext() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const restoreHabit = useRestoreHabit()
  const showUndoToast = useUndoToast()
  return { queryClient, t, restoreHabit, showUndoToast }
}

type BulkDeleteOptions = UseMutationOptions<BulkDeleteMutationOutcome, Error, string[], { previousLists: HabitListSnapshots }>

function createBulkDeleteHabitsMutationFn(context: ReturnType<typeof useBulkDeleteHabitsContext>) {
  const { queryClient } = context
  const callback: NonNullable<BulkDeleteOptions['mutationFn']> = async (habitIds) => {
    return withAccountGuard(async (guardedAccount) => {
      const account = guardedAccount
      const requiresConnection = bulkDeleteConnectionRequirements.get(habitIds) ?? true
      bulkDeleteConnectionRequirements.delete(habitIds)
      const results: BulkDeleteResponse['results'] = []
      const ambiguousIds: string[] = []
      const offlineFailureIds: string[] = []
      const queuedDeletes: BulkDeleteMutationOutcome['queuedDeletes'] = []
      for (let index = 0;index < habitIds.length;index += 4) {
        const chunk = habitIds.slice(index, index + 4)
        const outcomes = await Promise.allSettled(chunk.map(async (habitId) => {
          if (isCachedHabitDeleted(queryClient, habitId)) return
          const result = await performQueuedApiMutation<void>({
            type: requiresConnection ? 'bulkCascadeDeleteHabits' : 'deleteHabit',
            scope: 'habits',
            endpoint: API.habits.delete(habitId),
            method: 'DELETE',
            payload: requiresConnection ? null : { queuedAsChildless: true },
            entityType: 'habit',
            targetEntityId: habitId,
            execute: (mutation) => apiClient<void>(mutation.endpoint, {
              method: 'DELETE', idempotencyKey: mutation.id,
            }),
          })
          if (account.stillCurrent() && !isQueuedResult(result)) await removeDeletedHabitQueries(queryClient, habitId)
          return result
        }))
        outcomes.forEach((outcome, itemIndex) => {
          const habitId = chunk[itemIndex]
          if (!habitId) return
          if (outcome.status === 'rejected') {
            if (outcome.reason instanceof OfflineMutationPreflightError) {
              offlineFailureIds.push(habitId)
            } else {
              ambiguousIds.push(habitId)
            }
            return
          }
          if (isQueuedResult(outcome.value)) {
            queuedDeletes.push({ habitId, mutationId: outcome.value.queuedMutationId })
          }
          results.push({
            index: index + itemIndex,
            status: 'Success',
            habitId,
            error: null,
          })
        })
      }
      const queuedDelete = queuedDeletes[0]
      return {
        results, ambiguousIds, offlineFailureIds, queuedDeletes,
        ...(queuedDelete ? createQueuedAck(queuedDelete.mutationId) : {}),
      }

    })
  }
  return callback
}

function createBulkDeleteHabitsOnSuccess(context: ReturnType<typeof useBulkDeleteHabitsContext>) {
  const { queryClient, t, restoreHabit, showUndoToast } = context
  const callback: NonNullable<BulkDeleteOptions['onSuccess']> = async (result, _vars, context) => {
    const queuedIds = new Set(result.queuedDeletes.map((item) => item.habitId))
    for (const item of result.results) {
      if (item.status === 'Success' && !queuedIds.has(item.habitId)) {
        await removeDeletedHabitQueries(queryClient, item.habitId, cachedHabitDeletionIds(queryClient, [item.habitId], context.previousLists.flatMap(([, items]) => items ?? [])))
      }
    }
    const failedIds = new Set(
      result.results.flatMap((item) => item.status === 'Failed' ? [item.habitId] : []),
    )
    for (const habitId of result.offlineFailureIds) failedIds.add(habitId)
    if (failedIds.size > 0) {
      for (const [key, snapshot] of context.previousLists) {
        if (!snapshot) continue
        queryClient.setQueryData<HabitScheduleItem[]>(key, (current) =>
          current ? restoreDeletedHabits(current, snapshot, failedIds) : current,
        )
      }
    }
    const deleted = result.results.filter((item) => item.status === 'Success')
    if (deleted.length === 0) return
    const message = plural(t('undo.habitsDeleted', { count: deleted.length }), deleted.length)
    showUndoToast(message, () => {
      void (async () => {
        const queuedByHabit = new Map(result.queuedDeletes.map(({ habitId, mutationId }) => [habitId, mutationId]))
        const locallyRestored = new Set<string>()
        const serverRestoreIds = new Set<string>()
        const droppedRestoreIds = new Set<string>()
        await Promise.all(deleted.map(async (item) => {
          const mutationId = queuedByHabit.get(item.habitId)
          if (!mutationId) {
            serverRestoreIds.add(item.habitId)
            return
          }
          const outcome = await cancelQueuedDeleteForUndo(mutationId)
          if (outcome !== 'replayed') locallyRestored.add(item.habitId)
          if (outcome === 'dropped') {
            useOfflineSyncStore.getState().dismissDrop(mutationId)
            droppedRestoreIds.add(item.habitId)
            serverRestoreIds.add(item.habitId)
          }
          if (outcome === 'replayed' || outcome === 'uncertain') serverRestoreIds.add(item.habitId)
        }))
        for (const [key, snapshot] of context.previousLists) {
          if (!snapshot || locallyRestored.size === 0) continue
          queryClient.setQueryData<HabitScheduleItem[]>(key, (current) =>
            current ? restoreDeletedHabits(current, snapshot, locallyRestored) : current,
          )
        }
        if (locallyRestored.size > 0) {
          void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
          void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
        }
        const selectedDescendants = selectedDescendantsInSnapshots(context.previousLists, serverRestoreIds)
        for (const habitId of serverRestoreIds) {
          if (!selectedDescendants.has(habitId)) {
            restoreHabit.mutate(droppedRestoreIds.has(habitId)
              ? { habitId, reconcileNotFound: true }
              : habitId)
          }
        }
      })()
    })
  }
  return callback
}

function useBulkLogHabitsContext(options: { suppressParentSettlement?: boolean }) {
  const queryClient = useQueryClient()
  const { checkAllDoneCelebration, showStreakMoment } = useUIStore.getState()
  return { queryClient, checkAllDoneCelebration, showStreakMoment, options }
}

type BulkLogOptions = UseMutationOptions<BulkLogMutationOutcome, Error, ParentPromptBulkInput<BulkLogItemRequest>, { previousLists: HabitListSnapshots; occurrenceDate: string; account: HabitAccount }>

function createBulkLogHabitsMutationFn(context: ReturnType<typeof useBulkLogHabitsContext>) {
  const { queryClient, options } = context
  const callback: NonNullable<BulkLogOptions['mutationFn']> = async (input) => {
    return withAccountGuard(async (guardedAccount) => {
      const account = guardedAccount
      const { items: requestedItems, parentPromptContinuation } = normalizeParentPromptBulkInput(input)
      const occurrenceDate = requestedItems.some((item) => item.date === undefined)
        ? await resolveHabitLogDate(queryClient, new Date(), account) : undefined
      account.assertCurrent()
      const items = requestedItems.map((item) => item.date === undefined && occurrenceDate
        ? { ...item, date: occurrenceDate } : item)
      const results: BulkLogResult['results'] = []
      const streakResponses: BulkLogResult[] = []
      const ambiguousIds: string[] = []
      const offlineFailureIds: string[] = []
      const queuedIds: string[] = []
      let hasConfirmedSuccess = false
      for (let index = 0;index < items.length;index += 100) {
        const chunk = items.slice(index, index + 100)
        try {
          const response = await performQueuedApiMutation<BulkLogResult, BulkLogResult & QueuedMarker>({
            isCurrent: account.stillCurrent,
            type: 'bulkLogHabits',
            scope: 'habits',
            suppressParentSettlement: options.suppressParentSettlement,
            parentPromptContinuation,
            endpoint: API.habits.bulkLog,
            method: 'POST',
            payload: { items: chunk },
            queuedResultFactory: (mutationId) => ({
              results: chunk.map((item, itemIndex) => ({
                index: itemIndex,
                status: 'Success' as const,
                habitId: item.habitId,
                logId: null,
                error: null,
              })),
              queued: true as const,
              queuedMutationId: mutationId,
            }),
          })
          if (isQueuedResult(response)) queuedIds.push(...chunk.map((item) => item.habitId))
          if (!isQueuedResult(response) && response.results.some((result) => result.status === 'Success')) {
            hasConfirmedSuccess = true
          }
          const chunkResponse = { ...response, results: response.results.map((result) => ({ ...result, index: result.index + index })) }
          if (!isQueuedResult(response)) streakResponses.push(chunkResponse)
          results.push(...chunkResponse.results)
        } catch (error: unknown) {
          const failures = error instanceof OfflineMutationPreflightError ? offlineFailureIds : ambiguousIds
          failures.push(...chunk.map((item) => item.habitId))
        }
      }
      return { results, streakResponses, ambiguousIds, offlineFailureIds, hasConfirmedSuccess, queuedIds }

    })
  }
  return callback
}

function createBulkLogHabitsOnSuccess(context: ReturnType<typeof useBulkLogHabitsContext>) {
  const { queryClient, checkAllDoneCelebration, showStreakMoment } = context
  const callback: NonNullable<BulkLogOptions['onSuccess']> = (data, input, context) => {
    if (!context.account.stillCurrent()) return
    const { items: variables } = normalizeParentPromptBulkInput(input)
    const profileRefresh = data.hasConfirmedSuccess
      ? queryClient.invalidateQueries({ queryKey: profileKeys.all }) : null
    const failedIds = new Set(
      data.results.flatMap((result) => result.status === 'Failed' ? [result.habitId] : []),
    )
    for (const habitId of data.offlineFailureIds) failedIds.add(habitId)
    for (const habitId of data.ambiguousIds) failedIds.add(habitId)
    for (const habitId of data.queuedIds) failedIds.add(habitId)
    restoreHabitCompletionForIds(queryClient, context.previousLists, failedIds)

    for (const result of data.results) {
      if (result.status !== 'Success') continue
      if (data.queuedIds.includes(result.habitId)) continue
      const item = variables[result.index]
      if (!item) continue
      useReviewReminderStore
        .getState()
        .trackCompletion(item.date ?? context.occurrenceDate)
    }
    const today = getAccountDay(new Date(), queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone)
    const successfulEntries = data.results.filter((entry) => {
      const item = variables[entry.index]
      return entry.status === 'Success' && !data.queuedIds.includes(entry.habitId) &&
        item?.habitId === entry.habitId && (item.date ?? context.occurrenceDate) === today
    })
    const successfulIds = successfulEntries.map((entry) => entry.habitId)
    if (successfulIds.length === 0) return
    return profileRefresh?.then(() => {
      const profile = queryClient.getQueryData<Profile>(profileKeys.detail())
      if (!profile || !context.account.stillCurrent() || today !== getAccountDay(new Date(), profile.timeZone)) return
      const { previousStreak, currentStreak, countsTowardStreak } = deriveBulkLogStreakTransition(
        data.streakResponses,
        successfulEntries,
        context.previousLists.flatMap(([, habits]) => habits ?? []),
      )
      if (currentStreak !== undefined) showStreakMoment(currentStreak, previousStreak, { date: today, timeZone: profile.timeZone, intent: 'log', countsTowardStreak })
      checkTodayCompletionAfterLogs(queryClient, successfulIds, today,
        (habits, children, date) => checkAllDoneCelebration(habits, children, date, profile.timeZone))
    })
  }
  return callback
}
