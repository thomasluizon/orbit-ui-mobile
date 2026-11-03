import { buildChildrenIndex } from '../utils/habit-normalization'
import { getChildrenFromIndex } from '../utils/habit-visibility'
import { getPersistedHabitResolution } from '../utils/habit-list-progress'
import { canLogHabitOnDate,getFriendlyErrorMessage,computeParentPromptChain,selectParentPromptAncestor,settleParentPromptChain,type ParentPromptChain,computeParentPromptDecision,computeParentResolutionProgress,formatAPIDateInTimeZone,getTodayBoundary,hasAncestorInSet,type HabitResolution,type HabitResolutionMode,type ParentPromptProgressOptions } from '../utils'
import type { NormalizedHabit } from '../types/habit'
import type { Profile } from '../types/profile'
import type { StateHook,StateSetter } from './state-adapter'

interface Current<Value> { current: Value }

export interface ParentPromptInputs {
  selectedDateStr: string
  selectedDate?: Date
  profile: Pick<Profile, 'timeZone'> | null | undefined
  getChildren: ParentSettlementData['getChildren']
  habitsById: Map<string, NormalizedHabit>
  additionalHabitsById?: ReadonlyMap<string, NormalizedHabit>
  visibility: ParentSettlementData['visibility']
  view: 'today' | 'all' | 'general'
  updatedAt: number
  logHabit: (input: { habitId: string; date?: string; intent: 'log' | 'unlog' }) => Promise<unknown>
  skipHabit: (input: { habitId: string; date?: string; onUndo?: () => void }) => Promise<unknown>
  bulkLog: Parameters<typeof settleParentPromptChain>[1]['log']
  bulkSkip: Parameters<typeof settleParentPromptChain>[1]['skip']
  markRecentlyCompleted: (habitId: string, date?: string) => void
  clearRecentlyCompleted: (habitId: string, date?: string) => void
  showError: (message: string) => void
  t: (key: string, values?: Record<string, string | number | Date>) => string
  refetch: () => Promise<unknown>
  toggleKey: (habitId: string, date: string) => string
}

interface ParentPromptContext extends ParentPromptInputs {
  promptDataRef: Current<ParentSettlementData | null>
  promptedParentIdsRef: Current<Set<string>>
  confirmedResolutionsRef: Current<ConfirmedResolutionRecord>
  pendingToggleHabitIdsRef: Current<Set<string>>
  parentPrompt: ParentPromptChain | null
  setParentPromptQueue: StateSetter<ParentPromptQueue>
}

export interface ParentSettlementData {
  getChildren: (id: string) => NormalizedHabit[]
  visibility: Pick<ParentPromptProgressOptions, 'isRelevantToday' | 'isDueOnSelectedDate'>
  habitsById: Map<string, NormalizedHabit>
  selectedDateStr: string
  isListView: boolean
  updatedAt: number
}

function createParentSettlementData(inputs: ParentPromptInputs): ParentSettlementData {
  const { habitsById, getChildren, visibility, selectedDateStr, view, additionalHabitsById } = inputs
  if (!additionalHabitsById?.size) return { habitsById, getChildren, visibility, selectedDateStr, isListView: view !== 'today', updatedAt: inputs.updatedAt }
  const knownHabits = new Map([...additionalHabitsById, ...habitsById])
  const childrenByParent = buildChildrenIndex(knownHabits)
  return {
    habitsById: knownHabits,
    getChildren: id => getChildrenFromIndex(id, knownHabits, childrenByParent),
    visibility, selectedDateStr, isListView: view !== 'today', updatedAt: inputs.updatedAt,
  }
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
  if (!settlementData) return { done: 0, total: 0, loggedDone: 0, slippedDone: 0 }
  return computeParentResolutionProgress(habitId, settlementData.habitsById, {
    getChildren: settlementData.getChildren,
    isRelevantToday: settlementData.visibility.isRelevantToday,
    isDueOnSelectedDate: settlementData.visibility.isDueOnSelectedDate,
    skippedIds: confirmedResolutions.skippedIds,
    isListView: settlementData.isListView,
    resolvedModes: confirmedResolutions.modes,
  }, confirmedResolutions.sources)
}

