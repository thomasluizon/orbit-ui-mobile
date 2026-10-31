import { describe, expect, it, vi } from 'vitest'
import { createMockHabit } from './factories'
import { bulkLogResultSchema, bulkSkipResultSchema } from '../types/habit'
import { computeParentResolutionProgress, computeParentPromptChain, selectParentPromptAncestor, settleParentPromptChain, type ParentPromptChain } from '../utils/parent-prompt-chain'

const date = '2026-09-12'

function chainFixture(mode: 'log' | 'skip' = 'log') {
  const root = createMockHabit({ id: 'root', scheduledDates: [date] })
  const parent = createMockHabit({ id: 'parent', parentId: root.id, scheduledDates: [date] })
  const child = createMockHabit({ id: 'child', parentId: parent.id, scheduledDates: [date] })
  const sibling = createMockHabit({ id: 'sibling', parentId: root.id, isCompleted: true, scheduledDates: [date] })
  const habits = [root, parent, child, ...(mode === 'skip' ? [sibling] : [])]
  const habitsById = new Map(habits.map((habit) => [habit.id, habit]))
  const options = {
    getChildren: (id: string) => habits.filter((habit) => habit.parentId === id),
    isRelevantToday: () => true, isDueOnSelectedDate: () => true,
    skippedIds: new Set<string>(), resolvedModes: new Map([[child.id, mode]]),
  }
  const ancestors = computeParentPromptChain(child.id, habitsById, date, options)
  return { ancestors, child, habitsById, options }
}

function logResult(habitId: string, status: 'Success' | 'Failed' = 'Success') {
  return bulkLogResultSchema.parse({ results: [{ index: 0, status, habitId, logId: null, error: null }] })
}

describe('parent prompt chains', () => {
  it('offers every ancestor nearest first without recording speculative progress', () => {
    const { ancestors, options } = chainFixture()
    expect(ancestors.map(({ habit, mode }) => [habit.id, mode])).toEqual([['parent', 'log'], ['root', 'log']])
    expect([...options.resolvedModes.keys()]).toEqual(['child'])
    const prompt: ParentPromptChain = { ...ancestors[0]!, childId: 'child', date, ancestors, selectedCount: 1 }
    expect(selectParentPromptAncestor(prompt, 1, true).selectedCount).toBe(2)
    expect(selectParentPromptAncestor({ ...prompt, selectedCount: 2 }, 0, false).selectedCount).toBe(0)
    expect(selectParentPromptAncestor({ ...prompt, selectedCount: 2 }, 1, false).selectedCount).toBe(1)
  })

  it('stops at a bad parent', () => {
    const { child, habitsById, options } = chainFixture()
    const parent = habitsById.get('parent')!
    habitsById.set(parent.id, { ...parent, isBadHabit: true })
    expect(computeParentPromptChain(child.id, habitsById, date, options)).toEqual([])
  })

  it('does not start a chain from a bad child when its good siblings are already complete', () => {
    const { child, habitsById, options } = chainFixture()
    habitsById.set(child.id, { ...child, isBadHabit: true })
    const good = createMockHabit({ id: 'good', parentId: 'parent', isCompleted: true })
    expect(computeParentPromptChain(child.id, habitsById, date, { ...options,
      getChildren: (id) => id === 'parent' ? [habitsById.get(child.id)!, good] : options.getChildren(id),
    })).toEqual([])
  })

  it('retains a resolved child omitted by the next query and trusts current rows when they return', () => {
    const { child, habitsById, options } = chainFixture('skip')
    const sources = new Map([[child.id, { habit: child, mode: 'skip' as const }]])
    const current = new Map(habitsById)
    current.delete(child.id)
    const omitted = { ...options, resolvedModes: new Map(), getChildren: (id: string) => options.getChildren(id).filter((habit) => habit.id !== child.id) }
    expect(computeParentResolutionProgress('parent', current, omitted, sources)).toEqual({ done: 1, total: 1, loggedDone: 0 })
    expect(computeParentPromptChain(child.id, current, date, omitted, sources).map(({ habit, mode }) => [habit.id, mode]))
      .toEqual([['parent', 'skip'], ['root', 'log']])
    expect(computeParentPromptChain(child.id, habitsById, date, { ...options, resolvedModes: new Map() }, sources)).toEqual([])
  })

  it('uses one bulk request for a chain with the same action', async () => {
    const { ancestors } = chainFixture()
    const log = vi.fn(async (items: { habitId: string }[]) => bulkLogResultSchema.parse({ results: items.map(({ habitId }, index) => ({ index, habitId, status: 'Success', logId: null, error: null })) }))
    const onSettled = vi.fn()
    expect(await settleParentPromptChain(ancestors, { date, log, skip: vi.fn(), isCurrent: () => true, onSettled })).toEqual([])
    expect(log).toHaveBeenCalledExactlyOnceWith([{ habitId: 'parent', date }, { habitId: 'root', date }], [])
    expect(onSettled.mock.calls).toEqual([[{ habitId: 'parent', mode: 'log' }], [{ habitId: 'root', mode: 'log' }]])
  })

  it('settles mixed actions in dependency order and retains successful nearer rows', async () => {
    const { ancestors } = chainFixture('skip')
    expect(ancestors.map(({ mode }) => mode)).toEqual(['skip', 'log'])
    const settled: string[] = []
    const skip = vi.fn(async () => bulkSkipResultSchema.parse({ results: [{ index: 0, habitId: 'parent', status: 'Success', error: null }] }))
    const log = vi.fn(async () => { expect(settled).toEqual(['parent']); return logResult('root', 'Failed') })
    expect(await settleParentPromptChain(ancestors, { date, log, skip, isCurrent: () => true, onSettled: ({ habitId }) => settled.push(habitId) })).toEqual(['root'])
    expect(settled).toEqual(['parent'])
  })

  it('passes only the remaining selected ancestors to a batch for durable replay', async () => {
    const { ancestors } = chainFixture('skip')
    const skip = vi.fn(async () => ({ ...bulkSkipResultSchema.parse({ results: [{ index: 0, habitId: 'parent', status: 'Success', error: null }] }), queuedIds: ['parent'] }))
    const log = vi.fn()
    await settleParentPromptChain(ancestors, { date, log, skip, isCurrent: () => true, onSettled: vi.fn() })
    expect(skip).toHaveBeenCalledExactlyOnceWith([{ habitId: 'parent', date }], [{ habitId: 'root', date, mode: 'log' }])
    expect(log).not.toHaveBeenCalled()
  })

  it.each(['failure', 'queued', 'ambiguous', 'offline'] as const)('stops before the next action after %s', async (outcome) => {
    const { ancestors } = chainFixture('skip')
    const log = vi.fn()
    const skip = vi.fn(async () => ({
      ...bulkSkipResultSchema.parse({ results: [{ index: 0, habitId: 'parent', status: outcome === 'failure' ? 'Failed' : 'Success', error: null }] }),
      queuedIds: outcome === 'queued' ? ['parent'] : [],
      ambiguousIds: outcome === 'ambiguous' ? ['parent'] : [],
      offlineFailureIds: outcome === 'offline' ? ['parent'] : [],
    }))
    expect(await settleParentPromptChain(ancestors, { date, log, skip, isCurrent: () => true, onSettled: vi.fn() })).toEqual(['parent'])
    expect(log).not.toHaveBeenCalled()
  })
})
