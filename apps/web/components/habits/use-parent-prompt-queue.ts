'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { canLogHabitOnDate, getFriendlyErrorMessage, computeParentPromptChain, selectParentPromptAncestor, settleParentPromptChain, type ParentPromptChain, computeParentPromptDecision, computeParentResolutionProgress, formatAPIDateInTimeZone, getTodayBoundary, hasAncestorInSet, type HabitResolution, type HabitResolutionMode } from '@orbit/shared/utils'
import type { HabitView } from './habit-list/tree-helpers'
import { EMPTY_HABITS_BY_ID } from '@/hooks/use-habit-queries'
import type { useHabitVisibility } from '@/hooks/use-habit-visibility'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useAccountScopedState, useResetOnAccountChange } from '@/hooks/use-session-reset'
import type { useHabitListQueries, useHabitListVisibility, useHabitRecentCompletions } from './use-habit-list-state'

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

type ParentPromptStateInputs = Pick<ReturnType<typeof useHabitListQueries>, 'selectedDateStr'>

function useParentPromptState({ selectedDateStr }: ParentPromptStateInputs) {
  const pendingToggleHabitIdsRef = useRef(new Set<string>())
  const promptedParentIdsRef = useRef(new Set<string>())
  const confirmedResolutionsRef = useRef(
    createConfirmedResolutionRecord(selectedDateStr),
  )
  const [parentPromptQueue, setParentPromptQueue] = useAccountScopedState<ParentPromptQueue>(() => ({
    date: selectedDateStr,
    prompts: [],
  }))
  const parentPrompt = getCurrentParentPrompt(parentPromptQueue, selectedDateStr)
  const hasQueuedParentPrompt = parentPrompt !== null
  const promptDataRef = useRef<ParentSettlementData | null>(null)

  useResetOnAccountChange(() => {
    pendingToggleHabitIdsRef.current.clear()
    promptedParentIdsRef.current.clear()
    confirmedResolutionsRef.current = createConfirmedResolutionRecord(selectedDateStr)
    promptDataRef.current = null
    setParentPromptQueue((queue) => transitionParentPromptQueue(queue, { type: 'clear', date: selectedDateStr }))
  })
  return { promptedParentIdsRef, confirmedResolutionsRef, promptDataRef, hasQueuedParentPrompt, pendingToggleHabitIdsRef, parentPrompt, setParentPromptQueue }
}

type ParentPromptDateResetInputs = Pick<ReturnType<typeof useParentPromptState>, 'promptedParentIdsRef' | 'confirmedResolutionsRef'> & Pick<ReturnType<typeof useHabitListQueries>, 'selectedDateStr'>

function useParentPromptDateReset({ promptedParentIdsRef, confirmedResolutionsRef, selectedDateStr }: ParentPromptDateResetInputs) {
  useEffect(() => {
    promptedParentIdsRef.current.clear()
    confirmedResolutionsRef.current = createConfirmedResolutionRecord(selectedDateStr)
  }, [confirmedResolutionsRef, promptedParentIdsRef, selectedDateStr])

}

type ParentPromptDataInputs = Pick<ReturnType<typeof useParentPromptState>, 'promptDataRef'> & Pick<ReturnType<typeof useHabitListQueries>, 'getChildren' | 'habitsById' | 'selectedDateStr'> & Pick<ReturnType<typeof useHabitListVisibility>, 'visibility'> & { view: HabitView }

function useParentPromptData({ promptDataRef, getChildren, visibility, habitsById, selectedDateStr, view }: ParentPromptDataInputs) {
  useLayoutEffect(() => {
    promptDataRef.current = {
      getChildren,
      visibility,
      habitsById,
      selectedDateStr,
      isListView: view !== 'today',
    }
    // react-doctor-disable-next-line exhaustive-deps -- getChildren and habitsById are aliased from the query result every render and already listed; the effect only mirrors the current render values into a ref, so no staleness is possible https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [getChildren, visibility, habitsById, selectedDateStr, view, promptDataRef])

}

type ParentPromptRefreshInputs = Pick<ReturnType<typeof useParentPromptState>, 'confirmedResolutionsRef' | 'hasQueuedParentPrompt' | 'promptDataRef' | 'promptedParentIdsRef'> & Pick<ReturnType<typeof useHabitListQueries>, 'selectedDateStr' | 'habitsQuery'>

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
      if (decision.type === 'release') promptedParentIdsRef.current.delete(parentId)
    }
  }, [confirmedResolutionsRef, habitsQuery.dataUpdatedAt, hasQueuedParentPrompt, promptDataRef, promptedParentIdsRef, selectedDateStr])

}

