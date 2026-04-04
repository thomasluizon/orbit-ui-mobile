import { z } from 'zod'

// Feature flag from backend
export const featureFlagSchema = z.object({
  enabled: z.boolean(),
  plan: z.enum(['Pro']).nullable(),
})
export type FeatureFlag = z.infer<typeof featureFlagSchema>

// Full app config response from GET /api/config
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
    colorSchemes: z.array(z.string()),
    supportedLocales: z.array(z.string()),
    weekStartDayOptions: z.array(z.number()),
  }),
})
export type AppConfig = z.infer<typeof appConfigSchema>

// Default config used as offline fallback
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
    colorSchemes: ['purple', 'blue', 'green', 'rose', 'orange', 'cyan'],
    supportedLocales: ['en', 'pt-BR'],
    weekStartDayOptions: [0, 1],
  },
}
