import { expect, it } from 'vitest'
import { getHabitDeleteConfirmation, selectedDescendantsInSnapshots } from '../hooks/habit-delete-core'
import { habitKeys, type HabitListSnapshots } from '../query/keys'
import { createMockHabit, createMockHabitScheduleItem } from './factories'

it('describes the selected delete subtree and clears a missing selection', () => {
  const parent = createMockHabit({ id: 'parent', title: 'Read' })
  const habits = new Map([[parent.id, parent]])
  const children = new Map([['parent', ['child']], ['child', ['grandchild']]])
  expect(getHabitDeleteConfirmation(parent.id, habits, children)).toEqual({ name: 'Read', descendantCount: 2 })
  expect(getHabitDeleteConfirmation(null, habits, children)).toEqual({ name: '', descendantCount: 0 })
  expect(getHabitDeleteConfirmation('missing', habits, children)).toEqual({ name: '', descendantCount: 0 })
})

it('excludes a selected descendant from undo only when one of its ancestors was selected', () => {
  const grandchild = createMockHabitScheduleItem({ id: 'grandchild' })
  const child = createMockHabitScheduleItem({ id: 'child', children: [grandchild] })
  const root = createMockHabitScheduleItem({ id: 'root', children: [child] })
  const snapshots: HabitListSnapshots = [[habitKeys.list({}), [root]]]
  expect(selectedDescendantsInSnapshots(snapshots, new Set(['root', 'child', 'grandchild']))).toEqual(new Set(['child', 'grandchild']))
  expect(selectedDescendantsInSnapshots(snapshots, new Set(['child', 'grandchild']))).toEqual(new Set(['grandchild']))
  expect(selectedDescendantsInSnapshots(snapshots, new Set(['grandchild', 'missing']))).toEqual(new Set())
})
