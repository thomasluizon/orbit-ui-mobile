import { describe, expect, it } from 'vitest'
import {
  calculateXpProgress,
  deriveGamificationProfileState,
  deriveStreakFreezeState,
  detectGamificationMilestones,
  formatFreezeEarnProgress,
  getAchievementsByCategory,
  getEarnedAchievements,
  getLockedAchievements,
} from '../utils/gamification-selectors'
import type { GamificationProfile, StreakInfo } from '../types/gamification'

function makeProfile(overrides: Partial<GamificationProfile> = {}): GamificationProfile {
  return {
    totalXp: 500,
    level: 5,
    levelTitle: 'Adept',
    xpForCurrentLevel: 400,
    xpForNextLevel: 600,
    xpToNextLevel: 100,
    achievementsEarned: 2,
    achievementsTotal: 3,
    achievements: [
      {
        id: 'a-1',
        name: 'First Steps',
        description: 'Create your first habit',
        category: 'GettingStarted',
        rarity: 'Common',
        xpReward: 50,
        iconKey: 'star',
        isEarned: true,
        earnedAtUtc: '2025-01-01T00:00:00Z',
      },
      {
        id: 'a-2',
        name: '7-Day Streak',
        description: 'Complete 7 days in a row',
        category: 'Consistency',
        rarity: 'Uncommon',
        xpReward: 100,
        iconKey: 'flame',
        isEarned: true,
        earnedAtUtc: '2025-01-10T00:00:00Z',
      },
      {
        id: 'a-3',
        name: 'Goal Setter',
        description: 'Create your first goal',
        category: 'Goals',
        rarity: 'Common',
        xpReward: 50,
        iconKey: 'target',
        isEarned: false,
        earnedAtUtc: null,
      },
    ],
    userAchievements: [
      { achievementId: 'a-1', earnedAtUtc: '2025-01-01T00:00:00Z' },
      { achievementId: 'a-2', earnedAtUtc: '2025-01-10T00:00:00Z' },
    ],
    currentStreak: 7,
    longestStreak: 14,
    lastActiveDate: '2025-01-15',
    ...overrides,
  }
}

function makeStreakInfo(overrides: Partial<StreakInfo> = {}): StreakInfo {
  return {
    currentStreak: 7,
    longestStreak: 14,
    lastActiveDate: '2025-01-15',
    freezesUsedThisMonth: 1,
    freezesAvailable: 2,
    maxFreezesPerMonth: 3,
    maxFreezesHeld: 3,
    streakFreezeBalance: 2,
    daysUntilNextFreeze: 7,
    progressToNextFreeze: 0,
    isAtHeldCap: false,
    isFrozenToday: false,
    recentFreezeDates: ['2025-01-05'],
    ...overrides,
  }
}

