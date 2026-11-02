import { useResetOnAccountChange } from '@/hooks/use-session-reset'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { canLogHabitOnDate, computeParentPromptChain, selectParentPromptAncestor, settleParentPromptChain, type ParentPromptChain, computeParentPromptDecision, computeParentResolutionProgress, formatAPIDateInTimeZone, getTodayBoundary, hasAncestorInSet, type HabitResolution, type HabitResolutionMode } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { EMPTY_HABITS_BY_ID } from '@/hooks/use-habit-queries'
import type { useHabitVisibility } from '@/hooks/use-habit-visibility'
import { useUIStore } from '@/stores/ui-store'
import { subscribeBulkReplaySuccesses } from '@/lib/bulk-replay-events'
import type { useHabitListAccount, useHabitListQueries, useHabitListVisibility, useHabitRecentCompletions } from './use-habit-list-state'
import type { HabitListProps } from '../habit-list'

type ParentSettlementPrompt = ParentPromptChain

function getCurrentParentPrompt(queue: ParentPromptQueue, date: string) {
  if (queue.date !== date) return null
  return queue.prompts[0] ?? null
}

function enqueueParentPrompt(
  queue: ParentPromptQueue,
  prompt: ParentSettlementPrompt,
): ParentPromptQueue {
  const prompts = queue.date === prompt.date ? queue.prompts : []
  return { date: prompt.date, prompts: [...prompts, prompt] }
}

function removeParentPrompt(
  queue: ParentPromptQueue,
  habitId: string,
  date: string,
): ParentPromptQueue {
  if (queue.date !== date) return queue
  const prompts = queue.prompts.filter((prompt) => !prompt.ancestors.some(({ habit }) => habit.id === habitId))
  return prompts.length === queue.prompts.length ? queue : { ...queue, prompts }
}

function shiftParentPrompt(queue: ParentPromptQueue, date: string): ParentPromptQueue {
  if (queue.date !== date) return queue
  return { ...queue, prompts: queue.prompts.slice(1) }
}

interface ParentSettlementData {
  getChildren: (id: string) => NormalizedHabit[]
  visibility: ReturnType<typeof useHabitVisibility>
  habitsById: Map<string, NormalizedHabit>
  selectedDateStr: string
  isListView: boolean
}

interface ParentSettlementOperation {
  data: ParentSettlementData
  date: string
  confirmedResolutions: ConfirmedResolutionRecord
  requiresLogConfirmation: boolean
}

function getParentPromptProgress(
  habitId: string,
  confirmedResolutions: ConfirmedResolutionRecord,
  settlementData: ParentSettlementData | null,
) {
  if (!settlementData) return { done: 0, total: 0, loggedDone: 0 }
  return computeParentResolutionProgress(habitId, settlementData.habitsById, {
    getChildren: settlementData.getChildren,
    isRelevantToday: settlementData.visibility.isRelevantToday,
    isDueOnSelectedDate: settlementData.visibility.isDueOnSelectedDate,
    skippedIds: confirmedResolutions.skippedIds,
    isListView: settlementData.isListView,
    resolvedModes: confirmedResolutions.modes,
  }, confirmedResolutions.sources)
}

function getParentPromptChain(childId: string, record: ConfirmedResolutionRecord, settlement: ParentSettlementData) {
  return computeParentPromptChain(childId, settlement.habitsById, settlement.selectedDateStr, {
    getChildren: settlement.getChildren,
    isRelevantToday: settlement.visibility.isRelevantToday,
    isDueOnSelectedDate: settlement.visibility.isDueOnSelectedDate,
    isListView: settlement.isListView,
    skippedIds: record.skippedIds,
    resolvedModes: record.modes,
  }, record.sources)
}

function clearPersistedResolutions(
  confirmedResolutions: ConfirmedResolutionRecord,
  habitsById: ReadonlyMap<string, NormalizedHabit>,
) {
  for (const habitId of confirmedResolutions.modes.keys()) {
    const habit = habitsById.get(habitId)
    const hasFlexibleSkip = habit?.flexibleTarget != null &&
      habit.flexibleCompleted != null &&
      habit.flexibleCompleted >= habit.flexibleTarget &&
      !habit.isLoggedInRange
    if (!habit?.isCompleted && !habit?.isLoggedInRange && !hasFlexibleSkip) continue
    confirmedResolutions.modes.delete(habitId)
    confirmedResolutions.skippedIds.delete(habitId)
  }
}

