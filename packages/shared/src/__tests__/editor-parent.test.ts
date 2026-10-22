import { describe, expect, it } from 'vitest'
import { habitDetailSchema, updateHabitRequestSchema } from '../types/habit'
import { makeHabitDetail } from '../test-support/habit-detail-fixtures'
import { mergeHabitDetailWithScopedHabit } from '../utils/habit-detail-flow'
import { createMockHabit } from './factories'

const parentId = '22222222-2222-4222-8222-222222222222'

describe('ordinary editor parent contract', () => {
  it('preserves set, explicit clear and nullable unchanged inputs through parsing', () => {
    const core = { title: 'Read', isBadHabit: false }
    expect(updateHabitRequestSchema.parse({ ...core, parentId })).toEqual({ ...core, parentId })
    expect(updateHabitRequestSchema.parse({ ...core, clearParent: true })).toEqual({ ...core, clearParent: true })
    expect(updateHabitRequestSchema.parse({ ...core, parentId: null, clearParent: null })).toEqual({ ...core, parentId: null, clearParent: null })
    expect(updateHabitRequestSchema.parse(core)).toEqual(core)
  })

  it('retains authoritative null and UUID independently from absent old readback', () => {
    const detail = makeHabitDetail()
    expect(habitDetailSchema.parse({ ...detail, parentId }).parentId).toBe(parentId)
    expect(habitDetailSchema.parse({ ...detail, parentId: null }).parentId).toBeNull()
    expect(habitDetailSchema.parse(detail).parentId).toBeUndefined()
  })

  it('uses authoritative parent readback ahead of stale list context', () => {
    const detail = habitDetailSchema.parse({ ...makeHabitDetail(), parentId })
    const stale = createMockHabit({ id: detail.id, parentId: null })
    expect(mergeHabitDetailWithScopedHabit(detail, stale, '2026-08-28').parentId).toBe(parentId)
    expect(mergeHabitDetailWithScopedHabit({ ...detail, parentId: null }, { ...stale, parentId }, '2026-08-28').parentId).toBeNull()
  })
})

import { buildEditorParentChange, buildMoveParentOptions, getMoveParentInventory, validateEditorParent } from '../utils/move-parent'
import { optimisticMoveHabitParent } from '../utils/habit-parent-optimistic'
import { normalizeHabitQueryData } from '../utils/habit-normalization'
import { makeHabitScheduleItem } from '../test-support/habit-detail-fixtures'

const t = (key: string) => key
const source = createMockHabit({ id: 'source', parentId: null })
const target = createMockHabit({ id: 'target', title: 'Completed off-day task', frequencyUnit: null, isCompleted: true, scheduledDates: [], parentId: null })
const general = createMockHabit({ id: 'general', isGeneral: true, parentId: null })
const query = (habits: typeof source[]) => ({ data: { habitsById: new Map(habits.map((habit) => [habit.id, habit])) }, isSuccess: true, isFetching: false, isError: false })