function getParentPromptChain(childId: string, record: ConfirmedResolutionRecord, settlement: ParentSettlementData, deferBadParentSlips = false) {
  return computeParentPromptChain(childId, settlement.habitsById, settlement.selectedDateStr, {
    getChildren: settlement.getChildren,
    isRelevantToday: settlement.visibility.isRelevantToday,
    isDueOnSelectedDate: settlement.visibility.isDueOnSelectedDate,
    isListView: settlement.isListView,
    skippedIds: record.skippedIds,
    resolvedModes: record.modes,
  }, record.sources, deferBadParentSlips)
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

export function refreshConfirmedResolutions(
  confirmedResolutions: ConfirmedResolutionRecord,
  habitsById: ReadonlyMap<string, NormalizedHabit>,
) {
  clearPersistedResolutions(confirmedResolutions, habitsById)
}

export function createConfirmedResolutionRecord(date: string): ConfirmedResolutionRecord {
  return {
    date,
    sources: new Map(),
    pending: new Map(),
    modes: new Map(),
    skippedIds: new Set(),
    afterRefetch: [],
  }
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
  deferBadParentSlips = false,
) {
  const { promptedParentIdsRef, setParentPromptQueue } = context

  if (!settlementData) return
  const child = settlementData.habitsById.get(childHabitId)
  if (!child?.parentId) return
  const parent = settlementData.habitsById.get(child.parentId)
  if (!parent) return
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
  if (decision.type !== 'release') {
    const ancestors = getParentPromptChain(childHabitId, confirmedResolutions, settlementData, deferBadParentSlips)
    const first = ancestors[0]
    if (!first || promptedParentIdsRef.current.has(first.habit.id)) return
    for (const { habit } of ancestors) promptedParentIdsRef.current.add(habit.id)
    setParentPromptQueue((current) => transitionParentPromptQueue(current, {
      type: 'enqueue', prompt: {
        childId: childHabitId,
        ancestors,
        selectedCount: 1,
        habit: first.habit,
        mode: first.mode,
        date: settlementData.selectedDateStr,
      }
    }))
  } else {
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
  if (decision.type === 'release') return
  const first = getParentPromptChain(childHabitId, operation.confirmedResolutions, operation.data)[0]
  if (!first || promptedParentIdsRef.current.has(first.habit.id)) return
  const { mode } = first

  if (mode === 'log' && operation.requiresLogConfirmation) {
    checkAndSettleParent(context, childHabitId, operation.confirmedResolutions, operation.data)
    return
  }

  promptedParentIdsRef.current.add(first.habit.id)
  void settleCompletedParent(context, first.habit.id, mode, operation)
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
  if (mode === 'log') markRecentlyCompleted(parentId, operation.date)
  try {
    if (mode === 'skip') {
      await skipHabit({ habitId: parentId, date: operation.date })
    } else {
      await logHabit({
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
  const settle = (settlement: ParentSettlementData) => settleParentAutomatically(context, parentId, { ...operation, data: settlement })
  if (mode === 'log' && operation.data.habitsById.get(parentId)?.isBadHabit) {
    await refetchParentSettlement(context, operation.confirmedResolutions, settle)
  } else settle(promptDataRef.current)
}

function afterParentRefetch(context: ParentPromptContext, record: ConfirmedResolutionRecord, updatedAt: number, settle: (settlement: ParentSettlementData) => void) {
  const settlement = context.promptDataRef.current
  if (context.confirmedResolutionsRef.current !== record || settlement?.selectedDateStr !== record.date) return
  if (settlement.updatedAt === updatedAt) record.afterRefetch.push({ updatedAt, settle })
  else settle(settlement)
}

async function refetchParentSettlement(context: ParentPromptContext, record: ConfirmedResolutionRecord, settle: (settlement: ParentSettlementData) => void) {
  const updatedAt = context.promptDataRef.current?.updatedAt ?? context.updatedAt
  try {
    await context.refetch()
    afterParentRefetch(context, record, updatedAt, settle)
  } catch (error) {
    context.showError(getFriendlyErrorMessage(error, context.t, 'common.error'))
  }
}

function checkAndPromptParentLog(context: ParentPromptContext, childHabitId: string, optimistic = false) {
  const { confirmedResolutionsRef, promptDataRef } = context

  const confirmedResolutions = confirmedResolutionsRef.current
  recordHabitResolution(context, confirmedResolutions, childHabitId, 'log')
  const habit = promptDataRef.current?.habitsById.get(childHabitId)
  if (habit?.isCompleted || habit?.isLoggedInRange) confirmedResolutions.modes.delete(childHabitId)
  if (!optimistic && habit?.isBadHabit && habit.parentId && promptDataRef.current?.habitsById.get(habit.parentId)?.isBadHabit) {
    void refetchParentSettlement(context, confirmedResolutions, settlement => checkAndSettleParent(context, childHabitId, confirmedResolutions, settlement))
  } else {
    checkAndSettleParent(context, childHabitId, confirmedResolutions, promptDataRef.current, optimistic)
  }
}

function settleBulkHabitResolutions(context: ParentPromptContext, resolutions: readonly HabitResolution[], date: string, settleParents = true) {
  const { promptDataRef, markRecentlyCompleted, selectedDateStr, confirmedResolutionsRef } = context

  const settlementData = promptDataRef.current
  if (!settlementData) return
  for (const resolution of resolutions) {
    if (resolution.mode === 'log') markRecentlyCompleted(resolution.habitId, date)
  }
  if (selectedDateStr !== date || settlementData.selectedDateStr !== date) return
  const confirmedResolutions = confirmedResolutionsRef.current
  const habitsById = settlementData.habitsById
  const resolvedIds = new Set(resolutions.map((resolution) => resolution.habitId))
  for (const resolution of resolutions) {
    recordHabitResolution(context,
      confirmedResolutions,
      resolution.habitId,
      resolution.mode,
    )
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
  const settle = (currentSettlement: ParentSettlementData) => {
    const operation: ParentSettlementOperation = {
      data: currentSettlement, date, confirmedResolutions, requiresLogConfirmation: false,
    }
    for (const childId of childIdByAffectedParent.values()) settleParentAutomatically(context, childId, operation)
  }
  if (resolutions.some(({ habitId, mode }) => mode === 'log' && habitsById.get(habitId)?.isBadHabit)) {
    void refetchParentSettlement(context, confirmedResolutions, settle)
  } else settle(settlementData)
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
  recordHabitResolution(context, record, habitId, 'skip')
  checkAndSettleParent(context, habitId, record)
  try {
    const mutation = skipHabit({
      habitId, date: record.date,
      onUndo: () => releaseOptimisticResolution(habitId, record, habit.parentId),
    })
    record.pending.set(habitId, Promise.resolve(mutation).then(() => true, () => false))
    await mutation
  } catch {
    releaseOptimisticResolution(habitId, record, habit.parentId)
  } finally {
    record.pending.delete(habitId)
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
  const settledIds = new Set<string>()
  try {
    const selectedIds = new Set(prompt.ancestors.slice(0, prompt.selectedCount).map(({ habit }) => habit.id))
    const knownHabits = new Map([...record.sources].map(([id, { habit }]) => [id, habit] as const).concat([...settlementData.habitsById]))
    const pendingChildren = [...record.pending].filter(([id]) => hasAncestorInSet(id, knownHabits, selectedIds)).map(([, write]) => write)
    if ((await Promise.all(pendingChildren)).some((success) => !success) || !isCurrent()) return
    const currentSettlement = promptDataRef.current ?? settlementData
    const ancestors = getParentPromptChain(prompt.childId, record, currentSettlement).filter(({ habit }) => selectedIds.has(habit.id))
    if (prompt.ancestors.slice(0, prompt.selectedCount).some(({ habit }) =>
      !ancestors.some(ancestor => ancestor.habit.id === habit.id) &&
      !getPersistedHabitResolution(currentSettlement.habitsById.get(habit.id) ?? habit))) return
    const failedIds = await settleParentPromptChain(ancestors, {
      date: prompt.date,
      log: (items, continuation) => bulkLog(items, continuation),
      skip: (items, continuation) => bulkSkip(items, continuation),
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

  void checkAndPromptParentLog(context, habitId, true)
}

async function handleDirectToggle(context: ParentPromptContext, habit: NormalizedHabit, intent: 'log' | 'unlog') {
  const { profile, selectedDateStr, selectedDate, pendingToggleHabitIdsRef, confirmedResolutionsRef, markRecentlyCompleted, logHabit, refetch, toggleKey } = context

  if (!profile) return
  const currentDate = new Date()
  const accountToday = formatAPIDateInTimeZone(currentDate, profile.timeZone)
  const boundary = getTodayBoundary(selectedDateStr, accountToday)
  const habitId = habit.id
  if (boundary === 'read-only' || (!selectedDate && selectedDateStr !== accountToday) ||
    (boundary === 'future' && !canLogHabitOnDate(habit, selectedDateStr, accountToday))) return
  const pendingHabitIds = pendingToggleHabitIdsRef.current
  const key = toggleKey(habitId, selectedDateStr)
  if (pendingHabitIds.has(key)) return

  pendingHabitIds.add(key)
  const confirmedResolutions = confirmedResolutionsRef.current
  if (intent === 'log') {
    markRecentlyCompleted(habitId)
    handleLogged(context, habitId, false)
  }
  let mutationSucceeded = false

  try {
    const mutation = logHabit(
      selectedDate ? { habitId, date: selectedDateStr, intent } : { habitId, intent },
    )
    confirmedResolutions.pending.set(habitId, Promise.resolve(mutation).then(() => true, () => false))
    await mutation
    mutationSucceeded = true
    if (intent === 'unlog') releaseParentResolution(context, habitId, confirmedResolutions, habit.parentId)
    const updatedAt = context.promptDataRef.current?.updatedAt ?? context.updatedAt
    await refetch()
    if (intent === 'log' && habit.isBadHabit && confirmedResolutionsRef.current === confirmedResolutions) {
      afterParentRefetch(context, confirmedResolutions, updatedAt, settlement => checkAndSettleParent(context, habitId, confirmedResolutions, settlement))
    }
  } catch {
    if (!mutationSucceeded && intent === 'log') releaseParentResolution(context, habitId, confirmedResolutions, habit.parentId)
  } finally {
    confirmedResolutions.pending.delete(habitId)
    pendingHabitIds.delete(key)
  }
}

function createParentPromptController(context: Current<ParentPromptContext>) {
  const bind = <Arguments extends unknown[], Result>(action: (context: ParentPromptContext, ...arguments_: Arguments) => Result) =>
    (...arguments_: Arguments) => action(context.current, ...arguments_)
  return {
    cancelParentPrompt: bind(cancelParentPrompt), checkAndPromptParentLog: bind(checkAndPromptParentLog),
    settleBulkHabitResolutions: bind(settleBulkHabitResolutions), skipFromRow: bind(skipFromRow),
    confirmParentSettlement: bind(confirmParentSettlement), selectParentAncestor: bind(selectParentAncestor),
    handleDirectToggle: bind(handleDirectToggle),
  }
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
    afterRefetch: { updatedAt: number; settle: (settlement: ParentSettlementData) => void }[]
  }
}

export type ParentPromptQueue = Pick<ParentPromptState, 'date' | 'prompts'>

export type ConfirmedResolutionRecord = ParentPromptState['confirmed']

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


interface ParentPromptAdapters {
  useState: StateHook
  useRef: <Value>(value: Value) => Current<Value>
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => void
  useLayoutEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => void
  useResetOnAccountChange: (reset: () => void) => void
}

export function createUseParentPromptQueue({ useState, useRef, useEffect, useLayoutEffect, useResetOnAccountChange }: ParentPromptAdapters) {
  return function useParentPromptQueue(inputs: ParentPromptInputs) {
    const { selectedDateStr, getChildren, visibility, habitsById, additionalHabitsById, view, updatedAt } = inputs
    const pendingToggleHabitIdsRef = useRef(new Set<string>())
    const promptedParentIdsRef = useRef(new Set<string>())
    const confirmedResolutionsRef = useRef(createConfirmedResolutionRecord(selectedDateStr))
    const promptDataRef = useRef<ParentSettlementData | null>(null)
    const [queue, setParentPromptQueue] = useState(() => createParentPromptQueue(selectedDateStr))
    const parentPrompt = getCurrentParentPrompt(queue, selectedDateStr)
    useResetOnAccountChange(() => {
      pendingToggleHabitIdsRef.current.clear()
      promptedParentIdsRef.current.clear()
      confirmedResolutionsRef.current = createConfirmedResolutionRecord(selectedDateStr)
      promptDataRef.current = null
      setParentPromptQueue(createParentPromptQueue(selectedDateStr))
    })
    useEffect(() => {
      promptedParentIdsRef.current.clear()
      confirmedResolutionsRef.current = createConfirmedResolutionRecord(selectedDateStr)
    }, [selectedDateStr])
    useLayoutEffect(() => {
      promptDataRef.current = createParentSettlementData(inputs)
    }, [getChildren, visibility, habitsById, additionalHabitsById, selectedDateStr, view, updatedAt])
    useLayoutEffect(() => {
      const record = confirmedResolutionsRef.current
      refreshConfirmedResolutions(record, promptDataRef.current?.habitsById ?? habitsById)
      for (const id of promptedParentIdsRef.current) {
        const decision = computeParentPromptDecision(promptDataRef.current?.habitsById.get(id) ?? null,
          getParentPromptProgress(id, record, promptDataRef.current), selectedDateStr, promptedParentIdsRef.current)
        if (decision.type === 'release') promptedParentIdsRef.current.delete(id)
      }
    }, [updatedAt, parentPrompt !== null, selectedDateStr, additionalHabitsById])
    const context = { ...inputs, promptDataRef, promptedParentIdsRef,
      confirmedResolutionsRef, pendingToggleHabitIdsRef, parentPrompt, setParentPromptQueue }
    const latestContext = useRef(context)
    useLayoutEffect(() => { latestContext.current = context }, [context])
    useLayoutEffect(() => {
      const record = confirmedResolutionsRef.current
      const pending = record.afterRefetch.splice(0)
      for (const operation of pending) afterParentRefetch(latestContext.current, record, operation.updatedAt, operation.settle)
    }, [updatedAt])
    const [controller] = useState(() => createParentPromptController(latestContext))
    return { parentPrompt, ...controller }
  }
}