function refreshConfirmedResolutions(
  confirmedResolutions: ConfirmedResolutionRecord,
  hasQueuedParentPrompt: boolean,
  habitsById: ReadonlyMap<string, NormalizedHabit>,
) {
  if (hasQueuedParentPrompt) {
    clearPersistedResolutions(confirmedResolutions, habitsById)
    confirmedResolutions.clearWhenIdle = false
    return
  }
  if (confirmedResolutions.activeSettlements === 0) {
    confirmedResolutions.sources.clear()
    confirmedResolutions.modes.clear()
    confirmedResolutions.skippedIds.clear()
    confirmedResolutions.clearWhenIdle = false
    return
  }
  confirmedResolutions.clearWhenIdle = true
}

function createConfirmedResolutionRecord(date: string): ConfirmedResolutionRecord {
  return {
    date,
    sources: new Map(),
    pending: new Map(),
    modes: new Map(),
    skippedIds: new Set(),
    activeSettlements: 0,
    clearWhenIdle: false,
  }
}

type ParentPromptStateInputs = Pick<ReturnType<typeof useHabitListAccount>, 'selectedDateStr'>

function useParentPromptState({ selectedDateStr }: ParentPromptStateInputs) {
  const pendingToggleKeysRef = useRef(new Set<string>())
  const promptedParentIdsRef = useRef(new Set<string>())
  const confirmedResolutionsRef = useRef(
    createConfirmedResolutionRecord(selectedDateStr),
  )
  const [parentPromptQueue, setParentPromptQueue] = useState<ParentPromptQueue>({
    date: selectedDateStr,
    prompts: [],
  })
  const parentPrompt = getCurrentParentPrompt(parentPromptQueue, selectedDateStr)
  const hasQueuedParentPrompt = parentPrompt !== null
  const promptDataRef = useRef<ParentSettlementData | null>(null)

  useResetOnAccountChange(() => {
    pendingToggleKeysRef.current.clear()
    promptedParentIdsRef.current.clear()
    confirmedResolutionsRef.current = createConfirmedResolutionRecord(selectedDateStr)
    promptDataRef.current = null
    setParentPromptQueue((queue) => transitionParentPromptQueue(queue, { type: 'clear', date: selectedDateStr }))
  })
  return { promptedParentIdsRef, confirmedResolutionsRef, promptDataRef, hasQueuedParentPrompt, setParentPromptQueue, parentPrompt, pendingToggleKeysRef }
}

type ParentPromptDateResetInputs = Pick<ReturnType<typeof useParentPromptState>, 'promptedParentIdsRef' | 'confirmedResolutionsRef'> & Pick<ReturnType<typeof useHabitListAccount>, 'selectedDateStr'>

function useParentPromptDateReset({ promptedParentIdsRef, confirmedResolutionsRef, selectedDateStr }: ParentPromptDateResetInputs) {
  useEffect(() => {
    promptedParentIdsRef.current.clear()
    confirmedResolutionsRef.current = createConfirmedResolutionRecord(selectedDateStr)
  }, [confirmedResolutionsRef, promptedParentIdsRef, selectedDateStr])

}

type ParentPromptDataInputs = Pick<ReturnType<typeof useParentPromptState>, 'promptDataRef'> & Pick<ReturnType<typeof useHabitListQueries>, 'getChildren' | 'habitsById'> & Pick<ReturnType<typeof useHabitListVisibility>, 'visibility'> & Pick<ReturnType<typeof useHabitListAccount>, 'selectedDateStr'> & { view: NonNullable<HabitListProps['view']> }

