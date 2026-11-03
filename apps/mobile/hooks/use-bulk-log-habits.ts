import { type HabitAccount,withAccountGuard } from './use-habit-mutation-shared'
import type { UseMutationOptions } from '@tanstack/react-query'
import type { ParentPromptContinuation } from '@orbit/shared/types/sync'
import type { HabitListSnapshots } from '@orbit/shared/query'
import { useQueryClient } from '@tanstack/react-query'
import { useHabitMutation } from './use-habit-mutation'
import { profileKeys,habitKeys,getTodayHabitList,invalidateDerivedHabitLogQueries } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { getAccountDay,deriveBulkLogStreakTransition,findHabitInList,buildSuccessfulLogPatch,normalizeHabits,buildChildrenIndex } from '@orbit/shared/utils'
import type { BulkLogResult,BulkLogItemRequest } from '@orbit/shared/types/habit'
import type { Profile } from '@orbit/shared/types/profile'
import { type QueuedMarker,isQueuedResult,OfflineMutationPreflightError } from '@/lib/offline-mutations'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { optimisticPatchHabit } from '@/lib/habit-optimistic-helpers'
import { snapshotHabitLists,updateHabitLists,restoreHabitLists,restoreHabitCompletionForIds,updateHabitListsForDate,finalizeHabitMutation } from '@/lib/habit-mutation-helpers'
import { useReviewReminderStore } from '@/stores/review-reminder-store'
import { useUIStore } from '@/stores/ui-store'
import { resolveHabitLogDate } from './use-habit-mutation-shared'

type OfflineBulkMutationOutcome<TResponse> = TResponse & {
  ambiguousIds: string[]
  offlineFailureIds: string[]
}

type BulkLogMutationOutcome = OfflineBulkMutationOutcome<BulkLogResult> & {
  streakResponses: BulkLogResult[]
  hasConfirmedSuccess: boolean
  queuedIds: string[]
}

function recordBulkFailure(
  error: unknown,
  habitIds: string[],
  failures: { ambiguousIds: string[]; offlineFailureIds: string[] },
): void {
  const rejectedIds = error instanceof OfflineMutationPreflightError ? failures.offlineFailureIds : failures.ambiguousIds
  rejectedIds.push(...habitIds)
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

type ParentPromptBulkInput<T> = T[] | { items: T[]; parentPromptContinuation: ParentPromptContinuation }

function normalizeParentPromptBulkInput<T>(input: ParentPromptBulkInput<T>): { items: T[]; parentPromptContinuation?: ParentPromptContinuation } {
  return Array.isArray(input) ? { items: input } : input
}

export function useBulkLogHabits(options: { suppressParentSettlement?: boolean } = {}) {
  const context = useBulkLogHabitsContext(options)
  const { queryClient } = context
  return useHabitMutation<
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
        if (!account.stillCurrent()) break
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
          recordBulkFailure(error, chunk.map((item) => item.habitId), { ambiguousIds, offlineFailureIds })
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
