import { describe, expect, it } from 'vitest'
import type { HabitStatus } from '../contracts/lists'
import { resolveHabitAccessibleStatus } from '../utils/habit-row-status'

describe('resolveHabitAccessibleStatus', () => {
  it('announces an unlogged bad habit as empty', () => {
    expect(resolveHabitAccessibleStatus('bad', false)).toBe('empty')
  })

  it('announces a logged bad habit as a recorded slip', () => {
    expect(resolveHabitAccessibleStatus('bad', true)).toBe('bad')
  })

  it.each<[HabitStatus, boolean]>([
    ['empty', false],
    ['empty', true],
    ['done', false],
    ['done', true],
    ['overdue', false],
    ['overdue', true],
  ])('preserves %s when isDoneForRange is %s', (status, isDoneForRange) => {
    expect(resolveHabitAccessibleStatus(status, isDoneForRange)).toBe(status)
  })
})
