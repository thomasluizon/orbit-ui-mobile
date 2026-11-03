import { applyHabitLogSuccess,checkTodayCompletionAfterLog,setOptimisticCalendarHabitLog,rollbackHabitLogCalendars } from '@orbit/shared/hooks'
import { withAccountGuard,type HabitAccount } from './use-habit-mutation-shared'
import type { UseMutationOptions } from '@tanstack/react-query'
import { checkCompletionAfterSkip } from '@orbit/shared/query/skip-completion'
import { randomUUID } from 'expo-crypto'
import type { HabitListSnapshots } from '@orbit/shared/query'
import { useQueryClient } from '@tanstack/react-query'
import { useHabitMutation } from './use-habit-mutation'
import { invalidateDerivedHabitLogQueries,habitKeys,profileKeys,applyCachedHabitSkip,rollbackDatedHabitLists,clearCachedOptimisticSkip,restoreCachedHabitSkip,getTodayHabitListAfterRefetch } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { findHabitInList,getAccountDay,getFriendlyErrorMessage,normalizeHabits,buildChildrenIndex,rollbackOptimisticHabitLogs } from '@orbit/shared/utils'
import type { LogHabitResponse,CalendarMonthResponse } from '@orbit/shared/types/habit'
import type { Profile } from '@orbit/shared/types/profile'
import type { HabitLog } from '@orbit/shared/types/calendar'
import { cancelQueuedSkipForUndo,executeSkipUndo,isQueuedResult,type QueuedMarker } from '@/lib/offline-mutations'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { optimisticSetDatedCompletion,optimisticToggleCompletion } from '@/lib/habit-optimistic-helpers'
import { finalizeHabitMutation,restoreHabitLists,snapshotHabitLists,updateHabitListsForDate } from '@/lib/habit-mutation-helpers'
import { getReviewMomentStreakKey } from '@orbit/shared/stores'
import { isReviewMomentEligible,useReviewReminderStore } from '@/stores/review-reminder-store'
import { useUIStore } from '@/stores/ui-store'
import { useTranslation } from 'react-i18next'
import { useAppToast } from '@/hooks/use-app-toast'
import { useUndoToast } from '@/hooks/use-undo-toast'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'
import { captureHabitLogged } from '@/lib/posthog'
import { resolveHabitLogDate } from './use-habit-mutation-shared'

type LogHabitMutationInput = {
  habitId: string
  date?: string
  intent: 'log' | 'unlog'
}

type LogHabitSnapshot = {
  account: HabitAccount
  occurrenceDate: string
  previousLists: HabitListSnapshots
  previousLogs: HabitLog[] | undefined
  previousCalendars: readonly (readonly [readonly unknown[], CalendarMonthResponse | undefined])[]
  hadPendingListRefetch: boolean
  retryAllDoneDate: string | null
}

export function useLogHabit() {
  const context = useLogHabitContext()
  const { queryClient } = context
  return useHabitMutation<
    LogHabitResponse | QueuedMarker,
    Error,
    LogHabitMutationInput,
    LogHabitSnapshot
  >({
    mutationFn: async ({ habitId, date }) => {
      return withAccountGuard(async (guardedAccount) => {
        const account = guardedAccount
        const occurrenceTime = new Date()
        const occurrenceDate = date ?? await resolveHabitLogDate(queryClient, occurrenceTime, account)
        account.assertCurrent()
        const dedupeDate = occurrenceDate ?? getAccountDay(occurrenceTime)
        return performQueuedApiMutation<LogHabitResponse>({
          isCurrent: account.stillCurrent,
          type: 'logHabit',
          scope: 'habits',
          endpoint: API.habits.log(habitId),
          method: 'POST',
          payload: occurrenceDate ? { date: occurrenceDate } : {},
          entityType: 'habit',
          targetEntityId: habitId,
          dedupeKey: `habit-toggle:${habitId}:${dedupeDate}`,
        })

      })
    },

    onMutate: createLogHabitOnMutate(context),

    onError: createLogHabitOnError(context),

    onSuccess: createLogHabitOnSuccess(context),

    onSettled: createLogHabitOnSettled(context),
  })
}

type SkipHabitInput = { habitId: string; date?: string; onUndo?: () => void; account?: HabitAccount }

