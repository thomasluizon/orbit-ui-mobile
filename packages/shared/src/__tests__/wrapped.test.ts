import { describe, expect, it } from 'vitest'
import { buildWrappedSlides, getWeeklyConsistencyReading } from '../utils/wrapped'
import { createMockRecap, createMockRetrospectiveMetrics } from './factories'

describe('buildWrappedSlides', () => {
  it('produces the fixed positive-only story order ending on the share slide', () => {
    const slides = buildWrappedSlides(createMockRecap())

    expect(slides.map((slide) => slide.id)).toEqual([
      'intro',
      'completions',
      'activeDays',
      'consistency',
      'streak',
      'topHabit',
      'goals',
      'share',
    ])
    expect(slides).toHaveLength(8)
  })

  it('omits the standout-habit slide when there are no top habits, keeping share last', () => {
    const slides = buildWrappedSlides(
      createMockRecap({ metrics: createMockRetrospectiveMetrics({ topHabits: [] }) }),
    )

    expect(slides.map((slide) => slide.id)).toEqual([
      'intro',
      'completions',
      'activeDays',
      'consistency',
      'streak',
      'goals',
      'share',
    ])
    expect(slides).toHaveLength(7)
    expect(slides.at(-1)?.id).toBe('share')
  })

  it('carries the recap metric values on each stat slide', () => {
    const slides = buildWrappedSlides(
      createMockRecap({
        goalCompletions: 4,
        metrics: createMockRetrospectiveMetrics({
          totalCompletions: 42,
          activeDays: 5,
          completionRate: 73,
          bestStreak: 18,
          currentStreak: 9,
          weeklyConsistency: [10, 20, 30, 40, 50, 60, 70],
          topHabits: [
            { name: 'Read', emoji: '📚', completionRate: 91, completedCount: 20, scheduledCount: 22 },
          ],
        }),
      }),
    )

    const byId = Object.fromEntries(slides.map((slide) => [slide.id, slide]))
    expect(byId.completions).toMatchObject({ totalCompletions: 42 })
    expect(byId.activeDays).toMatchObject({ activeDays: 5, completionRate: 73 })
    expect(byId.streak).toMatchObject({ bestStreak: 18, currentStreak: 9 })
    expect(byId.consistency).toMatchObject({ weeklyConsistency: [10, 20, 30, 40, 50, 60, 70] })
    expect(byId.topHabit).toMatchObject({ habit: { name: 'Read' } })
    expect(byId.goals).toMatchObject({ closedGoals: 4 })
  })

  it('caps the consistency slide at seven days', () => {
    const slides = buildWrappedSlides(
      createMockRecap({
        metrics: createMockRetrospectiveMetrics({
          weeklyConsistency: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        }),
      }),
    )

    const consistency = slides.find((slide) => slide.id === 'consistency')
    expect(consistency).toMatchObject({ weeklyConsistency: [1, 2, 3, 4, 5, 6, 7] })
  })
})

describe('getWeeklyConsistencyReading', () => {
  it('returns thin when no weekday carries completions', () => {
    expect(getWeeklyConsistencyReading([0, 0, 0, 0, 0, 0, 0])).toEqual({ kind: 'thin' })
  })

  it('returns even when multiple weekdays share the highest average', () => {
    expect(getWeeklyConsistencyReading([50, 50, 0, 0, 0, 0, 0])).toEqual({ kind: 'even' })
  })

  it('returns the only strongest weekday when one maximum stands alone', () => {
    expect(getWeeklyConsistencyReading([0, 20, 0, 0, 0, 60, 0])).toEqual({
      kind: 'compared',
      strongestIndex: 5,
    })
  })
})