function recordHabitResolution(context: ParentPromptContext,
  confirmedResolutions: ConfirmedResolutionRecord,
  habitId: string,
  mode: HabitResolutionMode,
) {
  const { promptDataRef } = context

  const habit = promptDataRef.current?.habitsById.get(habitId)
  if (habit) confirmedResolutions.sources.set(habitId, { habit, mode })
  confirmedResolutions.modes.set(habitId, mode)
  if (mode === 'skip') {
    confirmedResolutions.skippedIds.add(habitId)
  } else {
    confirmedResolutions.skippedIds.delete(habitId)
  }
}

function finishParentSettlement(context: ParentPromptContext, confirmedResolutions: ConfirmedResolutionRecord) {
  confirmedResolutions.activeSettlements -= 1
  if (confirmedResolutions.activeSettlements === 0 && confirmedResolutions.clearWhenIdle) {
    confirmedResolutions.sources.clear()
    confirmedResolutions.modes.clear()
    confirmedResolutions.skippedIds.clear()
    confirmedResolutions.clearWhenIdle = false
  }
}

function settlementDateIsReadOnly(context: ParentPromptContext, date: string): boolean {
  const { profile } = context

  return !profile || getTodayBoundary(
    date,
    formatAPIDateInTimeZone(new Date(), profile.timeZone),
  ) === 'read-only'
}

function checkAndSettleParent(context: ParentPromptContext,
  childHabitId: string,
  confirmedResolutions: ConfirmedResolutionRecord,
  settlementData: ParentSettlementData | null = context.promptDataRef.current,
) {
  const { promptedParentIdsRef, setParentPromptQueue } = context

  if (!settlementData) return
  const child = settlementData.habitsById.get(childHabitId)
  if (!child?.parentId) return
  const parent = settlementData.habitsById.get(child.parentId)
  if (!parent || parent.isCompleted) return
  if (settlementDateIsReadOnly(context, settlementData.selectedDateStr)) {
    promptedParentIdsRef.current.delete(parent.id)
    setParentPromptQueue((current) => transitionParentPromptQueue(current, { type: 'remove', habitId: parent.id, date: settlementData.selectedDateStr }))
    return
  }

  const decision = computeParentPromptDecision(
    parent,
    getParentPromptProgress(parent.id, confirmedResolutions, settlementData),
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
        habit: parent,
        mode: decision.mode,
        date: settlementData.selectedDateStr,
      }
    }))
  } else if (decision.type === 'release') {
    promptedParentIdsRef.current.delete(parent.id)
    setParentPromptQueue((current) => transitionParentPromptQueue(current, { type: 'remove', habitId: parent.id, date: settlementData.selectedDateStr }))
  }
}

function settleParentAutomatically(context: ParentPromptContext,
  childHabitId: string,
  operation: ParentSettlementOperation,
) {
  const { promptedParentIdsRef } = context

  const child = operation.data.habitsById.get(childHabitId)
  if (!child?.parentId) return
  const parent = operation.data.habitsById.get(child.parentId)
  if (!parent) return

  const decision = computeParentPromptDecision(
    parent,
    getParentPromptProgress(
      parent.id,
      operation.confirmedResolutions,
      operation.data,
    ),
    operation.date,
    promptedParentIdsRef.current,
  )
  if (decision.type === 'release') promptedParentIdsRef.current.delete(parent.id)
  if (decision.type !== 'open') return
  if (getParentPromptChain(childHabitId, operation.confirmedResolutions, operation.data).length === 0) return
  const { mode } = decision

  if (mode === 'log' && operation.requiresLogConfirmation) {
    checkAndSettleParent(context, childHabitId, operation.confirmedResolutions, operation.data)
    return
  }

  promptedParentIdsRef.current.add(parent.id)
  void settleCompletedParent(context, parent.id, mode, operation)
}

async function settleCompletedParent(context: ParentPromptContext,
  parentId: string,
  mode: HabitResolutionMode,
  operation: ParentSettlementOperation,
) {
  const { promptedParentIdsRef, markRecentlyCompleted, skipHabit, logHabit, confirmedResolutionsRef, clearRecentlyCompleted, promptDataRef } = context

  if (settlementDateIsReadOnly(context, operation.date)) {
    promptedParentIdsRef.current.delete(parentId)
    return
  }
  operation.confirmedResolutions.activeSettlements += 1
  if (mode === 'log') markRecentlyCompleted(parentId, operation.date)
  try {
    try {
      if (mode === 'skip') {
        await skipHabit.mutateAsync({ habitId: parentId, date: operation.date })
      } else {
        await logHabit.mutateAsync({
          habitId: parentId,
          date: operation.date,
          intent: 'log',
        })
      }
    } catch {
      if (confirmedResolutionsRef.current === operation.confirmedResolutions) {
        promptedParentIdsRef.current.delete(parentId)
        clearRecentlyCompleted(parentId, operation.date)
      }
      return
    }

    if (
      promptDataRef.current?.selectedDateStr !== operation.date ||
      confirmedResolutionsRef.current !== operation.confirmedResolutions
    ) return
    recordHabitResolution(context, operation.confirmedResolutions, parentId, mode)
    settleParentAutomatically(context, parentId, operation)
  } finally {
    finishParentSettlement(context, operation.confirmedResolutions)
  }
}

