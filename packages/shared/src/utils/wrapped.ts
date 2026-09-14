import type { Recap } from '../types/gamification'
import type { RetrospectiveHabitStat } from './retrospective'

/**
 * One Orbit Wrapped story slide, discriminated by `id` and carrying the recap
 * metric value(s) it celebrates so web and mobile render identical content.
 */
export type WrappedSlide =
  | { id: 'intro' }
  | { id: 'completions'; totalCompletions: number }
  | { id: 'activeDays'; activeDays: number; completionRate: number }
  | { id: 'consistency'; weeklyConsistency: number[] }
  | { id: 'streak'; bestStreak: number; currentStreak: number }
  | { id: 'topHabit'; habit: RetrospectiveHabitStat }
  | { id: 'goals'; closedGoals: number }
  | { id: 'share' }

export type WrappedSlideId = WrappedSlide['id']

export interface WeeklyConsistencyComparison {
  strongestIndex: number
  weakestIndex: number
}

/** A weekday comparison needs completion averages from at least two weekdays. */
export function hasEnoughWeeklyConsistencyToCompare(weeklyConsistency: readonly number[]): boolean {
  return weeklyConsistency.slice(0, 7).filter((value) => value > 0).length >= 2
}

/** Finds the first strongest and quietest logged weekdays in Monday-first order. */
export function getWeeklyConsistencyComparison(
  weeklyConsistency: readonly number[],
): WeeklyConsistencyComparison {
  let strongestIndex = -1
  let strongestValue = Number.NEGATIVE_INFINITY
  let weakestIndex = -1
  let weakestValue = Number.POSITIVE_INFINITY

  for (let index = 0; index < Math.min(weeklyConsistency.length, 7); index++) {
    const value = weeklyConsistency[index]!
    if (value <= 0) continue
    if (value > strongestValue) {
      strongestIndex = index
      strongestValue = value
    }
    if (value < weakestValue) {
      weakestIndex = index
      weakestValue = value
    }
  }

  return { strongestIndex, weakestIndex }
}

/**
 * Builds the ordered Orbit Wrapped story from a recap: a fixed positive-only
 * sequence (intro → completions → active days → consistency → best streak →
 * standout habit), omitting the standout slide when there are no top habits,
 * and always ending on the shareable card slide.
 */
export function buildWrappedSlides(recap: Recap): WrappedSlide[] {
  const { metrics } = recap

  const slides: WrappedSlide[] = [
    { id: 'intro' },
    { id: 'completions', totalCompletions: metrics.totalCompletions },
    {
      id: 'activeDays',
      activeDays: metrics.activeDays,
      completionRate: metrics.completionRate,
    },
    { id: 'consistency', weeklyConsistency: metrics.weeklyConsistency.slice(0, 7) },
    { id: 'streak', bestStreak: metrics.bestStreak, currentStreak: metrics.currentStreak },
  ]

  const topHabit = metrics.topHabits[0]
  if (topHabit) {
    slides.push({ id: 'topHabit', habit: topHabit })
  }

  slides.push({ id: 'goals', closedGoals: recap.goalCompletions }, { id: 'share' })
  return slides
}
