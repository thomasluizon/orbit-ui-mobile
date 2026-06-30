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
  | { id: 'share' }

export type WrappedSlideId = WrappedSlide['id']

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

  slides.push({ id: 'share' })
  return slides
}