type UndoSkipInput = {
  habitId: string
  skipId: string
  previousLists: HabitListSnapshots
  occurrence: { date: string; postponed: boolean }
  queuedMutationId?: string
  onUndo?: () => void
  account?: HabitAccount
}

function useUndoSkipHabit() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const showUndoToast = useUndoToast()
  const undoSkip = useHabitMutation<void | QueuedMarker, Error, UndoSkipInput>({
    mutationFn: async (input) => {
      return withAccountGuard(async (guardedAccount) => {
        input.account ??= guardedAccount
        input.account.assertCurrent()
        if (input.queuedMutationId) {
          const outcome = await cancelQueuedSkipForUndo(input.queuedMutationId)
          input.account.assertCurrent()
          if (outcome === 'cancelled') return
        }
        return performQueuedApiMutation<void>({
          type: 'undoSkipHabit', scope: 'habits', method: 'POST',
          endpoint: API.habits.undoSkip(input.habitId, input.skipId),
          payload: undefined, execute: executeSkipUndo, isCurrent: input.account.stillCurrent,
          entityType: 'habit', targetEntityId: input.habitId,
        })

      }, input.account)
    },
    onSuccess: (_result, input) => {
      if (input.account && !input.account.stillCurrent()) return
      input.onUndo?.()
      restoreCachedHabitSkip(queryClient, input.previousLists, input.habitId, input.occurrence)
    },
    onError: (error, input) => {
      if (input.account && !input.account.stillCurrent()) return
      showUndoToast(getFriendlyErrorMessage(error, t, 'undo.restoreFailed'), () => {
        if (input.account && !input.account.stillCurrent()) return
        undoSkip.mutate(input)
      })
    },
    onSettled: (result, error, input) => {
      if (input.account && !input.account.stillCurrent()) return
      finalizeHabitMutation(queryClient, result, error, {
        habitId: input.habitId, includeCount: false, includeGoals: true, includeProfile: true, includeGamification: true,
      })
    },
  })
  return undoSkip
}

export function useSkipHabit() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const showUndoToast = useUndoToast()
  const { showError } = useAppToast()
  const undoSkip = useUndoSkipHabit()
  const mutation = useHabitMutation({
    mutationFn: async (input: SkipHabitInput) => {
      return withAccountGuard(async (guardedAccount) => {
        input.account ??= guardedAccount
        input.account.assertCurrent()
        const skipId = randomUUID()
        const outcome = await performQueuedApiMutation<void>({
          type: 'skipHabit', scope: 'habits', endpoint: API.habits.skip(input.habitId), method: 'POST',
          isCurrent: input.account.stillCurrent,
          payload: { date: input.date, skipId }, entityType: 'habit', targetEntityId: input.habitId,
        })
        return { skipId, outcome }

      }, input.account)
    },
    onMutate: async (input) => {
      return withAccountGuard(async (guardedAccount) => {
        input.account ??= guardedAccount
        const account = input.account
        await queryClient.cancelQueries({ queryKey: habitKeys.lists() })
        account.assertCurrent()
        const { habitId, date } = input
        const previousLists = snapshotHabitLists(queryClient)
        const previous = previousLists.flatMap(([, items]) => items ? [findHabitInList(items, habitId)] : [])
          .find((habit) => habit !== null)
        const skippedDate = date ?? getAccountDay(new Date(), queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone)
        applyCachedHabitSkip(queryClient, habitId, skippedDate)
        return { previousLists, skippedDate, postponed: previous?.frequencyUnit === null, account }

      }, input.account)
    },
    onSuccess: ({ skipId, outcome }, { habitId, onUndo }, context) => {
      if (!context.account.stillCurrent()) return
      showUndoToast(t(context.postponed ? 'undo.habitPostponed' : 'undo.habitSkipped'), () => {
        if (!context.account.stillCurrent()) return
        undoSkip.mutate({
          habitId, skipId, previousLists: context.previousLists,
          occurrence: { date: context.skippedDate, postponed: context.postponed }, onUndo, account: context.account,
          queuedMutationId: isQueuedResult(outcome) ? outcome.queuedMutationId : undefined
        })
      })
    },
    onError: (error, input, context) => {
      const account = context?.account ?? input.account
      if (account && !account.stillCurrent()) return
      if (context) restoreHabitLists(queryClient, context.previousLists)
      showError(getFriendlyErrorMessage(error, t, 'undo.skipFailed'))
    },
    onSettled: (result, error, input, context) => {
      const account = context?.account ?? input.account
      if (account && !account.stillCurrent()) return
      if (!error && context) {
        clearCachedOptimisticSkip(queryClient, input.habitId, context.skippedDate)
        if (!isQueuedResult(result?.outcome)) checkCompletionAfterSkip(queryClient,
          [{ habitId: input.habitId, date: context.skippedDate }], queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone,
          useUIStore.getState().checkAllDoneCelebration, context.previousLists)
      }
      finalizeHabitMutation(queryClient, result?.outcome, error, {
        habitId: input.habitId, includeCount: false, includeGoals: true, includeProfile: true, includeGamification: true,
      })
    },
  })
  const scopeOptions = (
    options: Parameters<typeof mutation.mutate>[1], account: HabitAccount,
  ): Parameters<typeof mutation.mutate>[1] => options ? {
    ...options,
    onSuccess: (...arguments_) => { if (account.stillCurrent()) options.onSuccess?.(...arguments_) },
    onError: (...arguments_) => { if (account.stillCurrent()) options.onError?.(...arguments_) },
    onSettled: (...arguments_) => { if (account.stillCurrent()) options.onSettled?.(...arguments_) },
  } : undefined
  return {
    ...mutation,
    mutate: (input: SkipHabitInput, options?: Parameters<typeof mutation.mutate>[1]) => {
      return withAccountGuard((guardedAccount) => {
        const account = guardedAccount
        mutation.mutate({ ...input, account }, scopeOptions(options, account))

      })
    },
    mutateAsync: async (input: SkipHabitInput, options?: Parameters<typeof mutation.mutateAsync>[1]) => {
      return withAccountGuard(async (guardedAccount) => {
        const account = guardedAccount
        const result = await mutation.mutateAsync({ ...input, account }, scopeOptions(options, account))
        account.assertCurrent()
        return result

      })
    },
  }
}