describe('editor inventory and final candidate', () => {
  it('requires both complete successful queries and never exposes a partial or refetching tree', () => {
    for (const state of [{ isSuccess: false }, { isFetching: true }, { isError: true }, { data: undefined }]) {
      const inventory = getMoveParentInventory(query([source, target]), { ...query([general]), ...state })
      expect(inventory.state).toBeDefined()
      expect(inventory.habitsById.size).toBe(0)
    }
    const inventory = getMoveParentInventory(query([source, target]), query([general]))
    expect([...inventory.habitsById.keys()]).toEqual(['source', 'target', 'general'])
    expect(inventory.state).toBeUndefined()
  })

  it('includes completed destinations explicitly for the editor while preserving standalone presentation', () => {
    const inventory = getMoveParentInventory(query([source, target]), query([general]))
    const deps = { ...inventory, maxHabitDepth: 5, t, validateMoveTarget: () => ({ valid: true, reason: null }) }
    expect(buildMoveParentOptions(deps, source.id).map((option) => option.id)).not.toContain(target.id)
    expect(buildMoveParentOptions({ ...deps, includeCompleted: true }, source.id).map((option) => option.id)).toEqual([null, source.id, target.id, general.id])
  })

  it('checks self, descendant, full subtree depth, missing destinations and final General', () => {
    const child = createMockHabit({ id: 'child', parentId: source.id })
    const grandchild = createMockHabit({ id: 'grandchild', parentId: child.id })
    const deepTarget = createMockHabit({ id: 'deep-target', parentId: target.id })
    const inventory = getMoveParentInventory(query([source, child, grandchild, target, deepTarget]), query([general]))
    const deps = { ...inventory, maxHabitDepth: 4, t }
    expect(validateEditorParent(deps, source.id, source.id, false).reason).toBe('habits.moveParent.invalidSelf')
    expect(validateEditorParent(deps, child.id, source.id, false).reason).toBe('habits.moveParent.invalidDescendant')
    expect(validateEditorParent(deps, deepTarget.id, source.id, false).reason).toBe('habits.moveParent.invalidDepth')
    expect(validateEditorParent(deps, 'deleted', source.id, false).valid).toBe(false)
    expect(validateEditorParent(deps, general.id, source.id, true).valid).toBe(false)
    expect(validateEditorParent(deps, null, source.id, false).valid).toBe(true)
    const leafInventory = getMoveParentInventory(query([source, target]), query([general]))
    expect(validateEditorParent({ ...leafInventory, maxHabitDepth: 4, t }, general.id, source.id, true).valid).toBe(true)
  })

  it('serializes only an explicit verified changed choice', () => {
    expect(buildEditorParentChange(undefined, undefined)).toEqual({})
    expect(buildEditorParentChange(undefined, null)).toEqual({})
    expect(buildEditorParentChange(null, undefined)).toEqual({})
    expect(buildEditorParentChange(parentId, parentId)).toEqual({})
    expect(buildEditorParentChange(null, parentId)).toEqual({ parentId })
    expect(buildEditorParentChange(parentId, null)).toEqual({ clearParent: true })
  })

  it('moves actual tree membership with complete content intact and leaves the snapshot reusable for rollback', () => {
    const child = makeHabitScheduleItem({ id: 'source', title: 'Edited', emoji: '📚', intervalWeeks: 2, checklistItems: [{ text: 'Same', isChecked: true }, { text: 'Same', isChecked: false }], children: [], hasSubHabits: false })
    const destination = makeHabitScheduleItem({ id: 'target', children: [], hasSubHabits: false })
    const original = [child, destination]
    const moved = optimisticMoveHabitParent(original, child.id, destination.id)
    expect(moved.map((item) => item.id)).toEqual(['target'])
    const normalized = normalizeHabitQueryData(moved)
    expect(normalized.habitsById.get(child.id)).toMatchObject({ parentId: 'target', title: 'Edited', emoji: '📚', intervalWeeks: 2, checklistItems: child.checklistItems })
    expect(original).toEqual([child, destination])
    expect(optimisticMoveHabitParent(moved, child.id, null).map((item) => item.id)).toEqual(['target', 'source'])
  })
})

import { QueryClient } from '@tanstack/query-core'
import { habitKeys } from '../query/keys'
import { updateCachedHabitDetails, restoreCachedHabitDetails } from '../query/habit-cache'

it('moves old/new parent detail and full-detail membership in the same reversible cache snapshot', () => {
  const client = new QueryClient()
  const moving = { ...makeHabitDetail(), id: 'moving', parentId: parentId, children: [] }
  const oldParent = { ...makeHabitDetail(), id: parentId, parentId: null, children: [moving] }
  const nextParent = { ...makeHabitDetail(), id: 'next', parentId: null, children: [] }
  client.setQueryData(habitKeys.detail(moving.id), moving)
  client.setQueryData(habitKeys.detail(parentId), oldParent)
  client.setQueryData(habitKeys.detail(nextParent.id), nextParent)
  const full = { habit: oldParent, metrics: {}, logs: [] }
  client.setQueryData(habitKeys.fullDetail(parentId), full)
  const updates = updateCachedHabitDetails(client, (habit) => habit.id === moving.id ? { title: 'Together', parentId: nextParent.id, checklistItems: [{ text: 'Same', isChecked: true }, { text: 'Same', isChecked: false }] } : {}, { habitId: moving.id, parentId: nextParent.id })
  expect(client.getQueryData(habitKeys.detail(parentId))).toMatchObject({ children: [] })
  expect(client.getQueryData(habitKeys.detail(nextParent.id))).toMatchObject({ children: [{ id: moving.id, title: 'Together' }] })
  expect(client.getQueryData(habitKeys.detail(moving.id))).toMatchObject({ parentId: 'next', title: 'Together' })
  expect(client.getQueryData(habitKeys.fullDetail(parentId))).toMatchObject({ habit: { children: [] } })
  restoreCachedHabitDetails(client, updates)
  expect(client.getQueryData(habitKeys.detail(parentId))).toEqual(oldParent)
  expect(client.getQueryData(habitKeys.detail(nextParent.id))).toEqual(nextParent)
  expect(client.getQueryData(habitKeys.detail(moving.id))).toEqual(moving)
  expect(client.getQueryData(habitKeys.fullDetail(parentId))).toEqual(full)
  client.clear()
})
