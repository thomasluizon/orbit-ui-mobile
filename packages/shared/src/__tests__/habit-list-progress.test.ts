import { describe, it, expect } from 'vitest'
import {
  buildHabitDateBuckets,
  computeParentSettlementDecision,
  computeParentPromptProgress,
} from '../utils/habit-list-progress'
import { rebaseSelectedIds } from '../utils/habits'
import { createMockHabit } from './factories'
import type { NormalizedHabit } from '../types/habit'

const TODAY = '2026-06-22'

describe('buildHabitDateBuckets', () => {
  it('keeps an always-due daily habit with a stale due date under today, not overdue', () => {
    const meals = createMockHabit({
      id: 'meals',
      frequencyUnit: 'Day',
      dueDate: '2026-06-20',
      isOverdue: false,
    })

    const buckets = buildHabitDateBuckets([meals], TODAY)

    expect(buckets.find((bucket) => bucket.key === '__overdue__')).toBeUndefined()
    expect(buckets.find((bucket) => bucket.key === TODAY)?.habits.map((habit) => habit.id)).toEqual([
      'meals',
    ])
  })

  it('places a genuinely missed habit in the overdue bucket', () => {
    const general = createMockHabit({
      id: 'general',
      frequencyUnit: 'Week',
      dueDate: '2026-06-20',
      isOverdue: true,
    })

    const buckets = buildHabitDateBuckets([general], TODAY)

    const overdueBucket = buckets.find((bucket) => bucket.key === '__overdue__')
    expect(buckets[0]?.key).toBe('__overdue__')
    expect(overdueBucket?.isOverdue).toBe(true)
    expect(overdueBucket?.habits.map((habit) => habit.id)).toEqual(['general'])
  })

  it('does not treat a completed habit as overdue', () => {
    const completed = createMockHabit({
      id: 'completed',
      dueDate: '2026-06-20',
      isOverdue: true,
      isCompleted: true,
    })

    const buckets = buildHabitDateBuckets([completed], TODAY)

    expect(buckets.find((bucket) => bucket.key === '__overdue__')).toBeUndefined()
  })

  it('orders the overdue section first, then dates ascending', () => {
    const overdue = createMockHabit({ id: 'overdue', dueDate: '2026-06-18', isOverdue: true })
    const tomorrow = createMockHabit({ id: 'tomorrow', dueDate: '2026-06-23', isOverdue: false })
    const today = createMockHabit({ id: 'today', dueDate: TODAY, isOverdue: false })

    const buckets = buildHabitDateBuckets([tomorrow, today, overdue], TODAY)

    expect(buckets.map((bucket) => bucket.key)).toEqual(['__overdue__', TODAY, '2026-06-23'])
  })

  it('sorts overdue habits by due date', () => {
    const later = createMockHabit({ id: 'later', dueDate: '2026-06-19', isOverdue: true })
    const earlier = createMockHabit({ id: 'earlier', dueDate: '2026-06-17', isOverdue: true })

    const buckets = buildHabitDateBuckets([later, earlier], TODAY)

    const overdueBucket = buckets.find((bucket) => bucket.key === '__overdue__')
    expect(overdueBucket?.habits.map((habit) => habit.id)).toEqual(['earlier', 'later'])
  })
})

function makeGetChildren(
  childrenByParent: Record<string, NormalizedHabit[]>,
): (parentId: string) => NormalizedHabit[] {
  return (parentId: string) => childrenByParent[parentId] ?? []
}

const scheduledToday = (habit: NormalizedHabit) => habit.scheduledDates.includes(TODAY)

describe('rebaseSelectedIds', () => {
  it('replays additions and removals onto authoritative selections', () => {
    expect(rebaseSelectedIds(
      ['persisted', 'added-by-authority', 'removed-locally'],
      ['removed-locally'],
      ['added-locally'],
    )).toEqual(['persisted', 'added-by-authority', 'added-locally'])
  })
})

