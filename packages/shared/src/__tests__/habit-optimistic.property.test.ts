import { describe, expect } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import type { HabitScheduleChild, HabitScheduleItem } from '../types/habit'
import type { HabitTreeNode } from '../utils/habit-optimistic'
import { findHabitInList, optimisticPatchHabit } from '../utils/habit-optimistic'

const PROPERTY_PARAMS = { seed: 424242, numRuns: 100 } as const
const MAX_DEPTH = 3
const MAX_BREADTH = 2
const ABSENT_ID = '__absent__'

interface RawNode {
  children: RawNode[]
}

function rawNodeArb(depth: number): fc.Arbitrary<RawNode> {
  const childrenArb =
    depth <= 1
      ? fc.constant<RawNode[]>([])
      : fc.array(rawNodeArb(depth - 1), { maxLength: MAX_BREADTH })
  return fc.record({ children: childrenArb })
}

function makeChild(id: string, children: HabitScheduleChild[]): HabitScheduleChild {
  return {
    id,
    title: `Child ${id}`,
    description: null,
    frequencyUnit: null,
    frequencyQuantity: null,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2025-01-01',
    dueTime: null,
    dueEndTime: null,
    endDate: null,
    position: null,
    checklistItems: [],
    tags: [],
    children,
    hasSubHabits: children.length > 0,
    isLoggedInRange: false,
    instances: [],
  }
}

function makeItem(id: string, children: HabitScheduleChild[]): HabitScheduleItem {
  return {
    id,
    title: `Habit ${id}`,
    description: null,
    frequencyUnit: null,
    frequencyQuantity: null,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2025-01-01',
    dueTime: null,
    dueEndTime: null,
    endDate: null,
    position: null,
    checklistItems: [],
    createdAtUtc: '2025-01-01T00:00:00Z',
    scheduledDates: [],
    isOverdue: false,
    reminderEnabled: false,
    reminderTimes: [],
    scheduledReminders: [],
    slipAlertEnabled: false,
    tags: [],
    children,
    hasSubHabits: children.length > 0,
    flexibleTarget: null,
    flexibleCompleted: null,
    isLoggedInRange: false,
    linkedGoals: [],
    instances: [],
  }
}

function buildForest(rawForest: RawNode[]): HabitScheduleItem[] {
  let counter = 0
  const nextId = () => `node-${counter++}`
  const toChild = (raw: RawNode): HabitScheduleChild => makeChild(nextId(), raw.children.map(toChild))
  return rawForest.map((raw) => makeItem(nextId(), raw.children.map(toChild)))
}

function collectIds(nodes: HabitTreeNode[]): string[] {
  return nodes.flatMap((node) => [node.id, ...collectIds(node.children)])
}

const scenarioArb = fc
  .array(rawNodeArb(MAX_DEPTH), { minLength: 1, maxLength: 3 })
  .map(buildForest)
  .chain((items) =>
    fc.record({
      items: fc.constant(items),
      targetId: fc.constantFrom(...collectIds(items)),
      nextIsCompleted: fc.boolean(),
    }),
  )

describe('optimisticPatchHabit (properties)', () => {
  test.prop([scenarioArb], PROPERTY_PARAMS)(
    'applying the same patch twice equals applying it once',
    ({ items, targetId, nextIsCompleted }) => {
      const patch = { isCompleted: nextIsCompleted }
      const once = optimisticPatchHabit(items, targetId, patch)
      const twice = optimisticPatchHabit(once, targetId, patch)
      expect(twice).toEqual(once)
    },
  )

  test.prop([scenarioArb], PROPERTY_PARAMS)(
    'patching an unknown id leaves the tree unchanged',
    ({ items, nextIsCompleted }) => {
      expect(optimisticPatchHabit(items, ABSENT_ID, { isCompleted: nextIsCompleted })).toEqual(items)
    },
  )

  test.prop([scenarioArb], PROPERTY_PARAMS)(
    'patching a field and back restores the original tree',
    ({ items, targetId }) => {
      const target = findHabitInList(items, targetId)
      expect(target).not.toBeNull()
      const original = target!.isCompleted
      const patched = optimisticPatchHabit(items, targetId, { isCompleted: !original })
      const restored = optimisticPatchHabit(patched, targetId, { isCompleted: original })
      expect(restored).toEqual(items)
    },
  )
})
