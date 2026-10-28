import { describe, expect, it } from 'vitest'
import { groupPendingOperationItems } from '../chat/pending-operation-item-groups'
import { pendingOperationItemSchema } from '../types/ai'
import { makeCreateHabitsPreview } from '../test-support/pending-operation-preview-fixtures'

const item = (itemId: string, habitType?: string | null) => ({ itemId, habitType })

describe('groupPendingOperationItems', () => {
  it.each([undefined, null, 'Task', 'Habit', 'General', 'Future'])('accepts the append-only habit type %s at the API boundary', habitType => {
    const original = makeCreateHabitsPreview(1).items![0]!
    expect(pendingOperationItemSchema.parse({ ...original, habitType })).toEqual({ ...original, habitType })
  })
  it('orders tasks, habits and general groups while preserving item identity and order', () => {
    const items = [item('g1', 'General'), item('h1', 'Habit'), item('t1', 'Task'), item('h2', 'Habit'), item('t2', 'Task')]
    const groups = groupPendingOperationItems(items)
    expect(groups).toEqual([
      { habitType: 'Task', items: [items[2], items[4]] },
      { habitType: 'Habit', items: [items[1], items[3]] },
      { habitType: 'General', items: [items[0]] },
    ])
    expect(groups[0]!.items[0]).toBe(items[2])
    expect(items.map(entry => entry.itemId)).toEqual(['g1', 'h1', 't1', 'h2', 't2'])
  })

  it.each(['Task', 'Habit', 'General'])('omits the heading for a sole %s group', habitType => {
    const items = [item('1', habitType), item('2', habitType)]
    expect(groupPendingOperationItems(items)).toEqual([{ items }])
  })

  it('leaves unknown, absent and null types ungrouped in their original order', () => {
    const items = [item('1'), item('2', 'Future'), item('3', null), item('4', 'task')]
    expect(groupPendingOperationItems(items)).toEqual([{ items }])
  })

  it('retains untyped rows before named groups without inventing a heading', () => {
    const items = [item('h', 'Habit'), item('u'), item('t', 'Task'), item('f', 'Future')]
    expect(groupPendingOperationItems(items)).toEqual([
      { items: [items[1], items[3]] },
      { habitType: 'Task', items: [items[2]] },
      { habitType: 'Habit', items: [items[0]] },
    ])
  })

  it('keeps a sole known type and unknown rows in the original flat display', () => {
    const items = [item('h1', 'Habit'), item('u'), item('h2', 'Habit')]
    expect(groupPendingOperationItems(items)).toEqual([{ items }])
  })

  it('has no groups for an empty preview', () => {
    expect(groupPendingOperationItems([])).toEqual([])
  })
})
