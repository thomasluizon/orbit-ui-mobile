import { z } from 'zod'

export const featureFlagSchema = z.object({
  enabled: z.boolean(),
  planRequirement: z.enum(['Pro']).nullable(),
})
export type FeatureFlag = z.infer<typeof featureFlagSchema>

export const appConfigSchema = z.object({
  limits: z.object({
    maxHabitDepth: z.number(),
    maxTagsPerHabit: z.number(),
    maxReferrals: z.number(),
    referralRewardDays: z.number(),
    freeAiMessagesPerMonth: z.number(),
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
    maxHabitDepth: 5,
    maxTagsPerHabit: 5,
    maxReferrals: 10,
    referralRewardDays: 10,
    freeAiMessagesPerMonth: 15,
  },
  features: {
    'habits.subHabits': { enabled: true, planRequirement: 'Pro' },
    'habits.bulk': { enabled: true, planRequirement: null },
    'goals': { enabled: true, planRequirement: null },
    'chat': { enabled: true, planRequirement: null },
    'summary': { enabled: true, planRequirement: 'Pro' },
    'retrospective': { enabled: true, planRequirement: 'Pro' },
    'gamification': { enabled: true, planRequirement: null },
    'apiKeys': { enabled: true, planRequirement: 'Pro' },
    'slipAlerts': { enabled: true, planRequirement: 'Pro' },
    'calendarSync': { enabled: true, planRequirement: 'Pro' },
    'checklistTemplates': { enabled: true, planRequirement: null },
  },
  settings: {
    syncIntervalSeconds: 300,
    syncMaxBatchSize: 100,
  },
  minVersion: '0.0.0',
}
