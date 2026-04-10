import { z } from 'zod'
import { calendarAutoSyncStatusSchema } from './calendar'

export const planTypeSchema = z.enum(['free', 'pro'])

export type PlanType = z.infer<typeof planTypeSchema>

export const subscriptionIntervalSchema = z.enum(['monthly', 'yearly'])

export type SubscriptionInterval = z.infer<typeof subscriptionIntervalSchema>

export const supportedLocaleSchema = z.enum(['en', 'pt-BR'])

export type SupportedLocale = z.infer<typeof supportedLocaleSchema>

export const profileSchema = z.object({
  name: z.string(),
  email: z.string(),
  timeZone: z.string().nullable(),
  aiMemoryEnabled: z.boolean(),
  aiSummaryEnabled: z.boolean(),
  hasCompletedOnboarding: z.boolean(),
  language: supportedLocaleSchema.nullable(),
  plan: planTypeSchema,
  hasProAccess: z.boolean(),
  isTrialActive: z.boolean(),
  trialEndsAt: z.string().nullable(),
  planExpiresAt: z.string().nullable(),
  aiMessagesUsed: z.number(),
  aiMessagesLimit: z.number(),
  hasImportedCalendar: z.boolean(),
  hasGoogleConnection: z.boolean(),
  subscriptionInterval: subscriptionIntervalSchema.nullable(),
  isLifetimePro: z.boolean(),
  weekStartDay: z.number(),
  totalXp: z.number(),
  level: z.number(),
  levelTitle: z.string(),
  adRewardsClaimedToday: z.number(),
  currentStreak: z.number(),
  streakFreezesAvailable: z.number(),
  themePreference: z.string().nullable(),
  colorScheme: z.string().nullable(),
  googleCalendarAutoSyncEnabled: z.boolean(),
  googleCalendarAutoSyncStatus: calendarAutoSyncStatusSchema,
  googleCalendarLastSyncedAt: z.string().nullable(),
})

export type Profile = z.infer<typeof profileSchema>

export const updateTimezoneRequestSchema = z.object({
  timeZone: z.string(),
})

export type UpdateTimezoneRequest = z.infer<typeof updateTimezoneRequestSchema>

export const setAiMemoryRequestSchema = z.object({
  enabled: z.boolean(),
})

export type SetAiMemoryRequest = z.infer<typeof setAiMemoryRequestSchema>

export const setAiSummaryRequestSchema = z.object({
  enabled: z.boolean(),
})

export type SetAiSummaryRequest = z.infer<typeof setAiSummaryRequestSchema>

export const setLanguageRequestSchema = z.object({
  language: supportedLocaleSchema,
})

export type SetLanguageRequest = z.infer<typeof setLanguageRequestSchema>

export const setWeekStartDayRequestSchema = z.object({
  weekStartDay: z.number(),
})

export type SetWeekStartDayRequest = z.infer<typeof setWeekStartDayRequestSchema>

export const setThemePreferenceRequestSchema = z.object({
  themePreference: z.string().nullable(),
})

export type SetThemePreferenceRequest = z.infer<typeof setThemePreferenceRequestSchema>

export const setColorSchemeRequestSchema = z.object({
  colorScheme: z.string().nullable(),
})

export type SetColorSchemeRequest = z.infer<typeof setColorSchemeRequestSchema>

export const themeModeSchema = z.enum(['dark', 'light'])

export type ThemeMode = z.infer<typeof themeModeSchema>
