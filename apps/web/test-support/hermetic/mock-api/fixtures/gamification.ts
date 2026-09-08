import type { GamificationProfile } from '@orbit/shared/types/gamification'

/**
 * Defensive fixture: the profile fixture sets `canViewGamification: false`, so the
 * layout never requests this. Provided so an accidental fetch still returns a
 * schema-valid, deterministic body instead of falling through to the catch-all.
 */
export const gamificationProfileFixture = {
  totalXp: 0,
  level: 1,
  levelTitle: 'Newcomer',
  xpForCurrentLevel: 0,
  xpForNextLevel: 100,
  xpToNextLevel: 100,
  achievementsEarned: 0,
  achievementsTotal: 0,
  achievements: [],
  userAchievements: [],
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: null,
  isPro: false,
  achievementsLocked: true,
  nextReward: {
    nextLevel: 2,
    nextLevelTitle: 'Explorer',
    xpToNextLevel: 100,
    proTeaser: null,
  },
} satisfies GamificationProfile
