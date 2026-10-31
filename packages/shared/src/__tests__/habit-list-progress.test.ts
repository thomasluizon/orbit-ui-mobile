import { describe, it, expect } from 'vitest'
import {
  computeHabitDayProgress,
  computeParentSettlementDecision,
  computeParentPromptDecision,
  computeParentPromptProgress,
} from '../utils/habit-list-progress'
import { rebaseSelectedIds } from '../utils/habits'
import { createMockHabit } from './factories'
import type { NormalizedHabit } from '../types/habit'

const TODAY = '2026-06-22'

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

describe('computeHabitDayProgress', () => {
  it('counts general habits by completion whatever their schedule', () => {
    const habits = [
      createMockHabit({ id: 'general-done', isGeneral: true, isCompleted: true, scheduledDates: [] }),
      createMockHabit({ id: 'general-open', isGeneral: true, scheduledDates: [] }),
    ]

    expect(computeHabitDayProgress(habits, scheduledToday)).toEqual({ done: 1, total: 2 })
  })

  it('counts due, overdue and logged habits and leaves unscheduled ones out', () => {
    const habits = [
      createMockHabit({ id: 'due-done', scheduledDates: [TODAY], isCompleted: true }),
      createMockHabit({ id: 'due-open', scheduledDates: [TODAY] }),
      createMockHabit({ id: 'overdue', scheduledDates: [], isOverdue: true }),
      createMockHabit({ id: 'logged-in-range', scheduledDates: [], isLoggedInRange: true }),
      createMockHabit({ id: 'not-due', scheduledDates: ['2026-06-23'] }),
    ]

    expect(computeHabitDayProgress(habits, scheduledToday)).toEqual({ done: 2, total: 4 })
  })

  it('returns an empty count for no habits', () => {
    expect(computeHabitDayProgress([], scheduledToday)).toEqual({ done: 0, total: 0 })
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

describe('computeParentPromptDecision', () => {
  const parent = createMockHabit({ id: 'parent', scheduledDates: [TODAY] })
  const resolved = { done: 2, total: 2, loggedDone: 1 }

  it.each([
    [1, 'log'],
    [0, 'skip'],
  ] as const)('opens in %s logged-child mode %s without mutating the ledger', (loggedDone, mode) => {
    const prompted = new Set<string>()
    expect(computeParentPromptDecision(parent, { ...resolved, loggedDone }, TODAY, prompted))
      .toEqual({ type: 'open', mode })
    expect(prompted.size).toBe(0)
  })

  it('suppresses a dismissed prompt until the children become incomplete', () => {
    const prompted = new Set([parent.id])
    expect(computeParentPromptDecision(parent, resolved, TODAY, prompted)).toEqual({ type: 'none' })
    expect(computeParentPromptDecision(parent, resolved, TODAY, prompted)).toEqual({ type: 'none' })
    expect(computeParentPromptDecision(parent, { ...resolved, done: 1 }, TODAY, prompted))
      .toEqual({ type: 'release' })
    prompted.delete(parent.id)
    expect(computeParentPromptDecision(parent, resolved, TODAY, prompted))
      .toEqual({ type: 'open', mode: 'log' })
  })

  it('releases a parent with no eligible children', () => {
    expect(computeParentPromptDecision(
      parent, { done: 0, total: 0, loggedDone: 0 }, TODAY, new Set([parent.id]),
    )).toEqual({ type: 'release' })
  })

  it('allows another parent and a ledger cleared for a new selected date', () => {
    const prompted = new Set(['another-parent'])
    expect(computeParentPromptDecision(parent, resolved, TODAY, prompted))
      .toEqual({ type: 'open', mode: 'log' })
    prompted.add(parent.id)
    prompted.clear()
    expect(computeParentPromptDecision(
      { ...parent, scheduledDates: ['2026-06-23'] }, resolved, '2026-06-23', prompted,
    )).toEqual({ type: 'open', mode: 'log' })
  })

  it('does nothing for missing, settled or unscheduled parents', () => {
    for (const unavailable of [
      null,
      { ...parent, isCompleted: true },
      { ...parent, isLoggedInRange: true },
      { ...parent, scheduledDates: [], dueDate: '2026-06-23' },
      { ...parent, isFlexible: true, flexibleTarget: 0, flexibleCompleted: 0 },
    ]) {
      expect(computeParentPromptDecision(unavailable, resolved, TODAY, new Set()))
        .toEqual({ type: 'none' })
    }
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
      skippedIds: new Set(),
    })

    expect(progress).toEqual({ done: 0, total: 1, loggedDone: 0 })
  })

  it('keeps a pending non-flexible child with zero flexible progress unresolved', () => {
    const pending = createMockHabit({
      id: 'pending',
      parentId: 'parent',
      isFlexible: false,
      flexibleTarget: 0,
      flexibleCompleted: 0,
      isLoggedInRange: false,
      scheduledDates: [TODAY],
    })

    const progress = computeParentPromptProgress({
      parentId: 'parent',
      getChildren: makeGetChildren({ parent: [pending] }),
      isRelevantToday: scheduledToday,
      isDueOnSelectedDate: scheduledToday,
      skippedIds: new Set(),
    })

    expect(progress).toEqual({ done: 0, total: 1, loggedDone: 0 })
    expect(computeParentSettlementDecision(
      createMockHabit({ id: 'parent', scheduledDates: [TODAY] }),
      progress,
      TODAY,
    )).toBeNull()
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
      skippedIds: new Set(['b']),
    })

    expect(progress.done).toBe(2)
    expect(progress.total).toBe(2)
    expect(progress.loggedDone).toBe(1)
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
      skippedIds: new Set(['c', 'gc']),
    })

    expect(progress.total).toBe(2)
    expect(progress.done).toBe(2)
    expect(progress.loggedDone).toBe(0)
  })
})

it.each([false, true])('excludes bad habits and their descendants from parent progress with slip %s', (isCompleted) => {
  const parent = createMockHabit({ id: 'parent', scheduledDates: [TODAY] })
  const good = createMockHabit({ id: 'good', parentId: parent.id, isCompleted: true })
  const bad = createMockHabit({ id: 'bad', parentId: parent.id, isBadHabit: true, isCompleted })
  const nested = createMockHabit({ id: 'nested', parentId: bad.id })
  const progress = computeParentPromptProgress({ parentId: parent.id, getChildren: makeGetChildren({ parent: [good, bad], bad: [nested] }), isRelevantToday: () => true, isDueOnSelectedDate: () => true, skippedIds: new Set() })
  expect(progress).toEqual({ done: 1, total: 1, loggedDone: 1 })
  expect(computeParentSettlementDecision({ ...parent, isBadHabit: true }, progress, TODAY)).toBeNull()
})