function checkAndPromptParentLog(context: ParentPromptContext, childHabitId: string) {
  const { confirmedResolutionsRef, promptDataRef } = context

  const confirmedResolutions = confirmedResolutionsRef.current
  recordHabitResolution(context, confirmedResolutions, childHabitId, 'log')
  const habit = promptDataRef.current?.habitsById.get(childHabitId)
  if (habit?.isCompleted || habit?.isLoggedInRange) confirmedResolutions.modes.delete(childHabitId)
  checkAndSettleParent(context, childHabitId, confirmedResolutions)
}

function settleBulkHabitResolutions(context: ParentPromptContext, resolutions: readonly HabitResolution[], date: string) {
  const { promptDataRef, markRecentlyCompleted, selectedDateStr, confirmedResolutionsRef, habitsById } = context

  const settlementData = promptDataRef.current
  if (!settlementData) return
  for (const resolution of resolutions) {
    if (resolution.mode === 'log') markRecentlyCompleted(resolution.habitId, date)
  }
  if (selectedDateStr !== date || settlementData.selectedDateStr !== date) return
  const confirmedResolutions = confirmedResolutionsRef.current
  const resolvedIds = new Set(resolutions.map((resolution) => resolution.habitId))
  for (const resolution of resolutions) {
    recordHabitResolution(context,
      confirmedResolutions,
      resolution.habitId,
      resolution.mode,
    )
  }

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
    settleParentAutomatically(context, childId, operation)
  }
}

async function skipFromRow(context: ParentPromptContext, habit: NormalizedHabit) {
const releaseOptimisticResolution = releaseParentResolution.bind(null, context)

  const { profile, selectedDateStr, confirmedResolutionsRef, skipHabit } = context

  if (!profile) return
  const accountToday = formatAPIDateInTimeZone(new Date(), profile.timeZone)
  const boundary = getTodayBoundary(selectedDateStr, accountToday)
  if (boundary === 'read-only' || !canLogHabitOnDate(habit, selectedDateStr, accountToday)) return
  const habitId = habit.id
  const record = confirmedResolutionsRef.current
  if (record.pending.has(habitId)) return
  record.activeSettlements += 1
  recordHabitResolution(context, record, habitId, 'skip')
  checkAndSettleParent(context, habitId, record)
  try {
    const mutation = skipHabit.mutateAsync({
      habitId, date: record.date,
      onUndo: () => releaseOptimisticResolution(habitId, record, habit.parentId),
    })
    record.pending.set(habitId, Promise.resolve(mutation).then(() => true, () => false))
    await mutation
  } catch {
    releaseOptimisticResolution(habitId, record, habit.parentId)
  } finally {
    record.pending.delete(habitId)
    finishParentSettlement(context, record)
  }
}

