import { describe, it, expect } from 'vitest'
import {
  buildHabitDateBuckets,
  computeParentPromptProgress,
} from '../utils/habit-list-progress'
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

describe('computeParentPromptProgress', () => {
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
      assumeCompletedId: 'a',
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
      assumeCompletedId: 'b',
    })

    expect(progress.total).toBe(2)
    expect(progress.done).toBe(2)
    expect(progress.loggedDone).toBe(2)
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
