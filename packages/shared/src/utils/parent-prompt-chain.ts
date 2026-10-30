import type { NormalizedHabit } from '../types/habit'
import {
  computeParentPromptProgress,
  computeParentSettlementDecision,
  type HabitResolution,
  type HabitResolutionMode,
  type ParentPromptProgressOptions,
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

export function computeParentPromptChain(
  childId: string,
  habitsById: ReadonlyMap<string, NormalizedHabit>,
  date: string,
  options: Omit<ParentPromptProgressOptions, 'parentId'>,
): ParentPromptAncestor[] {
  const ancestors: ParentPromptAncestor[] = []
  const resolvedModes = new Map(options.resolvedModes)
  let parentId = habitsById.get(childId)?.parentId
  while (parentId) {
    const parent = habitsById.get(parentId) ?? null
    const mode = computeParentSettlementDecision(parent, computeParentPromptProgress({
      ...options, parentId, resolvedModes,
    }), date)
    if (!parent || !mode) break
    ancestors.push({ habit: parent, mode })
    resolvedModes.set(parent.id, mode)
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
  log: (items: { habitId: string; date: string }[]) => Promise<ParentPromptBulkOutcome>
  skip: (items: { habitId: string; date: string }[]) => Promise<ParentPromptBulkOutcome>
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
    const outcome = await options[mode](batch.map(({ habit }) => ({ habitId: habit.id, date: options.date })))
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
