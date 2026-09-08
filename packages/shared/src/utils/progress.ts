import {
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
  startOfDay,
} from 'date-fns'
import type { Achievement, GamificationProfile } from '../types/gamification'
import type { Goal, GoalPositionItem, GoalStatus } from '../types/goal'
import type { Profile } from '../types/profile'
import { nowDate } from './dates'

type ProgressQueryState = { isLoading: boolean; isError: boolean }

export function deriveProgressViewState({ goalCount, account, goals, gamification, canView }: {
  goalCount: number
  account: ProgressQueryState & {
    profile: Pick<Profile, 'currentStreak' | 'longestStreak' | 'totalXp'> | undefined
  }
  goals: ProgressQueryState
  gamification: ProgressQueryState & {
    profile: Pick<GamificationProfile, 'currentStreak' | 'longestStreak' | 'totalXp' | 'achievementsEarned'> | null
  }
  canView: boolean
}): { loading: boolean; error: boolean; empty: boolean } {
  const error = account.isError || goals.isError || (canView && gamification.isError)
  const loading = !error && (account.isLoading || goals.isLoading || (canView && gamification.isLoading))
  const empty = !loading && !error && isProgressEmpty(goalCount, account.profile, canView ? gamification.profile : null)
  return { loading, error, empty }
}

export function isProgressEmpty(
  goalCount: number,
  account: Pick<Profile, 'currentStreak' | 'longestStreak' | 'totalXp'> | undefined,
  gamification: Pick<GamificationProfile, 'currentStreak' | 'longestStreak' | 'totalXp' | 'achievementsEarned'> | null,
): boolean {
  if (!account || goalCount > 0) return false
  return account.currentStreak === 0 && account.longestStreak === 0 && account.totalXp === 0
    && (!gamification || (gamification.currentStreak === 0 && gamification.longestStreak === 0
      && gamification.totalXp === 0 && gamification.achievementsEarned === 0))
}

export const PROGRESS_GOAL_FILTERS = ['all', 'active', 'completed', 'abandoned'] as const
export type ProgressGoalFilter = (typeof PROGRESS_GOAL_FILTERS)[number]
export type GoalDeadlineState = 'overdue' | 'dueToday' | 'soon' | 'later'
export type AchievementGlyphKey =
  | 'calendar'
  | 'flame'
  | 'satellite'
  | 'shield'
  | 'star'
  | 'sun'
  | 'target'
  | 'trophy'
  | 'zap'

const HIDDEN_ACHIEVEMENT_CATEGORIES = new Set(['Social', 'Sharing', 'Together'])
const GAMIFICATION_LEVEL_TITLE_KEYS = [
  'starter',
  'explorer',
  'orbiter',
  'navigator',
  'pilot',
  'captain',
  'commander',
  'admiral',
  'elite',
  'legend',
] as const

export function achievementGlyphKey(iconKey: string): AchievementGlyphKey {
  if (/goal|target|dream/.test(iconKey)) return 'target'
  if (/streak|warrior|momentum|habit|dedicated|relentless/.test(iconKey)) return 'flame'
  if (/week|month|year|quarter|calendar/.test(iconKey)) return 'calendar'
  if (/perfect_day|early_bird|night_owl/.test(iconKey)) return 'sun'
  if (/breaker|shield/.test(iconKey)) return 'shield'
  if (/liftoff|orbit|mission|onboarding/.test(iconKey)) return 'satellite'
  if (/perfect|comeback|bolt/.test(iconKey)) return 'zap'
  if (/champion|centurion|hero|titan|overachiever|trophy/.test(iconKey)) return 'trophy'
  return 'star'
}

export function filterProgressGoals(
  goals: readonly Goal[],
  filter: ProgressGoalFilter,
): Goal[] {
  if (filter === 'all') return [...goals]
  const status: GoalStatus =
    filter === 'active' ? 'Active' : filter === 'completed' ? 'Completed' : 'Abandoned'
  return goals.filter((goal) => goal.status === status)
}

export function buildGoalMovePositions(
  goals: readonly Goal[],
  goalId: string,
  targetIndex: number,
): GoalPositionItem[] | null {
  const fromIndex = goals.findIndex((goal) => goal.id === goalId)
  const boundedTarget = Math.max(0, Math.min(goals.length - 1, targetIndex))
  if (fromIndex < 0 || fromIndex === boundedTarget) return null

  const reordered = [...goals]
  const [moved] = reordered.splice(fromIndex, 1)
  if (!moved) return null
  reordered.splice(boundedTarget, 0, moved)
  return reordered.map((goal, position) => ({ id: goal.id, position }))
}

export function getGoalDeadlinePresentation(
  deadline: string | null | undefined,
  status: GoalStatus,
  now: Date = new Date(),
): { days: number; state: GoalDeadlineState } | null {
  if (!deadline || status !== 'Active') return null
  const days = differenceInCalendarDays(parseISO(deadline), now)
  if (days < 0) return { days: Math.abs(days), state: 'overdue' }
  if (days === 0) return { days, state: 'dueToday' }
  return { days, state: days <= 7 ? 'soon' : 'later' }
}

export function visibleProgressAchievements(
  achievements: readonly Achievement[],
): Achievement[] {
  return achievements.filter(
    (achievement) => !HIDDEN_ACHIEVEMENT_CATEGORIES.has(achievement.category),
  )
}

export function getGamificationLevelTitleKey(level: number): string {
  const index = Math.max(0, Math.min(GAMIFICATION_LEVEL_TITLE_KEYS.length - 1, level - 1))
  return `progressScreen.achievements.levelTitles.${GAMIFICATION_LEVEL_TITLE_KEYS[index]}`
}

export function getAvailableStreakRepairDate(
  isRepairAvailable: boolean | undefined,
  repairDate: string | null | undefined,
): string | null {
  return isRepairAvailable === true && repairDate ? repairDate : null
}

function getProtectedAccountToday(timeZone?: string | null): string {
  const now = nowDate()
  try {
    const accountDateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      calendar: 'iso8601',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const year = accountDateParts.find((part) => part.type === 'year')?.value
    const month = accountDateParts.find((part) => part.type === 'month')?.value
    const day = accountDateParts.find((part) => part.type === 'day')?.value
    return `${year}-${month}-${day}`
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    return now.toISOString().slice(0, 10)
  }
}

export function buildProtectedDayLabels(
  dates: readonly string[],
  locale?: string,
  isFrozenToday = false,
  accountTimeZone?: string | null,
): { id: string; dateLabel: string; isToday: boolean }[] {
  const accountToday = isFrozenToday ? getProtectedAccountToday(accountTimeZone) : null
  const protectedDays = [...new Set(dates)].sort((leftDate, rightDate) => {
    if (leftDate === rightDate) return 0
    return leftDate < rightDate ? 1 : -1
  }).flatMap((date) => {
    const parsed = startOfDay(parseISO(date))
    if (!isValid(parsed)) return []
    return [{
      id: date,
      dateLabel: locale ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(parsed) : format(parsed, 'yyyy-MM-dd'),
    }]
  })
  return protectedDays.map((day) => ({ ...day, isToday: isFrozenToday && day.id === accountToday }))
}
