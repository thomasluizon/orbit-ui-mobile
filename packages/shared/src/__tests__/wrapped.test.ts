import { describe, expect, it } from 'vitest'
import { buildWrappedSlides, formatClosedWrappedMonth, getWeeklyConsistencyReading, getWrappedWeekdayValues } from '../utils/wrapped'
import { createMockRecap, createMockRetrospectiveMetrics } from './factories'

describe('formatClosedWrappedMonth', () => {
  it.each([
    ['en', 1, 'January 2026'],
    ['en', 12, 'December 2026'],
    ['pt-BR', 1, 'Janeiro de 2026'],
    ['pt-BR', 12, 'Dezembro de 2026'],
  ])('formats %s month %i in the calendar month', (locale, month, label) => {
    expect(formatClosedWrappedMonth({ year: 2026, month }, locale)).toBe(label)
  })

  it('keeps January in January under a negative UTC offset', () => {
    const date = new Date(0)
    date.setUTCFullYear(2026, 0, 1)
    expect(new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date))
      .toBe(formatClosedWrappedMonth({ year: 2026, month: 1 }, 'en'))
  })
})

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


describe('getWrappedWeekdayValues', () => {
  const values = [100, 50, 0, 0, 90, 90, 90]

  it('keeps elapsed measurements and masks the rest of the current week', () => {
    const measured = getWrappedWeekdayValues(values, 'week', new Date(2026, 9, 1, 12))
    expect(measured).toEqual([100, 50, 0, 0, null, null, null])
    expect(getWeeklyConsistencyReading(measured)).toEqual({ kind: 'compared', strongestIndex: 0 })
    expect(values).toEqual([100, 50, 0, 0, 90, 90, 90])
  })

  it('keeps only Monday on Monday and the whole week on Sunday', () => {
    expect(getWrappedWeekdayValues(values, 'week', new Date(2026, 8, 28, 12)))
      .toEqual([100, null, null, null, null, null, null])
    expect(getWrappedWeekdayValues(values, 'week', new Date(2026, 9, 4, 12))).toEqual(values)
  })

  it.each(['month', 'year'] as const)('retains every weekday average for %s', (period) => {
    expect(getWrappedWeekdayValues(values, period, new Date(2026, 9, 1, 12))).toEqual(values)
  })

  it('does not derive a strongest weekday from unavailable values', () => {
    expect(getWeeklyConsistencyReading([0, null, null, null, null, null, null])).toEqual({ kind: 'thin' })
    expect(getWeeklyConsistencyReading([null, null, null, null, null, null, null])).toEqual({ kind: 'thin' })
  })
})
