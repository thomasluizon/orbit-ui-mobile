import type { CompletionSeries } from '../types/gamification'
import { localCalendarDate } from './completion-series'
import { extractBackendErrorCode, isPayGateError } from './error-utils'
import type { StreakRepairState } from './progress'
import type { RetrospectiveResponse } from './retrospective'
import { getReturningIntervalBetween } from './returning-interval'

const NO_HABITS_FOR_PERIOD = 'NO_HABITS_FOR_PERIOD'

/** What the 30-day window of Progresso can show. `locked` is the Pro gate, `empty` is the window with no habit. */
export type ProgressWindowStatus = 'locked' | 'loading' | 'empty' | 'error' | 'ready'

export function resolveProgressWindowStatus(query: {
  readonly data?: RetrospectiveResponse | undefined
  readonly error: unknown
  readonly isLoading: boolean
  readonly isError: boolean
}): ProgressWindowStatus {
  if (isPayGateError(query.error)) return 'locked'
  if (query.isLoading) return 'loading'
  if (query.isError) return extractBackendErrorCode(query.error) === NO_HABITS_FOR_PERIOD ? 'empty' : 'error'
  return query.data ? 'ready' : 'loading'
}

/** One full templated string per case. The caller passes it to its translator. */
export type ProgressOrbitLine =
  | { readonly key: 'progressScreen.orbit.activeDays'; readonly values: { readonly days: number } }
  | { readonly key: 'progressScreen.orbit.quietWindow'; readonly values?: undefined }
  | { readonly key: 'progressScreen.orbit.day'; readonly values: { readonly weekday: string; readonly date: string; readonly done: number; readonly total: number } }
  | { readonly key: 'progressScreen.orbit.dayUnscheduled'; readonly values: { readonly weekday: string; readonly date: string } }
  | { readonly key: 'progressScreen.orbit.returned'; readonly values?: undefined }
  | { readonly key: 'progressScreen.orbit.empty'; readonly values?: undefined }

type SeriesPoint = CompletionSeries['points'][number]

function previousActiveIndex(points: readonly SeriesPoint[], index: number): number {
  for (let candidate = index - 1; candidate >= 0; candidate--) {
    if (points[candidate]!.completed > 0) return candidate
  }
  return -1
}

/**
 * After a gap: the person has activity today or yesterday, and the active day before it is far enough back
 * that Hoje showed its returning line (the shared `getReturningIntervalBetween` rule). The window ends today.
 * A window with no earlier activity is not a return, because a new account has no earlier activity either.
 */
export function hasReturnedAfterGap(series: CompletionSeries | null | undefined): boolean {
  if (series?.granularity !== 'day') return false
  const points = series.points
  const lastIndex = points.length - 1
  return [lastIndex, lastIndex - 1].some((returnIndex) => {
    const returnDay = points[returnIndex]
    if (!returnDay || returnDay.completed === 0) return false
    const previous = previousActiveIndex(points, returnIndex)
    return previous >= 0 && getReturningIntervalBetween(points[previous]!.endDate, returnDay.startDate) !== null
  })
}

function sentenceStart(word: string, locale: string): string {
  return word.charAt(0).toLocaleUpperCase(locale) + word.slice(1)
}

function dayLine(point: SeriesPoint, locale: string): ProgressOrbitLine {
  const day = localCalendarDate(point.startDate)
  const weekday = sentenceStart(new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(day), locale)
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(day)
  if (point.scheduled === 0) return { key: 'progressScreen.orbit.dayUnscheduled', values: { weekday, date } }
  return { key: 'progressScreen.orbit.day', values: { weekday, date, done: point.completed, total: point.scheduled } }
}

/**
 * The Orbit line of the Progresso root: one fact from the 30-day read the screen already makes. It never counts
 * misses. It is absent while the window loads, fails or sits behind the Pro gate, because Orbit never pitches.
 */
export function resolveProgressOrbitLine(
  status: ProgressWindowStatus,
  metrics: Pick<RetrospectiveResponse['metrics'], 'activeDays' | 'completionSeries'> | null | undefined,
  selectedDate: string | null,
  locale: string,
): ProgressOrbitLine | null {
  if (status === 'empty') return { key: 'progressScreen.orbit.empty' }
  if (status !== 'ready' || !metrics) return null
  const series = metrics.completionSeries
  const selected = series?.granularity === 'day' ? series.points.find((point) => point.startDate === selectedDate) : undefined
  if (selected) return dayLine(selected, locale)
  if (hasReturnedAfterGap(series)) return { key: 'progressScreen.orbit.returned' }
  if (metrics.activeDays === 0) return { key: 'progressScreen.orbit.quietWindow' }
  return { key: 'progressScreen.orbit.activeDays', values: { days: metrics.activeDays } }
}

export type StreakOrbitLine =
  | { readonly key: 'progressScreen.streak.gapBody'; readonly values: { readonly count: number } }
  | { readonly key: 'progressScreen.streak.gapUnavailable'; readonly values?: undefined }
  | { readonly key: 'progressScreen.orbit.streak'; readonly values: { readonly count: number; readonly days: number } }
  | { readonly key: 'progressScreen.orbit.streakOnly'; readonly values: { readonly count: number } }

/**
 * The Orbit line of Sequência. In the gap state it is the gap sentence that exists, and the screen shows the
 * repair. Otherwise it states the streak and the days to the next freeze, or only the streak when the bank
 * is full and no freeze is on its way.
 */
export function resolveStreakOrbitLine(input: {
  readonly repair: StreakRepairState
  readonly currentStreak: number
  readonly banked: number
  readonly ceiling: number
  readonly daysUntilNextFreeze: number
}): StreakOrbitLine {
  if (input.repair.gapUnavailable) return { key: 'progressScreen.streak.gapUnavailable' }
  if (input.repair.showGap) return { key: 'progressScreen.streak.gapBody', values: { count: input.repair.count } }
  if (input.banked >= input.ceiling || input.daysUntilNextFreeze <= 0) {
    return { key: 'progressScreen.orbit.streakOnly', values: { count: input.currentStreak } }
  }
  return { key: 'progressScreen.orbit.streak', values: { count: input.currentStreak, days: input.daysUntilNextFreeze } }
}