function useParentPromptData({ promptDataRef, getChildren, visibility, habitsById, selectedDateStr, view }: ParentPromptDataInputs) {
  useLayoutEffect(() => {
    promptDataRef.current = {
      getChildren,
      visibility,
      habitsById,
      selectedDateStr,
      isListView: view !== 'today',
    }
    // react-doctor-disable-next-line exhaustive-deps -- getChildren/habitsById are the extracted habitsQuery members and already listed; the analyzer wants the qualified paths but the aliases track them https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [getChildren, visibility, habitsById, selectedDateStr, view, promptDataRef])

}

type ParentPromptRefreshInputs = Pick<ReturnType<typeof useParentPromptState>, 'confirmedResolutionsRef' | 'hasQueuedParentPrompt' | 'promptDataRef' | 'promptedParentIdsRef'> & Pick<ReturnType<typeof useHabitListAccount>, 'selectedDateStr'> & Pick<ReturnType<typeof useHabitListQueries>, 'habitsQuery'>

function useParentPromptRefresh({ confirmedResolutionsRef, hasQueuedParentPrompt, promptDataRef, promptedParentIdsRef, selectedDateStr, habitsQuery }: ParentPromptRefreshInputs) {
  useLayoutEffect(() => {
    const confirmedResolutions = confirmedResolutionsRef.current
    refreshConfirmedResolutions(
      confirmedResolutions,
      hasQueuedParentPrompt,
      promptDataRef.current?.habitsById ?? EMPTY_HABITS_BY_ID,
    )
    for (const parentId of promptedParentIdsRef.current) {
      const progress = getParentPromptProgress(
        parentId,
        confirmedResolutions,
        promptDataRef.current,
      )
      const decision = computeParentPromptDecision(
        promptDataRef.current?.habitsById.get(parentId) ?? null,
        progress,
        selectedDateStr,
        promptedParentIdsRef.current,
      )
      if (decision.type === 'release') {
        promptedParentIdsRef.current.delete(parentId)
      }
    }
  }, [confirmedResolutionsRef, habitsQuery.dataUpdatedAt, hasQueuedParentPrompt, promptDataRef, promptedParentIdsRef, selectedDateStr])

}

type ParentResolutionRecordInputs = Pick<ReturnType<typeof useParentPromptState>, 'promptDataRef'>

function useParentResolutionRecord({ promptDataRef }: ParentResolutionRecordInputs) {
  const recordHabitResolution = useCallback((
    confirmedResolutions: ConfirmedResolutionRecord,
    habitId: string,
    mode: HabitResolutionMode,
  ) => {
    const habit = promptDataRef.current?.habitsById.get(habitId)
    if (habit) confirmedResolutions.sources.set(habitId, { habit, mode })
    confirmedResolutions.modes.set(habitId, mode)
    if (mode === 'skip') {
      confirmedResolutions.skippedIds.add(habitId)
    } else {
      confirmedResolutions.skippedIds.delete(habitId)
    }
  }, [promptDataRef])

  const finishParentSettlement = useCallback((
    confirmedResolutions: ConfirmedResolutionRecord,
  ) => {
    confirmedResolutions.activeSettlements -= 1
    if (confirmedResolutions.activeSettlements === 0 && confirmedResolutions.clearWhenIdle) {
      confirmedResolutions.sources.clear()
      confirmedResolutions.modes.clear()
      confirmedResolutions.skippedIds.clear()
      confirmedResolutions.clearWhenIdle = false
    }
  }, [])
  return { recordHabitResolution, finishParentSettlement }
}

type ParentPromptDecisionInputs = Pick<ReturnType<typeof useParentPromptState>, 'promptDataRef' | 'promptedParentIdsRef' | 'setParentPromptQueue'> & Pick<ReturnType<typeof useHabitListAccount>, 'settlementDateIsReadOnly'>

function useParentPromptDecision({ promptDataRef, settlementDateIsReadOnly, promptedParentIdsRef, setParentPromptQueue }: ParentPromptDecisionInputs) {
  const checkAndSettleParent = useCallback(
    function settleParentForChild(
      childHabitId: string,
      confirmedResolutions: ConfirmedResolutionRecord,
      settlementData: ParentSettlementData | null = promptDataRef.current,
    ) {
      if (!settlementData) return

      const childHabit = settlementData.habitsById.get(childHabitId)
      if (!childHabit?.parentId) return

      const parentHabit = settlementData.habitsById.get(childHabit.parentId)
      if (!parentHabit || parentHabit.isCompleted) return
      if (settlementDateIsReadOnly(settlementData.selectedDateStr)) {
        promptedParentIdsRef.current.delete(parentHabit.id)
        setParentPromptQueue((current) => transitionParentPromptQueue(current, { type: 'remove', habitId: parentHabit.id, date: settlementData.selectedDateStr }))
        return
      }

      const decision = computeParentPromptDecision(
        parentHabit,
        getParentPromptProgress(
          parentHabit.id,
          confirmedResolutions,
          settlementData,
        ),
        settlementData.selectedDateStr,
        promptedParentIdsRef.current,
      )
      if (decision.type === 'open') {
        const ancestors = getParentPromptChain(childHabitId, confirmedResolutions, settlementData)
        if (ancestors.length === 0) return
        confirmedResolutions.clearWhenIdle = false
        for (const { habit } of ancestors) promptedParentIdsRef.current.add(habit.id)
        setParentPromptQueue((current) => transitionParentPromptQueue(current, {
          type: 'enqueue', prompt: {
            childId: childHabitId,
            ancestors,
            selectedCount: 1,
            habit: parentHabit,
            mode: decision.mode,
            date: settlementData.selectedDateStr,
          }
        }))
      } else if (decision.type === 'release') {
        promptedParentIdsRef.current.delete(parentHabit.id)
        setParentPromptQueue((current) => transitionParentPromptQueue(current, { type: 'remove', habitId: parentHabit.id, date: settlementData.selectedDateStr }))
      }
    },
    [promptDataRef, settlementDateIsReadOnly, promptedParentIdsRef, setParentPromptQueue],
  )
  return { checkAndSettleParent }
}

type ParentAutoSettlementInputs = Pick<ReturnType<typeof useParentPromptState>, 'promptedParentIdsRef' | 'confirmedResolutionsRef' | 'promptDataRef'> & Pick<ReturnType<typeof useParentPromptDecision>, 'checkAndSettleParent'> & Pick<ReturnType<typeof useHabitListAccount>, 'settlementDateIsReadOnly'> & Pick<ReturnType<typeof useHabitListQueries>, 'skipMutation' | 'logMutateAsync'> & Pick<ReturnType<typeof useHabitRecentCompletions>, 'markRecentlyCompleted' | 'clearRecentlyCompleted'> & Pick<ReturnType<typeof useParentResolutionRecord>, 'recordHabitResolution' | 'finishParentSettlement'>

function useParentAutoSettlement({ promptedParentIdsRef, checkAndSettleParent, settlementDateIsReadOnly, skipMutation, markRecentlyCompleted, logMutateAsync, confirmedResolutionsRef, clearRecentlyCompleted, promptDataRef, recordHabitResolution, finishParentSettlement }: ParentAutoSettlementInputs) {
  const settleParentAutomatically = useCallback(
    function settleParentForChild(
      childHabitId: string,
      operation: ParentSettlementOperation,
    ) {
      const childHabit = operation.data.habitsById.get(childHabitId)
      if (!childHabit?.parentId) return
      const parentHabit = operation.data.habitsById.get(childHabit.parentId)
      if (!parentHabit) return

      const decision = computeParentPromptDecision(
        parentHabit,
        getParentPromptProgress(
          parentHabit.id,
          operation.confirmedResolutions,
          operation.data,
        ),
        operation.date,
        promptedParentIdsRef.current,
      )
      if (decision.type === 'release') promptedParentIdsRef.current.delete(parentHabit.id)
      if (decision.type !== 'open') return
      if (getParentPromptChain(childHabitId, operation.confirmedResolutions, operation.data).length === 0) return
      const { mode } = decision

      if (mode === 'log' && operation.requiresLogConfirmation) {
        checkAndSettleParent(childHabitId, operation.confirmedResolutions, operation.data)
        return
      }

      if (settlementDateIsReadOnly(operation.date)) {
        promptedParentIdsRef.current.delete(parentHabit.id)
        return
      }

      promptedParentIdsRef.current.add(parentHabit.id)
      operation.confirmedResolutions.activeSettlements += 1
      void (async () => {
        try {
          try {
            if (mode === 'skip') {
              await skipMutation.mutateAsync({
                habitId: parentHabit.id,
                date: operation.date,
              })
            } else {
              markRecentlyCompleted(parentHabit.id, operation.date)
              await logMutateAsync({
                habitId: parentHabit.id,
                date: operation.date,
                intent: 'log',
              })
            }
          } catch {
            if (confirmedResolutionsRef.current === operation.confirmedResolutions) {
              promptedParentIdsRef.current.delete(parentHabit.id)
              clearRecentlyCompleted(parentHabit.id, operation.date)
            }
            return
          }

          if (
            promptDataRef.current?.selectedDateStr !== operation.date ||
            confirmedResolutionsRef.current !== operation.confirmedResolutions
          ) return
          recordHabitResolution(operation.confirmedResolutions, parentHabit.id, mode)
          settleParentForChild(parentHabit.id, operation)
        } finally {
          finishParentSettlement(operation.confirmedResolutions)
        }
      })()
    },
    [promptedParentIdsRef, settlementDateIsReadOnly, checkAndSettleParent, promptDataRef, confirmedResolutionsRef, recordHabitResolution, skipMutation, markRecentlyCompleted, logMutateAsync, clearRecentlyCompleted, finishParentSettlement],
  )
  return { settleParentAutomatically }
}

type ParentPromptLoggingInputs = Pick<ReturnType<typeof useParentPromptState>, 'confirmedResolutionsRef' | 'promptDataRef'> & Pick<ReturnType<typeof useParentResolutionRecord>, 'recordHabitResolution'> & Pick<ReturnType<typeof useParentPromptDecision>, 'checkAndSettleParent'>

function useParentPromptLogging({ confirmedResolutionsRef, recordHabitResolution, promptDataRef, checkAndSettleParent }: ParentPromptLoggingInputs) {
  const checkAndPromptParentLog = useCallback((childHabitId: string) => {
    const confirmedResolutions = confirmedResolutionsRef.current
    recordHabitResolution(confirmedResolutions, childHabitId, 'log')
    const habit = promptDataRef.current?.habitsById.get(childHabitId)
    if (habit?.isCompleted || habit?.isLoggedInRange) confirmedResolutions.modes.delete(childHabitId)
    checkAndSettleParent(childHabitId, confirmedResolutions)
  }, [checkAndSettleParent, confirmedResolutionsRef, promptDataRef, recordHabitResolution])
  return { checkAndPromptParentLog }
}

type ParentBulkSettlementInputs = Pick<ReturnType<typeof useParentPromptState>, 'promptDataRef' | 'confirmedResolutionsRef'> & Pick<ReturnType<typeof useHabitRecentCompletions>, 'markRecentlyCompleted'> & Pick<ReturnType<typeof useHabitListAccount>, 'selectedDateStr'> & Pick<ReturnType<typeof useParentResolutionRecord>, 'recordHabitResolution'> & Pick<ReturnType<typeof useHabitListQueries>, 'habitsById'> & Pick<ReturnType<typeof useParentAutoSettlement>, 'settleParentAutomatically'>

function useParentBulkSettlement({ promptDataRef, markRecentlyCompleted, selectedDateStr, confirmedResolutionsRef, recordHabitResolution, habitsById, settleParentAutomatically }: ParentBulkSettlementInputs) {
  const settleBulkHabitResolutions = useCallback((
    resolutions: readonly HabitResolution[],
    date: string,
    settleParents = true,
  ) => {
    const settlementData = promptDataRef.current
    if (!settlementData) return
    for (const resolution of resolutions.filter((item) => item.mode === 'log')) {
      markRecentlyCompleted(resolution.habitId, date)
    }
    if (selectedDateStr !== date || settlementData.selectedDateStr !== date) return
    const confirmedResolutions = confirmedResolutionsRef.current
    const resolvedIds = new Set(resolutions.map((resolution) => resolution.habitId))
    for (const resolution of resolutions) {
      recordHabitResolution(confirmedResolutions, resolution.habitId, resolution.mode)
    }

    if (!settleParents) return
    const childIdByAffectedParent = new Map<string, string>()
    for (const resolution of resolutions) {
      if (hasAncestorInSet(resolution.habitId, habitsById, resolvedIds)) continue
      const parentId = habitsById.get(resolution.habitId)?.parentId
      if (parentId && !childIdByAffectedParent.has(parentId)) {
        childIdByAffectedParent.set(parentId, resolution.habitId)
      }
    }

    const operation: ParentSettlementOperation = {
      data: settlementData,
      date,
      confirmedResolutions,
      requiresLogConfirmation: false,
    }
    for (const childId of childIdByAffectedParent.values()) {
      settleParentAutomatically(childId, operation)
    }
  }, [confirmedResolutionsRef, habitsById, markRecentlyCompleted, promptDataRef, recordHabitResolution, selectedDateStr, settleParentAutomatically])
  return { settleBulkHabitResolutions }
}

type ParentReplaySettlementInputs = Pick<ReturnType<typeof useParentPromptState>, 'promptDataRef'> & Pick<ReturnType<typeof useHabitListAccount>, 'selectedDateStr'> & Pick<ReturnType<typeof useParentBulkSettlement>, 'settleBulkHabitResolutions'> & Pick<ReturnType<typeof useHabitListQueries>, 'habitsById'>

function useParentReplaySettlement({ promptDataRef, selectedDateStr, settleBulkHabitResolutions, habitsById }: ParentReplaySettlementInputs) {
  useEffect(() => subscribeBulkReplaySuccesses((success) => {
    const available = promptDataRef.current?.habitsById
    const matched = success.items.filter((item) =>
      item.date === selectedDateStr && available?.has(item.habitId))
    const remaining = success.items.filter((item) =>
      item.date !== selectedDateStr || !available?.has(item.habitId))
    if (matched.length > 0) {
      const mode = success.type === 'bulkLogHabits' ? 'log' : 'skip'
      settleBulkHabitResolutions(matched.map((item) => ({ habitId: item.habitId, mode })), selectedDateStr, !success.suppressParentSettlement)
      const selection = useUIStore.getState()
      if (selection.isSelectMode) {
        const resolvedIds = new Set(matched.map((item) => item.habitId))
        const stillSelected = [...selection.selectedHabitIds].filter((id) => !resolvedIds.has(id))
        if (stillSelected.length < selection.selectedHabitIds.size) {
          if (stillSelected.length > 0) selection.selectAllHabits(stillSelected)
          else selection.clearSelection()
        }
      }
    }
    return remaining.length === success.items.length ? false : remaining
  }), [habitsById, promptDataRef, selectedDateStr, settleBulkHabitResolutions])

}

type ParentLoggedTransitionInputs = Pick<ReturnType<typeof useHabitRecentCompletions>, 'markRecentlyCompleted'> & Pick<ReturnType<typeof useParentPromptLogging>, 'checkAndPromptParentLog'>

function useParentLoggedTransition({ markRecentlyCompleted, checkAndPromptParentLog }: ParentLoggedTransitionInputs) {
  const handleLogged = useCallback(
    (habitId: string, markAsRecentlyCompleted: boolean) => {
      if (markAsRecentlyCompleted) {
        markRecentlyCompleted(habitId)
      }

      checkAndPromptParentLog(habitId)
    },
    [checkAndPromptParentLog, markRecentlyCompleted],
  )
  return { handleLogged }
}

async function confirmParentSettlement(context: ParentPromptContext) {
  const { promptDataRef, confirmedResolutionsRef, parentPrompt, selectedDateStr, setParentPromptQueue, settlementDateIsReadOnly, bulkLog, bulkSkip, recordHabitResolution, markRecentlyCompleted, showError, t, promptedParentIdsRef, finishParentSettlement } = context

  const settlementData = promptDataRef.current
  const record = confirmedResolutionsRef.current
  const prompt = parentPrompt
  if (!prompt || !settlementData || prompt.date !== selectedDateStr) return
  setParentPromptQueue((current) => transitionParentPromptQueue(current, { type: 'remove', habitId: prompt.habit.id, date: prompt.date }))
  const isCurrent = () => confirmedResolutionsRef.current === record &&
    promptDataRef.current?.selectedDateStr === prompt.date && !settlementDateIsReadOnly(prompt.date)
  record.activeSettlements += 1
  const settledIds = new Set<string>()
  try {
    const selectedIds = new Set(prompt.ancestors.slice(0, prompt.selectedCount).map(({ habit }) => habit.id))
    const knownHabits = new Map([...record.sources].map(([id, { habit }]) => [id, habit] as const).concat([...settlementData.habitsById]))
    const pendingChildren = [...record.pending].filter(([id]) => hasAncestorInSet(id, knownHabits, selectedIds)).map(([, write]) => write)
    if ((await Promise.all(pendingChildren)).some((success) => !success) || !isCurrent()) return
    const ancestors = getParentPromptChain(prompt.childId, record, promptDataRef.current ?? settlementData).slice(0, prompt.selectedCount)
    if (ancestors.length !== prompt.selectedCount || ancestors.some(({ habit }, index) =>
      habit.id !== prompt.ancestors[index]?.habit.id)) return
    const failedIds = await settleParentPromptChain(ancestors, {
      date: prompt.date,
      log: (items, parentPromptContinuation) => bulkLog.mutateAsync(parentPromptContinuation.length > 0 ? { items, parentPromptContinuation } : items),
      skip: (items, parentPromptContinuation) => bulkSkip.mutateAsync(parentPromptContinuation.length > 0 ? { items, parentPromptContinuation } : items),
      isCurrent,
      onSettled: ({ habitId, mode }) => {
        settledIds.add(habitId)
        recordHabitResolution(record, habitId, mode)
        if (mode === 'log') markRecentlyCompleted(habitId, prompt.date)
      },
    })
    if (failedIds.length > 0 && isCurrent()) showError(t('habits.bulkBar.partialFailure', { count: failedIds.length }))
  } catch (error) {
    if (isCurrent()) showError(getFriendlyErrorMessage(error, t, 'common.error'))
  } finally {
    if (isCurrent()) {
      for (const { habit } of prompt.ancestors.slice(0, prompt.selectedCount)) {
        if (!settledIds.has(habit.id)) promptedParentIdsRef.current.delete(habit.id)
      }
    }
    finishParentSettlement(record)
  }
}

function selectParentAncestor(context: ParentPromptContext, index: number, checked: boolean) {
  const { setParentPromptQueue, parentPrompt } = context
  setParentPromptQueue((queue) => transitionParentPromptQueue(queue, { type: 'progress', prompt: parentPrompt, index, checked }))
}

function releaseParentResolution(context: ParentPromptContext, habitId: string, record: ConfirmedResolutionRecord, sourceParentId?: string | null) {
  const { confirmedResolutionsRef, clearRecentlyCompleted, promptDataRef, promptedParentIdsRef, setParentPromptQueue } = context

  const parentAtResolution = sourceParentId ?? record.sources.get(habitId)?.habit.parentId
  record.sources.delete(habitId)
  record.modes.delete(habitId)
  record.skippedIds.delete(habitId)
  if (confirmedResolutionsRef.current !== record) return
  clearRecentlyCompleted(habitId, record.date)
  let parentId = parentAtResolution ?? promptDataRef.current?.habitsById.get(habitId)?.parentId
  while (parentId) {
    promptedParentIdsRef.current.delete(parentId)
    const releasedId = parentId
    setParentPromptQueue((current) => transitionParentPromptQueue(current, { type: 'remove', habitId: releasedId, date: record.date }))
    parentId = promptDataRef.current?.habitsById.get(parentId)?.parentId
  }
}

async function handleDirectToggle(context: ParentPromptContext, habit: NormalizedHabit, intent: 'log' | 'unlog') {
  const { profile, accountTimeZone, selectedDateStr, selectedDate, pendingToggleKeysRef, confirmedResolutionsRef, markRecentlyCompleted, handleLogged, logMutateAsync, refetch, finishParentSettlement } = context

  if (!profile) return
  const currentDate = new Date()
  const accountToday = formatAPIDateInTimeZone(currentDate, accountTimeZone)
  const boundary = getTodayBoundary(selectedDateStr, accountToday)
  const habitId = habit.id
  if (boundary === 'read-only' || (!selectedDate && selectedDateStr !== accountToday) ||
    (boundary === 'future' && !canLogHabitOnDate(habit, selectedDateStr, accountToday))) return
  const toggleKey = `${habitId}:${selectedDateStr}`
  const pendingToggleKeys = pendingToggleKeysRef.current
  if (pendingToggleKeys.has(toggleKey)) return

  pendingToggleKeys.add(toggleKey)
  const confirmedResolutions = confirmedResolutionsRef.current
  confirmedResolutions.activeSettlements += 1
  if (intent === 'log') {
    markRecentlyCompleted(habitId)
    handleLogged(habitId, false)
  }
  let mutationSucceeded = false

  try {
    const mutation = logMutateAsync(
      selectedDate
        ? { habitId, date: selectedDateStr, intent }
        : { habitId, intent },
    )
    confirmedResolutions.pending.set(habitId, Promise.resolve(mutation).then(() => true, () => false))
    await mutation
    mutationSucceeded = true
    await refetch()
  } catch {
    if (!mutationSucceeded && intent === 'log') releaseParentResolution(context, habitId, confirmedResolutions, habit.parentId)
  } finally {
    confirmedResolutions.pending.delete(habitId)
    finishParentSettlement(confirmedResolutions)
    pendingToggleKeys.delete(toggleKey)
  }
}

async function skipHabit(context: ParentPromptContext, habit: NormalizedHabit) {
const releaseOptimisticResolution = releaseParentResolution.bind(null, context)

  const { profile, accountTimeZone, selectedDateStr, confirmedResolutionsRef, recordHabitResolution, checkAndSettleParent, skipMutation, finishParentSettlement } = context

  if (!profile) return
  const accountToday = formatAPIDateInTimeZone(new Date(), accountTimeZone)
  const boundary = getTodayBoundary(selectedDateStr, accountToday)
  if (boundary === 'read-only' || !canLogHabitOnDate(habit, selectedDateStr, accountToday)) return
  const habitId = habit.id
  const record = confirmedResolutionsRef.current
  if (record.pending.has(habitId)) return
  record.activeSettlements += 1
  recordHabitResolution(record, habitId, 'skip')
  checkAndSettleParent(habitId, record)
  try {
    const mutation = skipMutation.mutateAsync({
      habitId, date: record.date,
      onUndo: () => releaseOptimisticResolution(habitId, record, habit.parentId),
    })
    record.pending.set(habitId, Promise.resolve(mutation).then(() => true, () => false))
    await mutation
  } catch {
    releaseOptimisticResolution(habitId, record, habit.parentId)
  } finally {
    record.pending.delete(habitId)
    finishParentSettlement(record)
  }
}

type ParentPromptContext = Pick<ReturnType<typeof useParentPromptState>, 'promptDataRef' | 'confirmedResolutionsRef' | 'parentPrompt' | 'setParentPromptQueue' | 'promptedParentIdsRef' | 'pendingToggleKeysRef'> & Pick<ReturnType<typeof useHabitListAccount>, 'selectedDateStr' | 'settlementDateIsReadOnly' | 't' | 'profile' | 'accountTimeZone' | 'selectedDate'> & Pick<ReturnType<typeof useHabitListQueries>, 'bulkLog' | 'bulkSkip' | 'showError' | 'logMutateAsync' | 'refetch' | 'skipMutation'> & Pick<ReturnType<typeof useParentResolutionRecord>, 'recordHabitResolution' | 'finishParentSettlement'> & Pick<ReturnType<typeof useHabitRecentCompletions>, 'markRecentlyCompleted' | 'clearRecentlyCompleted'> & Pick<ReturnType<typeof useParentLoggedTransition>, 'handleLogged'> & Pick<ReturnType<typeof useParentPromptDecision>, 'checkAndSettleParent'>

function createParentPrompt(context: ParentPromptContext) {
  return { cancelParentPrompt: cancelParentPrompt.bind(null, context), confirmParentSettlement: confirmParentSettlement.bind(null, context), selectParentAncestor: selectParentAncestor.bind(null, context), handleDirectToggle: handleDirectToggle.bind(null, context), skipHabit: skipHabit.bind(null, context) }
}

function cancelParentPrompt(context: ParentPromptContext) {
  const { setParentPromptQueue, selectedDateStr } = context
  setParentPromptQueue((current) => transitionParentPromptQueue(current, { type: 'shift', date: selectedDateStr }))
}

interface ParentPromptState {
  date: string
  prompts: ParentSettlementPrompt[]
  confirmed: {
    date: string
    sources: Map<string, { habit: NormalizedHabit; mode: HabitResolutionMode }>
    pending: Map<string, Promise<boolean>>
    modes: Map<string, HabitResolutionMode>
    skippedIds: Set<string>
    activeSettlements: number
    clearWhenIdle: boolean
  }
}

type ParentPromptQueue = Pick<ParentPromptState, 'date' | 'prompts'>

type ConfirmedResolutionRecord = ParentPromptState['confirmed']

export function createParentPromptQueue(date: string): ParentPromptQueue {
  return { date, prompts: [] }
}

type ParentPromptTransition =
  | { type: 'enqueue'; prompt: ParentSettlementPrompt }
  | { type: 'remove'; habitId: string; date: string }
  | { type: 'shift'; date: string }
  | { type: 'progress'; prompt: ParentSettlementPrompt | null; index: number; checked: boolean }
  | { type: 'clear'; date: string }

export function transitionParentPromptQueue(queue: ParentPromptQueue, transition: ParentPromptTransition): ParentPromptQueue {
  switch (transition.type) {
    case 'enqueue': return enqueueParentPrompt(queue, transition.prompt)
    case 'remove': return removeParentPrompt(queue, transition.habitId, transition.date)
    case 'shift': return shiftParentPrompt(queue, transition.date)
    case 'clear': return createParentPromptQueue(transition.date)
    case 'progress': return { ...queue, prompts: queue.prompts.map((prompt) => prompt === transition.prompt ? selectParentPromptAncestor(prompt, transition.index, transition.checked) : prompt) }
  }
}

type ParentPromptQueueInputs = Pick<ReturnType<typeof useHabitListAccount>, 'selectedDateStr' | 'settlementDateIsReadOnly' | 't' | 'profile' | 'accountTimeZone' | 'selectedDate'> & Pick<ReturnType<typeof useHabitListQueries>, 'getChildren' | 'habitsById' | 'habitsQuery' | 'skipMutation' | 'logMutateAsync' | 'bulkLog' | 'bulkSkip' | 'showError' | 'refetch'> & Pick<ReturnType<typeof useHabitListVisibility>, 'visibility'> & { view: NonNullable<HabitListProps['view']> } & Pick<ReturnType<typeof useHabitRecentCompletions>, 'markRecentlyCompleted' | 'clearRecentlyCompleted'>

export function useParentPromptQueue(inputs: ParentPromptQueueInputs) {
  const parentPromptState = useParentPromptState({ ...inputs })
  useParentPromptDateReset({ ...parentPromptState, ...inputs })
  useParentPromptData({ ...parentPromptState, ...inputs })
  useParentPromptRefresh({ ...parentPromptState, ...inputs })
  const parentResolutionRecord = useParentResolutionRecord({ ...parentPromptState })
  const parentPromptDecision = useParentPromptDecision({ ...parentPromptState, ...inputs })
  const parentAutoSettlement = useParentAutoSettlement({ ...parentPromptState, ...parentPromptDecision, ...inputs, ...parentResolutionRecord })
  const parentPromptLogging = useParentPromptLogging({ ...parentPromptState, ...parentResolutionRecord, ...parentPromptDecision })
  const parentBulkSettlement = useParentBulkSettlement({ ...parentPromptState, ...inputs, ...parentResolutionRecord, ...parentAutoSettlement })
  useParentReplaySettlement({ ...parentPromptState, ...inputs, ...parentBulkSettlement })
  const parentLoggedTransition = useParentLoggedTransition({ ...inputs, ...parentPromptLogging })
  const parentPrompt = createParentPrompt({ ...parentPromptState, ...inputs, ...parentResolutionRecord, ...parentLoggedTransition, ...parentPromptDecision })
  return { checkAndPromptParentLog: parentPromptLogging.checkAndPromptParentLog, settleBulkHabitResolutions: parentBulkSettlement.settleBulkHabitResolutions, handleDirectToggle: parentPrompt.handleDirectToggle, skipHabit: parentPrompt.skipHabit, parentPrompt: parentPromptState.parentPrompt, confirmParentSettlement: parentPrompt.confirmParentSettlement, selectParentAncestor: parentPrompt.selectParentAncestor, cancelParentPrompt: parentPrompt.cancelParentPrompt }
}