function useLogHabitContext() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const { showInfo, showError } = useAppToast()
  const { setStreakCelebration, showStreakMoment, checkAllDoneCelebration } = useUIStore.getState()
  return { queryClient, t, showInfo, showError, setStreakCelebration, showStreakMoment, checkAllDoneCelebration }
}

type HabitLogOptions = UseMutationOptions<LogHabitResponse | QueuedMarker, Error, LogHabitMutationInput, LogHabitSnapshot>

function createLogHabitOnMutate(context: ReturnType<typeof useLogHabitContext>) {
  const { queryClient } = context
  const callback: NonNullable<HabitLogOptions['onMutate']> = ({ habitId, date, intent }) => {
    return withAccountGuard((guardedAccount) => {
      const account = guardedAccount
      const occurrenceDate = date ?? getAccountDay(new Date(), queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone)
      const hadPendingListRefetch = queryClient.isFetching({ queryKey: habitKeys.lists() }) > 0
      /** Start canceling refetches without delaying the optimistic completion. */
      void queryClient.cancelQueries({ queryKey: habitKeys.lists() })
      if (date) {
        void queryClient.cancelQueries({ queryKey: habitKeys.logs(habitId) })
        void queryClient.cancelQueries({ queryKey: habitKeys.calendarPrefix() })
      }

      const previousLists = snapshotHabitLists(queryClient)
      const previousLogs = date
        ? queryClient.getQueryData<HabitLog[]>(habitKeys.logs(habitId))
        : undefined
      const previousCalendars = date
        ? queryClient.getQueriesData<CalendarMonthResponse>({
          queryKey: habitKeys.calendarPrefix(),
        })
        : []

      if (date) {
        const completed = intent === 'log'
        const optimisticLogId = `optimistic-log:${habitId}:${date}`
        const createdAtUtc = new Date().toISOString()

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
            createdAtUtc,
          }]
        })
      setOptimisticCalendarHabitLog(queryClient, habitId, date, completed, optimisticLogId, createdAtUtc)
        updateHabitListsForDate(queryClient, date, (items) =>
          optimisticSetDatedCompletion(
            items,
            habitId,
            date,
            completed,
            optimisticLogId,
          ), { includeUnfiltered: false })
      } else {
        updateHabitListsForDate(queryClient, occurrenceDate,
          (items) => optimisticToggleCompletion(items, habitId))
      }

      return { account, occurrenceDate, previousLists, previousLogs, previousCalendars, hadPendingListRefetch, retryAllDoneDate: null }

    })
  }
  return callback
}

