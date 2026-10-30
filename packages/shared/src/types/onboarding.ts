import { z } from 'zod'
import { createHabitRequestSchema, habitSetupSuggestionSchema } from './habit'
import { createGoalRequestSchema } from './goal'

export const onboardingPlatformSchema = z.enum(['web', 'desktop', 'android', 'ios'])
export const onboardingAttestationSchema = z.object({
  platform: onboardingPlatformSchema,
  token: z.string().min(1).max(32768),
  keyId: z.string().nullish(),
})
export const onboardingChallengeRequestSchema = z.object({ platform: onboardingPlatformSchema })
export const onboardingChallengeSchema = z.object({ challenge: z.string().min(1), expiresAtUtc: z.iso.datetime({ offset: true }) })
export const onboardingEnrollmentRequestSchema = z.object({ challenge: z.string().min(1), attestation: onboardingAttestationSchema })
export const onboardingInstallSchema = z.object({ installId: z.string().min(1), expiresAtUtc: z.iso.datetime({ offset: true }) })
export const onboardingSetupRequestSchema = z.object({
  title: z.string().trim().min(1).max(100),
  language: z.enum(['en', 'pt-BR']),
  attestation: onboardingAttestationSchema,
})
export const onboardingSetupSuggestionSchema = habitSetupSuggestionSchema
export type OnboardingPlatform = z.infer<typeof onboardingPlatformSchema>
export type OnboardingAttestation = z.infer<typeof onboardingAttestationSchema>
export type OnboardingSetupRequest = z.infer<typeof onboardingSetupRequestSchema>

export const applyOnboardingFirstLogSchema = z.object({
  habitIndex: z.number().int().nonnegative(),
  date: z.string(),
})

export type ApplyOnboardingFirstLog = z.infer<typeof applyOnboardingFirstLogSchema>

/**
 * Deliberately narrower than `createHabitRequestSchema`: the apply endpoint does not accept
 * tagIds, subHabits, goalIds, scheduledReminders, slipAlertEnabled, dueEndTime, or endDate,
 * so the contract omits them rather than advertising fields the server would silently drop.
 */
export const applyOnboardingHabitSchema = createHabitRequestSchema.pick({
  title: true,
  description: true,
  emoji: true,
  frequencyUnit: true,
  frequencyQuantity: true,
  days: true,
  isBadHabit: true,
  isGeneral: true,
  isFlexible: true,
  dueDate: true,
  dueTime: true,
  reminderEnabled: true,
  reminderTimes: true,
  checklistItems: true,
})

export type ApplyOnboardingHabit = z.infer<typeof applyOnboardingHabitSchema>

export const applyOnboardingRequestSchema = z.object({
  habits: z.array(applyOnboardingHabitSchema),
  firstLog: applyOnboardingFirstLogSchema.optional(),
  goal: createGoalRequestSchema.optional(),
  weekStartDay: z.union([z.literal(0), z.literal(1)]).optional(),
})

export type ApplyOnboardingRequest = z.infer<typeof applyOnboardingRequestSchema>

export const applyOnboardingResponseSchema = z.object({
  applied: z.boolean(),
  createdHabitCount: z.number(),
  createdGoal: z.boolean(),
  loggedFirstHabit: z.boolean(),
})

export type ApplyOnboardingResponse = z.infer<typeof applyOnboardingResponseSchema>
