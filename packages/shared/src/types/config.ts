import { z } from 'zod'

export const featureFlagSchema = z.object({
  enabled: z.boolean(),
  planRequirement: z.enum(['Pro']).nullable(),
})
export type FeatureFlag = z.infer<typeof featureFlagSchema>

export const appConfigSchema = z.object({
  limits: z.object({
    maxUserFacts: z.number(),
    maxHabitDepth: z.number(),
    maxTagsPerHabit: z.number(),
    maxReferrals: z.number(),
    referralRewardDays: z.number(),
    freeAiMessagesPerMonth: z.number(),
    adRewardBonusMessages: z.number(),
    dailyAdRewardCap: z.number(),
  }),
  features: z.record(z.string(), featureFlagSchema),
  settings: z.object({
    syncIntervalSeconds: z.number(),
    syncMaxBatchSize: z.number(),
  }),
  minVersion: z.string(),
})
export type AppConfig = z.infer<typeof appConfigSchema>

export const upgradeRequiredSchema = z.object({
  upgradeRequired: z.literal(true),
  minVersion: z.string(),
})
export type UpgradeRequiredResponse = z.infer<typeof upgradeRequiredSchema>

export const DEFAULT_CONFIG: AppConfig = {
  limits: {
    maxUserFacts: 50,
    maxHabitDepth: 5,
    maxTagsPerHabit: 5,
    maxReferrals: 10,
    referralRewardDays: 10,
    freeAiMessagesPerMonth: 15,
    adRewardBonusMessages: 5,
    dailyAdRewardCap: 3,
  },
  features: {
    'habits.create': { enabled: true, planRequirement: null },
    'habits.subHabits': { enabled: true, planRequirement: 'Pro' },
    'habits.bulk': { enabled: true, planRequirement: 'Pro' },
    'goals': { enabled: true, planRequirement: 'Pro' },
    'chat': { enabled: true, planRequirement: null },
    'chat.imageUpload': { enabled: true, planRequirement: 'Pro' },
    'summary': { enabled: true, planRequirement: 'Pro' },
    'retrospective': { enabled: true, planRequirement: 'Pro' },
    'gamification': { enabled: true, planRequirement: 'Pro' },
    'apiKeys': { enabled: true, planRequirement: 'Pro' },
    'slipAlerts': { enabled: true, planRequirement: null },
    'calendarSync': { enabled: true, planRequirement: null },
    'checklistTemplates': { enabled: true, planRequirement: null },
  },
  settings: {
    syncIntervalSeconds: 300,
    syncMaxBatchSize: 100,
  },
  minVersion: '0.0.0',
}
