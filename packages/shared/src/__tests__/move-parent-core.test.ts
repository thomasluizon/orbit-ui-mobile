import { describe, expect, it, vi } from 'vitest'
import { createMockHabit } from './factories'
import { createMoveParentActions, createMoveParentState, executeBulkMoveParent } from '../hooks/move-parent-core'
import type { BulkMoveHabitParentResult } from '../types/habit'

function outcome(failedIds: string[] = []): BulkMoveHabitParentResult {
  return { results: ['source', 'child', 'other'].map((habitId, index) => ({
    index, habitId, status: failedIds.includes(habitId) ? 'Failed' : 'Success', error: null, errorCode: null,
  })) }
}

function setup(selectedIds = ['source', 'child', 'other']) {
  const habits = selectedIds.map((id) => createMockHabit({ id, parentId: 'parent' }))
  let state = createMoveParentState()
  const moveSingle = vi.fn().mockResolvedValue(undefined)
  const moveBulk = vi.fn().mockResolvedValue(outcome())
  const actions = () => createMoveParentActions({
    state, applyState: (update) => { state = update(state) },
    habitsById: new Map(habits.map((habit) => [habit.id, habit])),
    selectedHabitIds: new Set(selectedIds), canSubmit: true,
    moveSingle, moveBulk, partialError: 'partial', formatError: () => 'network',
  })
  return { actions, getState: () => state, moveSingle, moveBulk }
}

describe('shared move parent state', () => {
  it('opens at the shared parent and submits three habits in one mutation', async () => {
    const flow = setup()
    flow.actions().openBulk()
    expect(flow.getState()).toMatchObject({ open: true, selectedParentId: 'parent', bulkIds: ['source', 'child', 'other'] })
    flow.actions().select('destination')
    expect(await flow.actions().confirm()).toBe(true)
    expect(flow.moveBulk).toHaveBeenCalledExactlyOnceWith(['source', 'child', 'other'], 'destination')
    expect(flow.moveSingle).not.toHaveBeenCalled()
    flow.actions().close()
    expect(flow.getState()).toEqual(createMoveParentState())
  })

  it.each([0, 101])('rejects an unsupported batch size of %i', (count) => {
    const flow = setup(Array.from({ length: count }, (_, index) => String(index)))
    flow.actions().openBulk()
    expect(flow.getState().open).toBe(false)
  })

  it('retains the destination and retries only failures after a partial move', async () => {
    const flow = setup()
    flow.moveBulk.mockResolvedValueOnce(outcome(['child']))
    flow.actions().openBulk()
    flow.actions().select(null)
    expect(await flow.actions().confirm()).toBe(false)
    expect(flow.getState()).toMatchObject({ open: true, bulkIds: ['child'], selectedParentId: null, error: 'partial', pending: false })
    expect(await flow.actions().confirm()).toBe(true)
    expect(flow.moveBulk).toHaveBeenLastCalledWith(['child'], null)
  })

  it('keeps the selection and destination on network failure and permits retry', async () => {
    const flow = setup()
    flow.moveBulk.mockRejectedValueOnce(new Error('offline'))
    flow.actions().openBulk()
    flow.actions().select('destination')
    expect(await flow.actions().confirm()).toBe(false)
    expect(flow.getState()).toMatchObject({ open: true, bulkIds: ['source', 'child', 'other'], selectedParentId: 'destination', error: 'network', pending: false })
    expect(await flow.actions().confirm()).toBe(true)
  })

  it('submits the single habit through its own adapter and clears bulk state on open', async () => {
    const flow = setup()
    flow.actions().openBulk()
    flow.actions().openSingle('source')
    flow.actions().select('destination')
    expect(flow.getState()).toMatchObject({ bulkIds: null, habitId: 'source' })
    expect(await flow.actions().confirm()).toBe(true)
    expect(flow.moveSingle).toHaveBeenCalledExactlyOnceWith('source', 'destination')
    expect(flow.moveBulk).not.toHaveBeenCalled()
  })

  it('waits for the mutation and clears pending state after completion', async () => {
    const flow = setup()
    let finish: ((result: BulkMoveHabitParentResult) => void) | undefined
    flow.moveBulk.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    flow.actions().openBulk()
    const pending = flow.actions().confirm()
    expect(flow.getState().pending).toBe(true)
    finish?.(outcome())
    await pending
    expect(flow.getState().pending).toBe(false)
  })
})

describe('bulk move completion', () => {
  it.each([{ failedIds: [] }, { failedIds: ['child'] }])('finishes or retains the failed selection: $failedIds', async ({ failedIds }) => {
    const mutate = vi.fn().mockResolvedValue(outcome(failedIds))
    const onSuccess = vi.fn()
    const onPartialFailure = vi.fn()
    await executeBulkMoveParent(['source', 'child', 'other'], null, { mutate, getAccountGeneration: () => 0, onSuccess, onPartialFailure })
    expect(mutate).toHaveBeenCalledExactlyOnceWith({ habitIds: ['source', 'child', 'other'], parentId: null })
    if (failedIds.length) {
      expect(onPartialFailure).toHaveBeenCalledExactlyOnceWith(failedIds)
      expect(onSuccess).not.toHaveBeenCalled()
    } else {
      expect(onSuccess).toHaveBeenCalledOnce()
      expect(onPartialFailure).not.toHaveBeenCalled()
    }
  })

  it('does not change selection after an account switch', async () => {
    const onSuccess = vi.fn()
    const onPartialFailure = vi.fn()
    const result = await executeBulkMoveParent(['source'], null, {
      mutate: vi.fn().mockResolvedValue(outcome()),
      getAccountGeneration: vi.fn().mockReturnValueOnce(0).mockReturnValue(1),
      onSuccess, onPartialFailure,
    })
    expect(result).toBeUndefined()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onPartialFailure).not.toHaveBeenCalled()
  })
})