describe('computeParentSettlementDecision', () => {
  const parent = createMockHabit({
    id: 'parent',
    dueDate: TODAY,
    hasSubHabits: true,
    scheduledDates: [TODAY],
  })

  it('logs an unsettled parent when any eligible child was logged', () => {
    expect(
      computeParentSettlementDecision(
        parent,
        {
          done: 2,
          total: 2,
          loggedDone: 1,
        },
        TODAY,
      ),
    ).toBe('log')
  })

  it('skips an unsettled parent when every eligible child was skipped', () => {
    expect(
      computeParentSettlementDecision(
        parent,
        {
          done: 2,
          total: 2,
          loggedDone: 0,
        },
        TODAY,
      ),
    ).toBe('skip')
  })

  it('does nothing when the parent is missing, settled, or has incomplete children', () => {
    const completeChildren = { done: 1, total: 1, loggedDone: 1 }

    expect(computeParentSettlementDecision(null, completeChildren, TODAY)).toBeNull()
    expect(
      computeParentSettlementDecision(
        { ...parent, isCompleted: true },
        completeChildren,
        TODAY,
      ),
    ).toBeNull()
    expect(
      computeParentSettlementDecision(
        { ...parent, isCompleted: false, isLoggedInRange: true },
        completeChildren,
        TODAY,
      ),
    ).toBeNull()
    expect(
      computeParentSettlementDecision(
        {
          ...parent,
          isCompleted: false,
          isFlexible: true,
          flexibleTarget: 0,
          flexibleCompleted: 0,
          isLoggedInRange: false,
        },
        completeChildren,
        TODAY,
      ),
    ).toBeNull()
    expect(
      computeParentSettlementDecision(
        parent,
        {
          done: 0,
          total: 1,
          loggedDone: 0,
        },
        TODAY,
      ),
    ).toBeNull()
    expect(
      computeParentSettlementDecision(
        parent,
        {
          done: 0,
          total: 0,
          loggedDone: 0,
        },
        TODAY,
      ),
    ).toBeNull()
  })

  it.each([
    ['one-time', null],
    ['recurring', 'Day'],
  ] as const)('does nothing when a %s parent moved off the prompt date', (_label, frequencyUnit) => {
    const movedParent = createMockHabit({
      id: 'parent',
      dueDate: '2026-06-23',
      frequencyUnit,
      hasSubHabits: true,
      instances: [],
      scheduledDates: [],
    })

    expect(
      computeParentSettlementDecision(
        movedParent,
        { done: 1, total: 1, loggedDone: 1 },
        TODAY,
      ),
    ).toBeNull()
  })
})

