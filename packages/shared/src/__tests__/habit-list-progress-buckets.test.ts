import { describe, expect, it } from 'vitest'
import { createMockHabit } from './factories'
import { buildHabitDateBuckets } from '../utils/habit-list-progress'

describe('buildHabitDateBuckets', () => {
  const today = '2026-04-06'

  it('separates overdue habits, buckets undated ones, and clamps past due dates to today', () => {
    const overdue = createMockHabit({ id: 'overdue', isOverdue: true, isCompleted: false, dueDate: '2026-01-01' })
    const undated = createMockHabit({ id: 'undated', isOverdue: false, isCompleted: false, dueDate: '' })
    const past = createMockHabit({ id: 'past', isOverdue: false, isCompleted: false, dueDate: '2020-01-01' })
    const future = createMockHabit({ id: 'future', isOverdue: false, isCompleted: false, dueDate: '2030-01-01' })

    const buckets = buildHabitDateBuckets([overdue, undated, past, future], today)

    expect(buckets[0]).toMatchObject({ key: '__overdue__', isOverdue: true })
    expect(buckets[0]?.habits.map((habit) => habit.id)).toEqual(['overdue'])

    const dateBuckets = buckets.slice(1)
    expect(dateBuckets.map((bucket) => bucket.key)).toEqual(['', today, '2030-01-01'])
    expect(dateBuckets.find((bucket) => bucket.key === today)?.habits.map((habit) => habit.id)).toEqual(['past'])
    expect(dateBuckets.every((bucket) => bucket.isOverdue === false)).toBe(true)
  })

  it('keeps a completed-but-overdue habit out of the overdue section', () => {
    const completedOverdue = createMockHabit({ id: 'done', isOverdue: true, isCompleted: true, dueDate: today })

    const buckets = buildHabitDateBuckets([completedOverdue], today)

    expect(buckets.some((bucket) => bucket.key === '__overdue__')).toBe(false)
    expect(buckets[0]?.key).toBe(today)
  })
})