async function confirmParentSettlement(context: ParentPromptContext) {
  const { promptDataRef, confirmedResolutionsRef, parentPrompt, selectedDateStr, setParentPromptQueue, bulkLog, bulkSkip, markRecentlyCompleted, showError, t, promptedParentIdsRef } = context

  const settlementData = promptDataRef.current
  const record = confirmedResolutionsRef.current
  const prompt = parentPrompt
  if (!prompt || !settlementData || prompt.date !== selectedDateStr) return
  setParentPromptQueue((current) => transitionParentPromptQueue(current, { type: 'remove', habitId: prompt.habit.id, date: prompt.date }))
  const isCurrent = () => confirmedResolutionsRef.current === record &&
    promptDataRef.current?.selectedDateStr === prompt.date && !settlementDateIsReadOnly(context, prompt.date)
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
      log: (items) => bulkLog.mutateAsync(items),
      skip: (items) => bulkSkip.mutateAsync(items),
      isCurrent,
      onSettled: ({ habitId, mode }) => {
        settledIds.add(habitId)
        recordHabitResolution(context, record, habitId, mode)
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
    finishParentSettlement(context, record)
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

function handleLogged(context: ParentPromptContext, habitId: string, markAsRecentlyCompleted: boolean) {
  const { markRecentlyCompleted } = context

  if (markAsRecentlyCompleted) {
    markRecentlyCompleted(habitId)
  }

  checkAndPromptParentLog(context, habitId)
}

async function handleDirectToggle(context: ParentPromptContext, habit: NormalizedHabit, intent: 'log' | 'unlog') {
  const { profile, selectedDateStr, selectedDate, pendingToggleHabitIdsRef, confirmedResolutionsRef, markRecentlyCompleted, logHabit, habitsQuery } = context

  if (!profile) return
  const currentDate = new Date()
  const accountToday = formatAPIDateInTimeZone(currentDate, profile.timeZone)
  const boundary = getTodayBoundary(selectedDateStr, accountToday)
  const habitId = habit.id
  if (boundary === 'read-only' || (!selectedDate && selectedDateStr !== accountToday) ||
    (boundary === 'future' && !canLogHabitOnDate(habit, selectedDateStr, accountToday))) return
  const pendingHabitIds = pendingToggleHabitIdsRef.current
  if (pendingHabitIds.has(habitId)) return

  pendingHabitIds.add(habitId)
  const confirmedResolutions = confirmedResolutionsRef.current
  confirmedResolutions.activeSettlements += 1
  if (intent === 'log') {
    markRecentlyCompleted(habitId)
    handleLogged(context, habitId, false)
  }
  let mutationSucceeded = false

  try {
    const mutation = logHabit.mutateAsync(
      selectedDate ? { habitId, date: selectedDateStr, intent } : { habitId, intent },
    )
    confirmedResolutions.pending.set(habitId, Promise.resolve(mutation).then(() => true, () => false))
    await mutation
    mutationSucceeded = true
    await habitsQuery.refetch()
  } catch {
    if (!mutationSucceeded && intent === 'log') releaseParentResolution(context, habitId, confirmedResolutions, habit.parentId)
  } finally {
    confirmedResolutions.pending.delete(habitId)
    finishParentSettlement(context, confirmedResolutions)
    pendingHabitIds.delete(habitId)
  }
}

type ParentPromptContext = Pick<ReturnType<typeof useParentPromptState>, 'promptDataRef' | 'promptedParentIdsRef' | 'setParentPromptQueue' | 'confirmedResolutionsRef' | 'parentPrompt' | 'pendingToggleHabitIdsRef'> & Pick<ReturnType<typeof useHabitListQueries>, 'profile' | 'skipHabit' | 'logHabit' | 'selectedDateStr' | 'habitsById' | 'bulkLog' | 'bulkSkip' | 'showError' | 't' | 'selectedDate' | 'habitsQuery'> & Pick<ReturnType<typeof useHabitRecentCompletions>, 'markRecentlyCompleted' | 'clearRecentlyCompleted'>

function createParentPrompt(context: ParentPromptContext) {
  return { cancelParentPrompt: cancelParentPrompt.bind(null, context), checkAndPromptParentLog: checkAndPromptParentLog.bind(null, context), settleBulkHabitResolutions: settleBulkHabitResolutions.bind(null, context), skipFromRow: skipFromRow.bind(null, context), confirmParentSettlement: confirmParentSettlement.bind(null, context), selectParentAncestor: selectParentAncestor.bind(null, context), handleDirectToggle: handleDirectToggle.bind(null, context) }
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

type ParentPromptQueueInputs = Pick<ReturnType<typeof useHabitListQueries>, 'selectedDateStr' | 'getChildren' | 'habitsById' | 'habitsQuery' | 'profile' | 'skipHabit' | 'logHabit' | 'bulkLog' | 'bulkSkip' | 'showError' | 't' | 'selectedDate'> & Pick<ReturnType<typeof useHabitListVisibility>, 'visibility'> & { view: HabitView } & Pick<ReturnType<typeof useHabitRecentCompletions>, 'markRecentlyCompleted' | 'clearRecentlyCompleted'>

export function useParentPromptQueue(inputs: ParentPromptQueueInputs) {
  const parentPromptState = useParentPromptState({ ...inputs })
  useParentPromptDateReset({ ...parentPromptState, ...inputs })
  useParentPromptData({ ...parentPromptState, ...inputs })
  useParentPromptRefresh({ ...parentPromptState, ...inputs })
  const parentPrompt = createParentPrompt({ ...parentPromptState, ...inputs })
  return { parentPrompt: parentPromptState.parentPrompt, checkAndPromptParentLog: parentPrompt.checkAndPromptParentLog, settleBulkHabitResolutions: parentPrompt.settleBulkHabitResolutions, handleDirectToggle: parentPrompt.handleDirectToggle, skipFromRow: parentPrompt.skipFromRow, confirmParentSettlement: parentPrompt.confirmParentSettlement, selectParentAncestor: parentPrompt.selectParentAncestor, cancelParentPrompt: parentPrompt.cancelParentPrompt }
}
