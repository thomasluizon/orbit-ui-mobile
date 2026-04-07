import { describe, expect, it } from 'vitest'
import {
  getHabitProgressStrokeDasharray,
  HABIT_PROGRESS_RING_CIRCUMFERENCE,
} from '@/lib/habit-progress'

describe('habit progress ring', () => {
  it('returns a partial arc for incomplete progress', () => {
    expect(getHabitProgressStrokeDasharray(33, false)).toBe(
      `31.10 ${HABIT_PROGRESS_RING_CIRCUMFERENCE}`,
    )
  })

  it('returns a full arc for completed parents', () => {
    expect(getHabitProgressStrokeDasharray(33, true)).toBe(
      `94.25 ${HABIT_PROGRESS_RING_CIRCUMFERENCE}`,
    )
  })

  it('clamps progress percent to the valid range', () => {
    expect(getHabitProgressStrokeDasharray(180, false)).toBe(
      `94.25 ${HABIT_PROGRESS_RING_CIRCUMFERENCE}`,
    )
    expect(getHabitProgressStrokeDasharray(-10, false)).toBe(
      `0.00 ${HABIT_PROGRESS_RING_CIRCUMFERENCE}`,
    )
  })
})
