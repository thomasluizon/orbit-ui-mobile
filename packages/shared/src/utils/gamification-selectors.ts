import { formatAPIDate } from './dates'
import type { Achievement, AchievementCategory, GamificationProfile, StreakInfo } from '../types/gamification'

const ACHIEVEMENT_CATEGORIES: AchievementCategory[] = [
  'GettingStarted',
  'Consistency',
  'Volume',
  'Goals',
  'Perfection',
  'Special',
]

export interface StreakFreezeFallback {
  streakFreezesAvailable?: number | null
  currentStreak?: number | null
}

export interface StreakFreezeDerivedState {
  freezesAvailable: number
  isFrozenToday: boolean
  hasCompletedToday: boolean
  currentStreak: number
  canFreeze: boolean
  streakFreezesAccumulated: number
  maxStreakFreezesAccumulated: number
  daysUntilNextFreeze: number
  freezesUsedThisMonth: number
  maxFreezesPerMonth: number
  canEarnMore: boolean
  hasReachedMonthlyLimit: boolean
}

export interface GamificationProfileDerivedState {
  xpProgress: number
  earnedAchievements: Achievement[]
  lockedAchievements: Achievement[]
  achievementsByCategory: Array<{ key: AchievementCategory; items: Achievement[] }>
}

export interface GamificationMilestoneState {
  leveledUp: boolean
  newLevel: number | null
  newAchievements: Achievement[]
  currentEarnedAchievementIds: Set<string>
}

export function calculateXpProgress(
  profile: Pick<GamificationProfile, 'totalXp' | 'xpForCurrentLevel' | 'xpForNextLevel'> | null | undefined,
): number {
  if (!profile) return 0
  const range = profile.xpForNextLevel - profile.xpForCurrentLevel
  if (range <= 0) return 100
  const progress = profile.totalXp - profile.xpForCurrentLevel
  return Math.min(100, Math.max(0, Math.round((progress / range) * 100)))
}

export function getEarnedAchievements(
  profile: Pick<GamificationProfile, 'achievements' | 'userAchievements'> | null | undefined,
): Achievement[] {
  if (!profile) return []
  const earnedMap = new Map(
    profile.userAchievements.map((userAchievement) => [userAchievement.achievementId, userAchievement.earnedAtUtc]),
  )

  return profile.achievements
    .filter((achievement) => earnedMap.has(achievement.id))
    .map((achievement) => ({
      ...achievement,
      earnedAtUtc: earnedMap.get(achievement.id) ?? '',
    }))
    .sort((left, right) => (right.earnedAtUtc ?? '').localeCompare(left.earnedAtUtc ?? ''))
}

export function getLockedAchievements(
  profile: Pick<GamificationProfile, 'achievements' | 'userAchievements'> | null | undefined,
): Achievement[] {
  if (!profile) return []
  const earnedIds = new Set(profile.userAchievements.map((userAchievement) => userAchievement.achievementId))
  return profile.achievements.filter((achievement) => !earnedIds.has(achievement.id))
}

export function getAchievementsByCategory(
  profile: Pick<GamificationProfile, 'achievements'> | null | undefined,
): Array<{ key: AchievementCategory; items: Achievement[] }> {
  if (!profile) return []

  return ACHIEVEMENT_CATEGORIES
    .map((category) => ({
      key: category,
      items: profile.achievements.filter((achievement) => achievement.category === category),
    }))
    .filter((categoryGroup) => categoryGroup.items.length > 0)
}

export function deriveStreakFreezeState(
  streakInfo: Partial<Pick<
    StreakInfo,
    | 'currentStreak'
    | 'lastActiveDate'
    | 'freezesAvailable'
    | 'isFrozenToday'
    | 'streakFreezesAccumulated'
    | 'maxStreakFreezesAccumulated'
    | 'daysUntilNextFreeze'
    | 'freezesUsedThisMonth'
    | 'freezesAvailableToUse'
    | 'maxFreezesPerMonth'
    | 'canEarnMore'
  >> | null | undefined,
  fallbackProfile?: StreakFreezeFallback | null,
  today = formatAPIDate(new Date()),
): StreakFreezeDerivedState {
  const streakFreezesAccumulated = streakInfo?.streakFreezesAccumulated
    ?? fallbackProfile?.streakFreezesAvailable
    ?? 0
  const maxStreakFreezesAccumulated = streakInfo?.maxStreakFreezesAccumulated ?? 3
  const freezesUsedThisMonth = streakInfo?.freezesUsedThisMonth ?? 0
  const maxFreezesPerMonth = streakInfo?.maxFreezesPerMonth ?? 3
  const remainingMonthlyQuota = Math.max(0, maxFreezesPerMonth - freezesUsedThisMonth)
  const freezesAvailable = streakInfo?.freezesAvailableToUse
    ?? Math.min(streakFreezesAccumulated, remainingMonthlyQuota)
  const isFrozenToday = streakInfo?.isFrozenToday ?? false
  const hasCompletedToday = streakInfo?.lastActiveDate === today
  const currentStreak = streakInfo?.currentStreak ?? fallbackProfile?.currentStreak ?? 0
  const daysUntilNextFreeze = streakInfo?.daysUntilNextFreeze ?? 7
  const canEarnMore = streakInfo?.canEarnMore ?? streakFreezesAccumulated < maxStreakFreezesAccumulated
  const canFreeze = freezesAvailable > 0 && !isFrozenToday && !hasCompletedToday && currentStreak > 0
  const hasReachedMonthlyLimit = remainingMonthlyQuota <= 0

  return {
    freezesAvailable,
    isFrozenToday,
    hasCompletedToday,
    currentStreak,
    canFreeze,
    streakFreezesAccumulated,
    maxStreakFreezesAccumulated,
    daysUntilNextFreeze,
    freezesUsedThisMonth,
    maxFreezesPerMonth,
    canEarnMore,
    hasReachedMonthlyLimit,
  }
}

export function deriveGamificationProfileState(
  profile: GamificationProfile | null | undefined,
): GamificationProfileDerivedState {
  return {
    xpProgress: calculateXpProgress(profile),
    earnedAchievements: getEarnedAchievements(profile),
    lockedAchievements: getLockedAchievements(profile),
    achievementsByCategory: getAchievementsByCategory(profile),
  }
}

export function detectGamificationMilestones(
  profile: GamificationProfile | null | undefined,
  previousLevel: number | null,
  previousAchievementIds: ReadonlySet<string>,
  acknowledgedLevel: number | null,
): GamificationMilestoneState {
  if (!profile) {
    return {
      leveledUp: false,
      newLevel: null,
      newAchievements: [],
      currentEarnedAchievementIds: new Set<string>(),
    }
  }

  const currentEarnedAchievementIds = new Set(
    profile.userAchievements.map((userAchievement) => userAchievement.achievementId),
  )

  const leveledUp =
    previousLevel !== null && profile.level > previousLevel && profile.level !== acknowledgedLevel

  const newAchievements =
    previousAchievementIds.size > 0
      ? profile.achievements.filter(
          (achievement) =>
            currentEarnedAchievementIds.has(achievement.id)
            && !previousAchievementIds.has(achievement.id),
        )
      : []

  return {
    leveledUp,
    newLevel: leveledUp ? profile.level : null,
    newAchievements,
    currentEarnedAchievementIds,
  }
}