describe('gamification-selectors', () => {
  it('calculates xp progress', () => {
    expect(calculateXpProgress(makeProfile())).toBe(50)
    expect(calculateXpProgress(makeProfile({ xpForCurrentLevel: 1000, xpForNextLevel: 1000 }))).toBe(100)
    expect(calculateXpProgress(null)).toBe(0)
  })

  it('returns earned achievements sorted by most recent', () => {
    const earned = getEarnedAchievements(makeProfile())
    expect(earned).toHaveLength(2)
    expect(earned[0]?.id).toBe('a-2')
    expect(earned[1]?.id).toBe('a-1')
  })

  it('returns locked achievements', () => {
    const locked = getLockedAchievements(makeProfile())
    expect(locked).toHaveLength(1)
    expect(locked[0]?.id).toBe('a-3')
  })

  it('groups achievements by category', () => {
    const groups = getAchievementsByCategory(makeProfile())
    expect(groups.map((group) => group.key)).toEqual(['GettingStarted', 'Consistency', 'Goals'])
  })

  it('derives the combined gamification profile state', () => {
    const derived = deriveGamificationProfileState(makeProfile())
    expect(derived.xpProgress).toBe(50)
    expect(derived.earnedAchievements.map((achievement) => achievement.id)).toEqual(['a-2', 'a-1'])
    expect(derived.lockedAchievements.map((achievement) => achievement.id)).toEqual(['a-3'])
    expect(derived.achievementsByCategory.map((group) => group.key)).toEqual([
      'GettingStarted',
      'Consistency',
      'Goals',
    ])
  })

  it('detects level-ups and new achievements against prior profile state', () => {
    const next = detectGamificationMilestones(
      makeProfile(),
      4,
      new Set(['a-1']),
      null,
    )

    expect(next.leveledUp).toBe(true)
    expect(next.newLevel).toBe(5)
    expect(next.newAchievements.map((achievement) => achievement.id)).toEqual(['a-2'])
    expect(Array.from(next.currentEarnedAchievementIds)).toEqual(['a-1', 'a-2'])
  })

  it('suppresses a repeated level-up once that level was acknowledged', () => {
    const next = detectGamificationMilestones(
      makeProfile(),
      4,
      new Set(['a-1']),
      5,
    )

    expect(next.leveledUp).toBe(false)
    expect(next.newLevel).toBeNull()
  })

  it('derives streak freeze state from streak info', () => {
    const derived = deriveStreakFreezeState(makeStreakInfo(), null, '2025-01-16')
    expect(derived.freezesAvailable).toBe(2)
    expect(derived.streakFreezeBalance).toBe(2)
    expect(derived.freezesUsedThisMonth).toBe(1)
    expect(derived.maxFreezesPerMonth).toBe(3)
    expect(derived.maxFreezesHeld).toBe(3)
    expect(derived.isAtHeldCap).toBe(false)
    expect(derived.canEarnMore).toBe(true)
    expect(derived.monthlyLimitReached).toBe(false)
    expect(derived.canFreeze).toBe(true)
    expect(derived.currentStreak).toBe(7)
  })

  it('falls back to profile values when streak info is missing', () => {
    const derived = deriveStreakFreezeState(
      null,
      { streakFreezesAvailable: 1, currentStreak: 4 },
      '2025-01-16',
    )
    expect(derived.freezesAvailable).toBe(1)
    expect(derived.streakFreezeBalance).toBe(0)
    expect(derived.currentStreak).toBe(4)
    // No earned balance means canFreeze is false despite the fallback value.
    expect(derived.canFreeze).toBe(false)
  })

  it('disallows freezes when balance is zero', () => {
    const derived = deriveStreakFreezeState(
      makeStreakInfo({ streakFreezeBalance: 0, freezesAvailable: 0 }),
      null,
      '2025-01-16',
    )
    expect(derived.canFreeze).toBe(false)
  })

  it('disallows freezes when the monthly cap is reached', () => {
    const derived = deriveStreakFreezeState(
      makeStreakInfo({ freezesUsedThisMonth: 3, freezesAvailable: 0 }),
      null,
      '2025-01-16',
    )
    expect(derived.monthlyLimitReached).toBe(true)
    expect(derived.canFreeze).toBe(false)
  })

  it('reports held cap correctly', () => {
    const derived = deriveStreakFreezeState(
      makeStreakInfo({ streakFreezeBalance: 3, isAtHeldCap: true }),
      null,
      '2025-01-16',
    )
    expect(derived.isAtHeldCap).toBe(true)
    expect(derived.canEarnMore).toBe(false)
  })

  it('disallows freezes when the user already completed today', () => {
    expect(
      deriveStreakFreezeState(makeStreakInfo({ lastActiveDate: '2025-01-16' }), null, '2025-01-16').canFreeze,
    ).toBe(false)
  })

  it('formats earn progress with target default 7', () => {
    expect(formatFreezeEarnProgress(0)).toBe('0 / 7')
    expect(formatFreezeEarnProgress(3)).toBe('3 / 7')
    expect(formatFreezeEarnProgress(7)).toBe('7 / 7')
    expect(formatFreezeEarnProgress(99)).toBe('7 / 7')
    expect(formatFreezeEarnProgress(-2)).toBe('0 / 7')
  })
})