function createLogHabitOnError(context: ReturnType<typeof useLogHabitContext>) {
  const { queryClient, t, showError } = context
  const callback: NonNullable<HabitLogOptions['onError']> = (error, variables, context) => {
    if (context?.account.stillCurrent() === false) return
    if (context?.previousLists && !variables.date) {
      for (const [key, data] of context.previousLists) {
        if (data) {
          queryClient.setQueryData(key, data)
        }
      }
    }
    if (context && variables.date) {
      const date = variables.date
      const optimisticLogId = `optimistic-log:${variables.habitId}:${date}`
      rollbackDatedHabitLists(
        queryClient,
        context.previousLists,
        variables.habitId,
        date,
        optimisticLogId,
      )
      queryClient.setQueryData<HabitLog[] | undefined>(
        habitKeys.logs(variables.habitId),
        (currentLogs) => rollbackOptimisticHabitLogs(
          currentLogs,
          context.previousLogs,
          date,
          optimisticLogId,
        ),
      )
      rollbackHabitLogCalendars(queryClient, context.previousCalendars, variables.habitId, date)
    }
    showError(getFriendlyErrorMessage(error, (key, values) => t(key, values), 'habits.detail.logError'), t('common.dismiss'))
  }
  return callback
}

function createLogHabitOnSuccess(context: ReturnType<typeof useLogHabitContext>) {
  const { queryClient, t, showInfo, setStreakCelebration, showStreakMoment, checkAllDoneCelebration } = context
  const callback: NonNullable<HabitLogOptions['onSuccess']> = (response, variables, context: LogHabitSnapshot | undefined) => {
    if (context?.account.stillCurrent() === false) return
    const queuedResult = isQueuedResult(response)

    if (variables.intent === 'log' && (!queuedResult || response.retained !== true)) {
      useReviewReminderStore
        .getState()
        .trackCompletion(variables.date ?? getAccountDay(new Date()))
    }

    if (queuedResult) {
      showInfo(t('todayAstra.offlineLog'))
      return
    }

    captureHabitLogged()

    applyHabitLogSuccess(queryClient, response, variables, context, { setStreakCelebration, showStreakMoment,
      armMilestoneSharePrompt: useEngagementPromptStore.getState().armMilestoneSharePrompt,
      onStartedStreak: () => {
      const reviewMomentKey = getReviewMomentStreakKey(response.currentStreak)
      if (
        reviewMomentKey &&
        isReviewMomentEligible(
          useReviewReminderStore.getState(),
          queryClient.getQueryData<Profile>(profileKeys.detail())
            ?.hasCompletedOnboarding ?? false,
          getAccountDay(new Date()),
        )
      ) {
        useEngagementPromptStore.getState().armReviewPrompt(reviewMomentKey)
      }
      },
    })

    const retryAllDoneDate = checkTodayCompletionAfterLog(queryClient, { ...variables, date: context?.occurrenceDate ?? variables.date },
      context?.hadPendingListRefetch ?? false, checkAllDoneCelebration)
    if (context) context.retryAllDoneDate = retryAllDoneDate

  }
  return callback
}

function createLogHabitOnSettled(context: ReturnType<typeof useLogHabitContext>) {
  const { queryClient, checkAllDoneCelebration } = context
  const callback: NonNullable<HabitLogOptions['onSettled']> = (data, error, { habitId }, context) => {
    if (context?.account.stillCurrent() === false) return
    if (!error && !isQueuedResult(data)) invalidateDerivedHabitLogQueries(queryClient)
    const today = !error && !isQueuedResult(data) ? context?.retryAllDoneDate : null
    finalizeHabitMutation(queryClient, data, error, {
      habitId, includeCount: false, includeLists: !today,
    })
    if (!today) return
    return getTodayHabitListAfterRefetch(queryClient, today).then((habitsData) => {
      if (context?.account.stillCurrent() === false) return
      if (!habitsData) return
      const normalized = normalizeHabits(habitsData)
      checkAllDoneCelebration(normalized, buildChildrenIndex(normalized), today, queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone)
    })
  }
  return callback
}
