import type { Recap } from '../types/gamification'
import type { RetrospectiveHabitStat } from './retrospective'
import type { RecapSharePeriod, ClosedRecapMonth } from './share-card'

export function formatClosedWrappedMonth(closedMonth: ClosedRecapMonth, locale: string): string {
  const date = new Date(0)
  date.setUTCFullYear(closedMonth.year, closedMonth.month - 1, 1)
  const label = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1)
}

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

export type WeeklyConsistencyReading =
  | { kind: 'thin' }
  | { kind: 'even' }
  | { kind: 'compared'; strongestIndex: number }

export function getWrappedWeekdayValues(
  weeklyConsistency: readonly number[],
  period: RecapSharePeriod,
  today: Date = new Date(),
): (number | null)[] {
  const todayIndex = (today.getDay() + 6) % 7
  return weeklyConsistency.slice(0, 7).map((value, index) =>
    period === 'week' && index > todayIndex ? null : value,
  )
}

export function getWeeklyConsistencyReading(
  weeklyConsistency: readonly (number | null)[],
): WeeklyConsistencyReading {
  const weekdayAverages = weeklyConsistency.slice(0, 7)
  const highestAverage = Math.max(0, ...weekdayAverages.flatMap((value) => value === null ? [] : [value]))
  if (highestAverage <= 0) return { kind: 'thin' }

  const strongestWeekdays = weekdayAverages
    .map((average, index) => ({ average, index }))
    .filter(({ average }) => average === highestAverage)
  if (strongestWeekdays.length !== 1) return { kind: 'even' }

  return { kind: 'compared', strongestIndex: strongestWeekdays[0]!.index }
}

/**
 * Builds the ordered Orbit Wrapped story from a recap: a fixed positive-only
 * sequence (intro → completions → active days → consistency → best streak →
 * standout habit → goals), omitting the standout slide when there are no top
 * habits, and always ending on the shareable card slide.
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
