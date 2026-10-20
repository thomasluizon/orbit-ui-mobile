import { MAX_BULK_OPERATION_SIZE } from '../api/constants'
import type { BulkMoveHabitParentResult, NormalizedHabit } from '../types/habit'
import { getSharedMoveParentId } from '../utils/move-parent'

export interface MoveParentState {
  open: boolean
  bulkIds: string[] | null
  habitId: string | null
  selectedParentId: string | null | undefined
  pending: boolean
  error: string | null
}

export function createMoveParentState(): MoveParentState {
  return { open: false, bulkIds: null, habitId: null, selectedParentId: null, pending: false, error: null }
}

interface MoveParentActionsOptions {
  state: MoveParentState
  applyState: (updater: (previous: MoveParentState) => MoveParentState) => void
  habitsById: ReadonlyMap<string, NormalizedHabit>
  selectedHabitIds: ReadonlySet<string> | undefined
  canSubmit: boolean
  moveSingle: (habitId: string, parentId: string | null) => Promise<unknown>
  moveBulk?: (habitIds: string[], parentId: string | null) => Promise<BulkMoveHabitParentResult | undefined>
  partialError: string
  formatError: (error: unknown) => string
}

interface MoveParentActions {
  openBulk: () => void
  openSingle: (habitId: string) => void
  close: () => void
  select: (selectedParentId: string | null) => void
  confirm: () => Promise<boolean>
}

export function createMoveParentActions(options: MoveParentActionsOptions): MoveParentActions {
  const { applyState, habitsById, selectedHabitIds, moveBulk } = options
  return {
    openBulk: () => {
      const ids = Array.from(selectedHabitIds ?? [])
      if (ids.length === 0 || ids.length > MAX_BULK_OPERATION_SIZE || !moveBulk) return
      applyState(() => ({ ...createMoveParentState(), open: true, bulkIds: ids, selectedParentId: getSharedMoveParentId(habitsById, ids) }))
    },
    openSingle: (habitId: string) => {
      const habit = habitsById.get(habitId)
      if (!habit) return
      applyState(() => ({ ...createMoveParentState(), open: true, habitId, selectedParentId: habit.parentId }))
    },
    close: () => { applyState(createMoveParentState) },
    select: (selectedParentId: string | null) => { applyState((previous) => ({ ...previous, selectedParentId })) },
    confirm: () => confirmMoveParent(options),
  }
}

async function confirmMoveParent({ state, applyState, canSubmit, moveSingle, moveBulk, partialError, formatError }: MoveParentActionsOptions) {
  if (!canSubmit || state.selectedParentId === undefined) return false
  applyState((previous) => ({ ...previous, pending: true, error: null }))
  try {
    if (state.bulkIds && moveBulk) {
      const result = await moveBulk(state.bulkIds, state.selectedParentId)
      if (!result) return false
      const failedIds = getFailedBulkHabitIds(result.results)
      if (failedIds.length > 0) {
        applyState((previous) => ({ ...previous, bulkIds: failedIds, error: partialError }))
        return false
      }
    } else if (state.habitId) {
      await moveSingle(state.habitId, state.selectedParentId)
    }
    return true
  } catch (error) {
    applyState((previous) => ({ ...previous, error: formatError(error) }))
    return false
  } finally {
    applyState((previous) => ({ ...previous, pending: false }))
  }
}

export function getFailedBulkHabitIds(results: readonly { status: string; habitId: string }[]): string[] {
  return results.flatMap((result) => result.status === 'Failed' ? [result.habitId] : [])
}

export interface BulkMoveParentCallbacks {
  mutate: (input: { habitIds: string[]; parentId: string | null }) => Promise<BulkMoveHabitParentResult>
  getAccountGeneration: () => number
  onSuccess: () => void
  onPartialFailure: (failedIds: string[]) => void
}

export async function executeBulkMoveParent(
  habitIds: string[],
  parentId: string | null,
  { mutate, getAccountGeneration, onSuccess, onPartialFailure }: BulkMoveParentCallbacks,
): Promise<BulkMoveHabitParentResult | undefined> {
  const generation = getAccountGeneration()
  const result = await mutate({ habitIds, parentId })
  if (getAccountGeneration() !== generation) return
  const failedIds = getFailedBulkHabitIds(result.results)
  if (failedIds.length > 0) onPartialFailure(failedIds)
  else onSuccess()
  return result
}
