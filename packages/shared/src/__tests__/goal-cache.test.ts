import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/query-core'
import { findLinkedHabits, goalDetailRollback, goalDetailSettled, goalListRollback, invalidateGoalQueries, removeGoalFromCache, reorderGoalCache, restoreGoalLists, updateGoalCache } from '../query/goal-cache'
import { goalKeys, habitKeys } from '../query/keys'
import type { Goal, GoalDetailWithMetrics } from '../types/goal'
import { createMockGoal, createMockHabitScheduleItem } from './factories'

const clients: QueryClient[] = []

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  clients.push(client)
  const first = createMockGoal({ id: 'goal-reading', targetValue: 12 })
  const second = createMockGoal({ id: 'goal-running', position: 1 })
  const detail: GoalDetailWithMetrics = {
    goal: { ...first, progressHistory: [] },
    metrics: { progressPercentage: 0, velocityPerDay: 0, projectedCompletionDate: null, daysToDeadline: null, trackingStatus: 'on_track', habitAdherence: [] },
  }
  client.setQueryData(goalKeys.list({}), [first, second])
  client.setQueryData(goalKeys.detail(first.id), detail)
  return { client, first, second, detail, goals: () => client.getQueryData<Goal[]>(goalKeys.list({})) }
}

afterEach(() => { for (const client of clients.splice(0)) client.clear() })

describe('shared goal cache mutations', () => {
  it.each(['delete', 'reorder', 'progress'] as const)('prepares %s motion after cancellation and before the cache setter', async (operation) => {
    const { client, first, second, goals } = setup()
    let finishCancellation!: () => void
    const cancellation = new Promise<void>((resolve) => { finishCancellation = resolve })
    const cancel = vi.spyOn(client, 'cancelQueries').mockReturnValue(cancellation)
    const setLists = vi.spyOn(client, 'setQueriesData')
    const prepare = vi.fn(() => {
      expect(setLists).not.toHaveBeenCalled()
      expect(goals()).toEqual([first, second])
    })
    try {
      const update = operation === 'delete'
        ? removeGoalFromCache(client, first.id, prepare)
        : operation === 'reorder'
          ? reorderGoalCache(client, [{ id: first.id, position: 3 }], prepare)
          : updateGoalCache(client, first.id, { type: 'progress', currentValue: 6 }, false, prepare)
      expect(prepare).not.toHaveBeenCalled()
      expect(setLists).not.toHaveBeenCalled()
      finishCancellation()
      const snapshot = await update
      expect(prepare).toHaveBeenCalledOnce()
      expect(setLists).toHaveBeenCalledOnce()
      expect(goals()).not.toEqual([first, second])
      const prepareRollback = vi.fn(() => expect(goals()).not.toEqual([first, second]))
      goalListRollback(client, prepareRollback)(new Error('Save failed'), first.id, snapshot)
      expect(prepareRollback).toHaveBeenCalledOnce()
      expect(goals()).toEqual([first, second])
    } finally {
      cancel.mockRestore()
      setLists.mockRestore()
    }
  })

  it('defers detail invalidation for queued writes and invalidates completed writes', async () => {
    const { client, first } = setup()
    const settled = goalDetailSettled(client, (result) => result === 'queued')
    settled('queued', null, { goalId: first.id })
    expect(client.getQueryState(goalKeys.list({}))?.isInvalidated).toBe(false)
    expect(client.getQueryState(goalKeys.detail(first.id))?.isInvalidated).toBe(false)
    settled('saved', null, { goalId: first.id })
    expect(client.getQueryState(goalKeys.list({}))?.isInvalidated).toBe(true)
    await vi.waitFor(() => expect(client.getQueryState(goalKeys.detail(first.id))?.isInvalidated).toBe(true))
  })

  it('removes from cached lists and restores the original snapshot after failure', async () => {
    const { client, first, second, goals } = setup()
    const snapshot = await removeGoalFromCache(client, first.id)
    expect(goals()).toEqual([second])
    goalListRollback(client)(new Error('Save failed'), first.id, snapshot)
    expect(goals()).toEqual([first, second])
  })

  it('reorders only supplied goals and restores them after failure', async () => {
    const { client, first, second, goals } = setup()
    const snapshot = await reorderGoalCache(client, [{ id: first.id, position: 3 }])
    expect(goals()).toEqual([{ ...first, position: 3 }, second])
    restoreGoalLists(client, snapshot.previousLists)
    expect(goals()).toEqual([first, second])
  })

  it.each([
    { change: { type: 'progress', currentValue: 6 }, expected: { currentValue: 6, progressPercentage: 50 } },
    { change: { type: 'status', status: 'Completed' }, expected: { status: 'Completed', progressPercentage: 100 } },
    { change: { type: 'update', request: { title: 'Books', targetValue: 24, unit: 'books' } }, expected: { title: 'Books', targetValue: 24 } },
  ] as const)('updates the list and detail for $change.type and restores both', async ({ change, expected }) => {
    const { client, first, second, detail, goals } = setup()
    const snapshot = await updateGoalCache(client, first.id, change, true)
    expect(goals()?.[0]).toMatchObject(expected)
    expect(goals()?.[1]).toEqual(second)
    expect(client.getQueryData<GoalDetailWithMetrics>(goalKeys.detail(first.id))?.goal).toMatchObject(expected)
    goalDetailRollback(client)(new Error('Save failed'), { goalId: first.id }, snapshot)
    expect(goals()).toEqual([first, second])
    expect(client.getQueryData(goalKeys.detail(first.id))).toEqual(detail)
  })

  it('leaves absent cache entries absent', async () => {
    const client = new QueryClient()
    clients.push(client)
    await removeGoalFromCache(client, 'missing')
    await reorderGoalCache(client, [{ id: 'missing', position: 1 }])
    await updateGoalCache(client, 'missing', { type: 'progress', currentValue: 6 })
    expect(client.getQueryData(goalKeys.list({}))).toBeUndefined()
    expect(client.getQueryData(goalKeys.detail('missing'))).toBeUndefined()
  })

  it('finds linked habits in every list cache in selection order and skips missing ids', () => {
    const { client } = setup()
    const first = createMockHabitScheduleItem({ id: 'habit-reading', title: 'Read' })
    const second = createMockHabitScheduleItem({ id: 'habit-running', title: 'Run' })
    client.setQueryData(habitKeys.list({ date: '2099-12-01' }), [first])
    client.setQueryData(habitKeys.list({ date: '2099-12-02' }), [second])
    expect(findLinkedHabits(client, [])).toEqual([])
    expect(findLinkedHabits(client, [second.id, 'missing', first.id])).toEqual([{ id: second.id, title: second.title }, { id: first.id, title: first.title }])
  })

  it('invalidates just the requested resource families', async () => {
    const { client, first } = setup()
    const metrics = goalKeys.metrics(first.id)
    const habits = habitKeys.list({ date: '2099-12-01' })
    client.setQueryData(metrics, {})
    client.setQueryData(habits, [])
    await invalidateGoalQueries(client)
    expect(client.getQueryState(goalKeys.list({}))?.isInvalidated).toBe(true)
    expect(client.getQueryState(goalKeys.detail(first.id))?.isInvalidated).toBe(false)
    await invalidateGoalQueries(client, { goalId: first.id, includeMetrics: true, includeHabits: true })
    for (const key of [goalKeys.detail(first.id), metrics, habits]) expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  })
})
