import type { NormalizedHabit } from '../types/habit'
import type { ParentPromptContinuation } from '../types/sync'
import {
  computeParentPromptProgress,
  computeParentSettlementDecision,
  type HabitResolution,
  type HabitResolutionMode,
  type ParentPromptProgressOptions,
  type ParentPromptProgress,
} from './habit-list-progress'

export interface ParentPromptAncestor {
  habit: NormalizedHabit
  mode: HabitResolutionMode
}

export interface ParentPromptChain {
  childId: string
  habit: NormalizedHabit
  mode: HabitResolutionMode
  date: string
  ancestors: ParentPromptAncestor[]
  selectedCount: number
}

function parentPromptResolutionContext(
  habitsById: ReadonlyMap<string, NormalizedHabit>,
  options: Omit<ParentPromptProgressOptions, 'parentId'>,
  resolutionSources: ReadonlyMap<string, ParentPromptAncestor>,
) {
  const retained = [...resolutionSources.values()].filter(({ habit }) => !habitsById.has(habit.id))
  const knownHabits = new Map([...retained.map(({ habit }) => [habit.id, habit] as const), ...habitsById])
  const resolvedModes = new Map([
    ...retained.map(({ habit, mode }) => [habit.id, mode] as const),
    ...options.resolvedModes ?? [],
  ])
  const getChildren = (id: string) => [
    ...options.getChildren(id), ...retained.filter(({ habit }) => habit.parentId === id).map(({ habit }) => habit),
  ]
  return { knownHabits, progress: { ...options, resolvedModes, getChildren } }
}

export function computeParentResolutionProgress(
  parentId: string,
  habitsById: ReadonlyMap<string, NormalizedHabit>,
  options: Omit<ParentPromptProgressOptions, 'parentId'>,
  resolutionSources: ReadonlyMap<string, ParentPromptAncestor>,
): ParentPromptProgress {
  const { progress } = parentPromptResolutionContext(habitsById, options, resolutionSources)
  return computeParentPromptProgress({ ...progress, parentId })
}

export function computeParentPromptChain(
  childId: string,
  habitsById: ReadonlyMap<string, NormalizedHabit>,
  date: string,
  options: Omit<ParentPromptProgressOptions, 'parentId'>,
  resolutionSources: ReadonlyMap<string, ParentPromptAncestor> = new Map(),
): ParentPromptAncestor[] {
  const { knownHabits, progress } = parentPromptResolutionContext(habitsById, options, resolutionSources)
  if (knownHabits.get(childId)?.isBadHabit) return []
  const ancestors: ParentPromptAncestor[] = []
  let parentId = knownHabits.get(childId)?.parentId
  while (parentId) {
    const parent = knownHabits.get(parentId) ?? null
    const mode = computeParentSettlementDecision(parent, computeParentPromptProgress({ ...progress, parentId }), date)
    if (!parent || !mode) break
    ancestors.push({ habit: parent, mode })
    progress.resolvedModes.set(parent.id, mode)
    parentId = parent.parentId
  }
  return ancestors
}

export function selectParentPromptAncestor(
  prompt: ParentPromptChain,
  index: number,
  checked: boolean,
): ParentPromptChain {
  return { ...prompt, selectedCount: checked ? index + 1 : index }
}

interface ParentPromptBulkOutcome {
  results: readonly { habitId: string; status: string }[]
  queuedIds?: readonly string[]
  ambiguousIds?: readonly string[]
  offlineFailureIds?: readonly string[]
}

interface ParentPromptSettlementOptions {
  date: string
  log: (items: { habitId: string; date: string }[], continuation: ParentPromptContinuation) => Promise<ParentPromptBulkOutcome>
  skip: (items: { habitId: string; date: string }[], continuation: ParentPromptContinuation) => Promise<ParentPromptBulkOutcome>
  isCurrent: () => boolean
  onSettled: (resolution: HabitResolution) => void
}

export async function settleParentPromptChain(
  ancestors: readonly ParentPromptAncestor[],
  options: ParentPromptSettlementOptions,
): Promise<string[]> {
  for (let index = 0; index < ancestors.length;) {
    if (!options.isCurrent()) return []
    const mode = ancestors[index]!.mode
    const batch: ParentPromptAncestor[] = []
    while (index < ancestors.length && ancestors[index]!.mode === mode) batch.push(ancestors[index++]!)
    const continuation = ancestors.slice(index).map(({ habit, mode }) => ({ habitId: habit.id, date: options.date, mode }))
    const outcome = await options[mode](batch.map(({ habit }) => ({ habitId: habit.id, date: options.date })), continuation)
    if (!options.isCurrent()) return []
    const unconfirmed = new Set([
      ...outcome.queuedIds ?? [], ...outcome.ambiguousIds ?? [], ...outcome.offlineFailureIds ?? [],
    ])
    const successfulIds = new Set(outcome.results.filter((item) => item.status === 'Success' && !unconfirmed.has(item.habitId)).map((item) => item.habitId))
    for (const { habit } of batch) {
      if (successfulIds.has(habit.id)) options.onSettled({ habitId: habit.id, mode })
    }
    const failedIds = batch.filter(({ habit }) => !successfulIds.has(habit.id)).map(({ habit }) => habit.id)
    if (failedIds.length > 0) return failedIds
  }
  return []
}