describe('computeParentPromptProgress', () => {
  it('counts a sub-habit skipped before this mount as resolved', () => {
    const logged = createMockHabit({
      id: 'logged',
      parentId: 'parent',
      isFlexible: true,
      isLoggedInRange: true,
      flexibleTarget: 1,
      flexibleCompleted: 1,
    })
    const skippedEarlier = createMockHabit({
      id: 'skipped-earlier',
      parentId: 'parent',
      isFlexible: true,
      isLoggedInRange: false,
      flexibleTarget: 0,
      flexibleCompleted: 0,
    })

    const progress = computeParentPromptProgress({
      parentId: 'parent',
      getChildren: makeGetChildren({ parent: [logged, skippedEarlier] }),
      isRelevantToday: scheduledToday,
      isDueOnSelectedDate: scheduledToday,
      isListView: false,
      skippedIds: new Set(),
    })

    expect(progress.done).toBe(2)
    expect(progress.total).toBe(2)
  })

  it('treats an optimistically completed server-known skip as logged', () => {
    const loggedAfterSkip = createMockHabit({
      id: 'logged-after-skip',
      parentId: 'parent',
      isCompleted: true,
      isFlexible: true,
      isLoggedInRange: false,
      flexibleTarget: 0,
      flexibleCompleted: 0,
      scheduledDates: [],
    })

    const progress = computeParentPromptProgress({
      parentId: 'parent',
      getChildren: makeGetChildren({ parent: [loggedAfterSkip] }),
      isRelevantToday: scheduledToday,
      isDueOnSelectedDate: scheduledToday,
      isListView: false,
      skippedIds: new Set(),
      resolvedModes: new Map([[loggedAfterSkip.id, 'log']]),
    })

    expect(progress).toEqual({ done: 1, total: 1, loggedDone: 1 })
  })

  it('reports no logged children when every sub-habit was skipped before this mount', () => {
    const first = createMockHabit({
      id: 'a',
      parentId: 'p',
      isFlexible: true,
      flexibleTarget: 0,
      flexibleCompleted: 0,
    })
    const second = createMockHabit({
      id: 'b',
      parentId: 'p',
      isFlexible: true,
      flexibleTarget: 0,
      flexibleCompleted: 0,
    })

    const progress = computeParentPromptProgress({
      parentId: 'p',
      getChildren: makeGetChildren({ p: [first, second] }),
      isRelevantToday: scheduledToday,
      isDueOnSelectedDate: scheduledToday,
      isListView: false,
      skippedIds: new Set(),
    })

    expect(progress).toEqual({ done: 2, total: 2, loggedDone: 0 })
  })

  it('counts in-session and server-known skips once each', () => {
    const skippedInSession = createMockHabit({ id: 'a', parentId: 'p' })
    const skippedByServer = createMockHabit({
      id: 'b',
      parentId: 'p',
      isFlexible: true,
      flexibleTarget: 0,
      flexibleCompleted: 0,
    })

    const progress = computeParentPromptProgress({
      parentId: 'p',
      getChildren: makeGetChildren({ p: [skippedInSession, skippedByServer] }),
      isRelevantToday: scheduledToday,
      isDueOnSelectedDate: scheduledToday,
      isListView: false,
      skippedIds: new Set(['a', 'b']),
    })

    expect(progress).toEqual({ done: 2, total: 2, loggedDone: 0 })
  })

  it('counts a nested server-known skip below a child with no work today', () => {
    const intermediate = createMockHabit({
      id: 'child',
      parentId: 'parent',
      scheduledDates: ['2026-06-25'],
    })
    const nestedSkip = createMockHabit({
      id: 'nested-skip',
      parentId: 'child',
      isFlexible: true,
      flexibleTarget: 0,
      flexibleCompleted: 0,
    })

    const progress = computeParentPromptProgress({
      parentId: 'parent',
      getChildren: makeGetChildren({ parent: [intermediate], child: [nestedSkip] }),
      isRelevantToday: scheduledToday,
      isDueOnSelectedDate: scheduledToday,
      isListView: false,
      skippedIds: new Set(),
    })

    expect(progress).toEqual({ done: 1, total: 1, loggedDone: 0 })
  })

  it('does not resolve a flexible child with partial window progress', () => {
    const partial = createMockHabit({
      id: 'partial',
      parentId: 'parent',
      isFlexible: true,
      flexibleTarget: 2,
      flexibleCompleted: 1,
      scheduledDates: [TODAY],
    })

    const progress = computeParentPromptProgress({
      parentId: 'parent',
      getChildren: makeGetChildren({ parent: [partial] }),
      isRelevantToday: scheduledToday,
      isDueOnSelectedDate: scheduledToday,
      isListView: false,
      skippedIds: new Set(),
    })

    expect(progress).toEqual({ done: 0, total: 1, loggedDone: 0 })
  })

  it('keeps a pending non-flexible child unresolved', () => {
    const pending = createMockHabit({
      id: 'pending',
      parentId: 'parent',
      isFlexible: false,
      flexibleTarget: null,
      flexibleCompleted: null,
      scheduledDates: [TODAY],
    })

    const progress = computeParentPromptProgress({
      parentId: 'parent',
      getChildren: makeGetChildren({ parent: [pending] }),
      isRelevantToday: scheduledToday,
      isDueOnSelectedDate: scheduledToday,
      isListView: false,
      skippedIds: new Set(),
    })

    expect(progress).toEqual({ done: 0, total: 1, loggedDone: 0 })
  })

  it('does not report all-done while an overdue sibling is still unlogged (today view)', () => {
    const loggedOverdue = createMockHabit({
      id: 'a',
      parentId: 'p',
      isOverdue: true,
      scheduledDates: [],
      dueDate: '2026-06-20',
    })
    const pendingOverdue = createMockHabit({
      id: 'b',
      parentId: 'p',
      isOverdue: true,
      scheduledDates: [],
      dueDate: '2026-06-20',
    })

    const progress = computeParentPromptProgress({
      parentId: 'p',
      getChildren: makeGetChildren({ p: [loggedOverdue, pendingOverdue] }),
      isRelevantToday: scheduledToday,
      isDueOnSelectedDate: scheduledToday,
      isListView: false,
      skippedIds: new Set(),
      resolvedModes: new Map([['a', 'log']]),
    })

    expect(progress.total).toBe(2)
    expect(progress.done).toBe(1)
  })

  it('reports all-done once every overdue sibling is logged', () => {
    const first = createMockHabit({
      id: 'a',
      parentId: 'p',
      isOverdue: true,
      scheduledDates: [],
      isLoggedInRange: true,
    })
    const second = createMockHabit({
      id: 'b',
      parentId: 'p',
      isOverdue: true,
      scheduledDates: [],
    })

    const progress = computeParentPromptProgress({
      parentId: 'p',
      getChildren: makeGetChildren({ p: [first, second] }),
      isRelevantToday: scheduledToday,
      isDueOnSelectedDate: scheduledToday,
      isListView: false,
      skippedIds: new Set(),
      resolvedModes: new Map([['b', 'log']]),
    })

    expect(progress.total).toBe(2)
    expect(progress.done).toBe(2)
    expect(progress.loggedDone).toBe(2)
  })

  it('sees every sibling resolved by one bulk operation before the snapshot refetches', () => {
    const first = createMockHabit({ id: 'a', parentId: 'p', scheduledDates: [TODAY] })
    const second = createMockHabit({ id: 'b', parentId: 'p', scheduledDates: [TODAY] })

    const progress = computeParentPromptProgress({
      parentId: 'p',
      getChildren: makeGetChildren({ p: [first, second] }),
      isRelevantToday: scheduledToday,
      isDueOnSelectedDate: scheduledToday,
      isListView: false,
      skippedIds: new Set(),
      resolvedModes: new Map([
        ['a', 'log'],
        ['b', 'log'],
      ]),
    })

    expect(progress).toEqual({ done: 2, total: 2, loggedDone: 2 })
  })

  it('reports all-done with no logged children when every sub-habit was skipped', () => {
    const first = createMockHabit({ id: 'a', parentId: 'p', scheduledDates: [TODAY] })
    const second = createMockHabit({ id: 'b', parentId: 'p', scheduledDates: [TODAY] })

    const progress = computeParentPromptProgress({
      parentId: 'p',
      getChildren: makeGetChildren({ p: [first, second] }),
      isRelevantToday: scheduledToday,
      isDueOnSelectedDate: scheduledToday,
      isListView: false,
      skippedIds: new Set(['a', 'b']),
    })

    expect(progress.done).toBe(2)
    expect(progress.total).toBe(2)
    expect(progress.loggedDone).toBe(0)
  })

  it('flags a logged child when sub-habit resolutions are mixed', () => {
    const logged = createMockHabit({
      id: 'a',
      parentId: 'p',
      scheduledDates: [TODAY],
      isLoggedInRange: true,
    })
    const skipped = createMockHabit({ id: 'b', parentId: 'p', scheduledDates: [TODAY] })

    const progress = computeParentPromptProgress({
      parentId: 'p',
      getChildren: makeGetChildren({ p: [logged, skipped] }),
      isRelevantToday: scheduledToday,
      isDueOnSelectedDate: scheduledToday,
      isListView: false,
      skippedIds: new Set(['b']),
    })

    expect(progress.done).toBe(2)
    expect(progress.total).toBe(2)
    expect(progress.loggedDone).toBe(1)
  })

  it('counts a skipped child as done even after it advanced off today (list view)', () => {
    const completed = createMockHabit({
      id: 'a',
      parentId: 'p',
      isCompleted: true,
      scheduledDates: [TODAY],
    })
    const skippedAdvanced = createMockHabit({
      id: 'b',
      parentId: 'p',
      isCompleted: false,
      scheduledDates: ['2026-06-23'],
    })

    const progress = computeParentPromptProgress({
      parentId: 'p',
      getChildren: makeGetChildren({ p: [completed, skippedAdvanced] }),
      isRelevantToday: scheduledToday,
      isDueOnSelectedDate: scheduledToday,
      isListView: true,
      skippedIds: new Set(['b']),
    })

    expect(progress.done).toBe(2)
    expect(progress.total).toBe(2)
  })

  it('excludes a sub-habit with no work today from the count in the today view', () => {
    const future = createMockHabit({
      id: 'a',
      parentId: 'p',
      scheduledDates: ['2026-06-25'],
      isOverdue: false,
    })

    const progress = computeParentPromptProgress({
      parentId: 'p',
      getChildren: makeGetChildren({ p: [future] }),
      isRelevantToday: scheduledToday,
      isDueOnSelectedDate: scheduledToday,
      isListView: false,
      skippedIds: new Set(),
    })

    expect(progress.total).toBe(0)
  })

  it('aggregates nested sub-habits', () => {
    const parentChild = createMockHabit({ id: 'c', parentId: 'p', scheduledDates: [TODAY] })
    const grandchild = createMockHabit({ id: 'gc', parentId: 'c', scheduledDates: [TODAY] })

    const progress = computeParentPromptProgress({
      parentId: 'p',
      getChildren: makeGetChildren({ p: [parentChild], c: [grandchild] }),
      isRelevantToday: scheduledToday,
      isDueOnSelectedDate: scheduledToday,
      isListView: false,
      skippedIds: new Set(['c', 'gc']),
    })

    expect(progress.total).toBe(2)
    expect(progress.done).toBe(2)
    expect(progress.loggedDone).toBe(0)
  })
})
