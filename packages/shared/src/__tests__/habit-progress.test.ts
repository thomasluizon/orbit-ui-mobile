import { describe, expect, it } from 'vitest'
import {
  HABIT_PROGRESS_RING_CIRCUMFERENCE,
  getHabitProgressRatio,
  getHabitProgressStrokeDasharray,
  shouldShowHabitProgressArc,
} from '../utils/habit-progress'
import { createMockHabit } from './factories'

describe('getHabitProgressStrokeDasharray', () => {
  it('returns full circumference when done for range', () => {
    const value = getHabitProgressStrokeDasharray(0, true)
    expect(value).toBe(`${HABIT_PROGRESS_RING_CIRCUMFERENCE.toFixed(2)} ${HABIT_PROGRESS_RING_CIRCUMFERENCE}`)
  })

  it('renders proportional fill when not done', () => {
    const value = getHabitProgressStrokeDasharray(50, false)
    const filled = (HABIT_PROGRESS_RING_CIRCUMFERENCE * 0.5).toFixed(2)
    expect(value).toBe(`${filled} ${HABIT_PROGRESS_RING_CIRCUMFERENCE}`)
  })

  it('clamps negative values to 0', () => {
    const value = getHabitProgressStrokeDasharray(-25, false)
    expect(value).toBe(`0.00 ${HABIT_PROGRESS_RING_CIRCUMFERENCE}`)
  })

  it('clamps overflows to 100', () => {
    const value = getHabitProgressStrokeDasharray(150, false)
    expect(value).toBe(`${HABIT_PROGRESS_RING_CIRCUMFERENCE.toFixed(2)} ${HABIT_PROGRESS_RING_CIRCUMFERENCE}`)
  })
})

describe('getHabitProgressRatio', () => {
  it('returns 1 when habit is completed', () => {
    const habit = createMockHabit({ isCompleted: true })
    expect(getHabitProgressRatio(habit)).toBe(1)
  })

  it('returns 1 when habit is logged in range', () => {
    const habit = createMockHabit({ isLoggedInRange: true })
    expect(getHabitProgressRatio(habit)).toBe(1)
  })

  it('uses children ratio for parents with children', () => {
    const habit = createMockHabit()
    expect(
      getHabitProgressRatio(habit, { hasChildren: true, childrenDone: 2, childrenTotal: 4 }),
    ).toBe(0.5)
  })

  it('uses flexible target when no children', () => {
    const habit = createMockHabit({
      isFlexible: true,
      flexibleTarget: 3,
      flexibleCompleted: 1,
      frequencyUnit: 'Week',
      frequencyQuantity: 3,
    })
    expect(getHabitProgressRatio(habit)).toBeCloseTo(0.3333, 3)
  })

  it('falls back to frequencyQuantity when flexibleTarget is null', () => {
    const habit = createMockHabit({
      isFlexible: true,
      flexibleTarget: null,
      flexibleCompleted: 2,
      frequencyUnit: 'Week',
      frequencyQuantity: 4,
    })
    expect(getHabitProgressRatio(habit)).toBe(0.5)
  })

  it('returns 0 for simple, not-yet-completed habits', () => {
    const habit = createMockHabit({ isCompleted: false, isFlexible: false })
    expect(getHabitProgressRatio(habit)).toBe(0)
  })

  it('clamps overflow ratios', () => {
    const habit = createMockHabit({
      isFlexible: true,
      flexibleTarget: 2,
      flexibleCompleted: 5,
    })
    expect(getHabitProgressRatio(habit)).toBe(1)
  })
})

describe('shouldShowHabitProgressArc', () => {
  it('hides for simple completed habits (tile state communicates completion)', () => {
    const habit = createMockHabit({ isCompleted: true })
    expect(shouldShowHabitProgressArc(habit)).toBe(false)
  })

  it('shows for parents with children', () => {
    const habit = createMockHabit()
    expect(
      shouldShowHabitProgressArc(habit, { hasChildren: true, childrenTotal: 2 }),
    ).toBe(true)
  })

  it('shows for flexible habits with a positive target', () => {
    const habit = createMockHabit({ isFlexible: true, flexibleTarget: 3 })
    expect(shouldShowHabitProgressArc(habit)).toBe(true)
  })

  it('hides for simple, undone habits', () => {
    const habit = createMockHabit({ isCompleted: false, isFlexible: false })
    expect(shouldShowHabitProgressArc(habit)).toBe(false)
  })
})
