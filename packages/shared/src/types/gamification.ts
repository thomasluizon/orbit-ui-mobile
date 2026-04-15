import { z } from 'zod'

export const achievementCategorySchema = z.enum([
  'GettingStarted',
  'Consistency',
  'Volume',
  'Goals',
  'Perfection',
  'Special',
])

export type AchievementCategory = z.infer<typeof achievementCategorySchema>

export const achievementRaritySchema = z.enum([
  'Common',
  'Uncommon',
  'Rare',
  'Epic',
  'Legendary',
])

export type AchievementRarity = z.infer<typeof achievementRaritySchema>

export const achievementSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  rarity: z.string(),
  xpReward: z.number(),
  iconKey: z.string(),
  isEarned: z.boolean(),
  earnedAtUtc: z.string().nullable(),
})

export type Achievement = z.infer<typeof achievementSchema>

export const userAchievementSchema = z.object({
  achievementId: z.string(),
  earnedAtUtc: z.string(),
})

export type UserAchievement = z.infer<typeof userAchievementSchema>

export const gamificationProfileSchema = z.object({
  totalXp: z.number(),
  level: z.number(),
  levelTitle: z.string(),
  xpForCurrentLevel: z.number(),
  xpForNextLevel: z.number(),
  xpToNextLevel: z.number().nullable(),
  achievementsEarned: z.number(),
  achievementsTotal: z.number(),
  achievements: z.array(achievementSchema),
  userAchievements: z.array(userAchievementSchema),
  currentStreak: z.number(),
  longestStreak: z.number(),
  lastActiveDate: z.string().nullable(),
})

export type GamificationProfile = z.infer<typeof gamificationProfileSchema>

export const streakInfoSchema = z.object({
  currentStreak: z.number(),
  longestStreak: z.number(),
  lastActiveDate: z.string().nullable(),
  freezesUsedThisMonth: z.number(),
  freezesAvailable: z.number(),
  maxFreezesPerMonth: z.number(),
  isFrozenToday: z.boolean(),
  recentFreezeDates: z.array(z.string()),
  streakFreezesAccumulated: z.number().default(0),
  maxStreakFreezesAccumulated: z.number().default(3),
  daysUntilNextFreeze: z.number().default(7),
  freezesAvailableToUse: z.number().default(0),
  canEarnMore: z.boolean().default(true),
})

export type StreakInfo = z.infer<typeof streakInfoSchema>

export const streakFreezeResponseSchema = z.object({
  freezesRemainingThisMonth: z.number(),
  frozenDate: z.string(),
  currentStreak: z.number(),
  streakFreezesAccumulated: z.number().default(0),
})

export type StreakFreezeResponse = z.infer<typeof streakFreezeResponseSchema>
