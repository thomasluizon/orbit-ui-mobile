import { z } from 'zod'

export const achievementCategorySchema = z.enum([
  'GettingStarted',
  'Consistency',
  'Volume',
  'Goals',
  'Perfection',
  'Special',
  'Social',
  'Sharing',
  'Together',
])

export type AchievementCategory = z.infer<typeof achievementCategorySchema>

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

export const ACHIEVEMENT_EVENT_KEYS = {
  cardShared: 'card_shared',
  wrappedViewed: 'wrapped_viewed',
} as const

export type AchievementEventKey =
  (typeof ACHIEVEMENT_EVENT_KEYS)[keyof typeof ACHIEVEMENT_EVENT_KEYS]

export const reportEventResponseSchema = z.object({
  granted: z.array(achievementSchema),
})

export type ReportEventResponse = z.infer<typeof reportEventResponseSchema>

const userAchievementSchema = z.object({
  achievementId: z.string(),
  earnedAtUtc: z.string(),
})

export const nextRewardCarrotSchema = z.object({
  nextLevel: z.number(),
  nextLevelTitle: z.string(),
  xpToNextLevel: z.number(),
  proTeaser: z
    .object({ kind: z.enum(['achievements']), locked: z.boolean() })
    .nullable(),
})

export type NextRewardCarrot = z.infer<typeof nextRewardCarrotSchema>

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
  isPro: z.boolean(),
  achievementsLocked: z.boolean(),
  nextReward: nextRewardCarrotSchema,
})

export type GamificationProfile = z.infer<typeof gamificationProfileSchema>

export const retrospectiveHabitStatSchema = z.object({
  name: z.string(),
  emoji: z.string().nullable(),
  completionRate: z.number(),
  completedCount: z.number(),
  scheduledCount: z.number(),
  isOneTime: z.boolean().optional(),
})

export const retrospectiveMetricsSchema = z.object({
  completionRate: z.number(),
  totalCompletions: z.number(),
  totalScheduled: z.number(),
  activeDays: z.number(),
  periodDays: z.number(),
  currentStreak: z.number(),
  bestStreak: z.number(),
  badHabitSlips: z.number(),
  weeklyConsistency: z.array(z.number()),
  topHabits: z.array(retrospectiveHabitStatSchema),
  needsAttention: z.array(retrospectiveHabitStatSchema),
})

export const recapResponseSchema = z.object({
  period: z.enum(['week', 'month', 'quarter', 'semester', 'year']),
  metrics: retrospectiveMetricsSchema,
  shareDeepLink: z.string(),
})

export type Recap = z.infer<typeof recapResponseSchema>

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
