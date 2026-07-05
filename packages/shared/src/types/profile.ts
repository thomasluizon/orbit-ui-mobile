import { z } from 'zod'
import { calendarAutoSyncStatusSchema } from './calendar'
import { publicProfileSettingsSchema } from './public-profile'

export const planTypeSchema = z.enum(['free', 'pro'])

export type PlanType = z.infer<typeof planTypeSchema>

export const subscriptionIntervalSchema = z.enum(['monthly', 'yearly'])

export type SubscriptionInterval = z.infer<typeof subscriptionIntervalSchema>

export const subscriptionSourceSchema = z.enum(['stripe', 'play'])

export type SubscriptionSource = z.infer<typeof subscriptionSourceSchema>

export const supportedLocaleSchema = z.enum(['en', 'pt-BR'])

export type SupportedLocale = z.infer<typeof supportedLocaleSchema>

export const profileSchema = z.object({
  name: z.string(),
  email: z.string(),
  timeZone: z.string().nullable(),
  uses24HourClock: z.boolean().optional(),
  aiMemoryEnabled: z.boolean(),
  aiSummaryEnabled: z.boolean(),
  hasCompletedOnboarding: z.boolean(),
  hasCompletedTour: z.boolean(),
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
  subscriptionSource: subscriptionSourceSchema.nullable(),
  isLifetimePro: z.boolean(),
  weekStartDay: z.union([z.literal(0), z.literal(1)]),
  totalXp: z.number(),
  level: z.number(),
  levelTitle: z.string(),
  adRewardsClaimedToday: z.number(),
  currentStreak: z.number(),
  longestStreak: z.number(),
  streakFreezesAvailable: z.number(),
  themePreference: z.string().nullable(),
  colorScheme: z.string().nullable(),
  googleCalendarAutoSyncEnabled: z.boolean(),
  googleCalendarAutoSyncStatus: calendarAutoSyncStatusSchema,
  googleCalendarLastSyncedAt: z.string().nullable(),
  canViewGamification: z.boolean().optional(),
  hasCreatedFirstHabit: z.boolean().optional(),
  hasLoggedFirstHabit: z.boolean().optional(),
  hasTriedAstra: z.boolean().optional(),
  hasCompletedOnboardingChecklist: z.boolean().optional(),
  handle: z.string().nullable().optional(),
  socialOptIn: z.boolean().optional(),
  publicProfile: publicProfileSettingsSchema.optional(),
  proactiveAstraEnabled: z.boolean().optional(),
  marketingEmailConsent: z.boolean().nullable().optional(),
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

export const setProactiveAstraRequestSchema = z.object({
  enabled: z.boolean(),
})

export type SetProactiveAstraRequest = z.infer<typeof setProactiveAstraRequestSchema>

export const setMarketingEmailConsentRequestSchema = z.object({
  enabled: z.boolean(),
})

export type SetMarketingEmailConsentRequest = z.infer<typeof setMarketingEmailConsentRequestSchema>

export const setNameRequestSchema = z.object({
  name: z.string().trim().min(1).max(50),
})

export type SetNameRequest = z.infer<typeof setNameRequestSchema>

export const setLanguageRequestSchema = z.object({
  language: supportedLocaleSchema,
})

export type SetLanguageRequest = z.infer<typeof setLanguageRequestSchema>

export const setWeekStartDayRequestSchema = z.object({
  weekStartDay: z.union([z.literal(0), z.literal(1)]),
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
