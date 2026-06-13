import { z } from 'zod'

export const featureFlagSchema = z.object({
  enabled: z.boolean(),
  plan: z.enum(['Pro']).nullable(),
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
})
export type AppConfig = z.infer<typeof appConfigSchema>

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
    'habits.create': { enabled: true, plan: null },
    'habits.subHabits': { enabled: true, plan: 'Pro' },
    'habits.bulk': { enabled: true, plan: 'Pro' },
    'goals': { enabled: true, plan: 'Pro' },
    'chat': { enabled: true, plan: null },
    'chat.imageUpload': { enabled: true, plan: 'Pro' },
    'summary': { enabled: true, plan: 'Pro' },
    'retrospective': { enabled: true, plan: 'Pro' },
    'gamification': { enabled: true, plan: 'Pro' },
    'apiKeys': { enabled: true, plan: 'Pro' },
    'slipAlerts': { enabled: true, plan: null },
    'calendarSync': { enabled: true, plan: null },
    'checklistTemplates': { enabled: true, plan: null },
  },
  settings: {
    syncIntervalSeconds: 300,
    syncMaxBatchSize: 100,
  },
}
