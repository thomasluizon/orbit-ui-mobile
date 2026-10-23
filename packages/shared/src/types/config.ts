import { z } from 'zod'

export const featureFlagSchema = z.object({
  enabled: z.boolean(),
  planRequirement: z.string().nullable(),
})
export type FeatureFlag = z.infer<typeof featureFlagSchema>

export type FeatureKey =
  | 'offline_mode'
  | 'ai_chat'
  | 'ai_summary'
  | 'ai_retrospective'
  | 'sub_habits'
  | 'goal_tracking'
  | 'push_notifications'
  | 'scheduled_reminders'
  | 'slip_alerts'
  | 'checklist_templates'
  | 'habit_duplication'
  | 'bulk_operations'
  | 'calendar_integration'
  | 'notion_integration'
  | 'api_keys'
  | 'gamification_free_tier'
  | 'astra_ask_blocks_disabled'
  | 'astra_proactive_engine_disabled'
  | 'astra_crisis_resources_disabled'
  | 'astra_change_preview_disabled'
  | 'astra_tool_steps_disabled'
  | 'astra_parts_disabled'
  | 'astra_follow_ups_disabled'
  | 'astra_period_blocks_disabled'
  | 'astra_goal_projections_disabled'
  | 'astra_status_blocks_disabled'
  | 'astra_record_lists_disabled'
  | 'astra_account_rows_disabled'

const configLimitsSchema = z.object({
  maxHabitDepth: z.number(),
  maxTagsPerHabit: z.number(),
  maxReferrals: z.number(),
  referralRewardDays: z.number(),
})

const storedConfigLimitsSchema = z.object({
  MaxHabitDepth: z.string().pipe(z.coerce.number<string>()).default(5),
  MaxTagsPerHabit: z.string().pipe(z.coerce.number<string>()).default(5),
  MaxReferrals: z.string().pipe(z.coerce.number<string>()).default(10),
  ReferralRewardDays: z.string().pipe(z.coerce.number<string>()).default(10),
}).catchall(z.string()).transform((limits) => ({
  maxHabitDepth: limits.MaxHabitDepth,
  maxTagsPerHabit: limits.MaxTagsPerHabit,
  maxReferrals: limits.MaxReferrals,
  referralRewardDays: limits.ReferralRewardDays,
}))

export const appConfigSchema = z.object({
  limits: z.union([configLimitsSchema, storedConfigLimitsSchema]),
  features: z.record(z.string(), featureFlagSchema).default({}),
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
  },
  features: {
    'analytics': { enabled: false, planRequirement: null },
    'habits.create': { enabled: true, planRequirement: null },
    'sub_habits': { enabled: true, planRequirement: null },
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
