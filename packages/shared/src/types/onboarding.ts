import { z } from 'zod'
import { createHabitRequestSchema } from './habit'
import { createGoalRequestSchema } from './goal'

export const applyOnboardingFirstLogSchema = z.object({
  habitIndex: z.number().int().nonnegative(),
  date: z.string(),
})

export type ApplyOnboardingFirstLog = z.infer<typeof applyOnboardingFirstLogSchema>

/**
 * The exact per-habit fields the `POST /api/profile/onboarding/apply` endpoint honors
 * (mirrors the API `ApplyHabitInput`). Deliberately narrower than `createHabitRequestSchema`:
 * the apply endpoint does not accept tagIds, subHabits, goalIds, scheduledReminders,
 * slipAlertEnabled, dueEndTime, or endDate, so the contract omits them rather than
 * advertising fields the server would silently drop.
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
  colorScheme: z.string().optional(),
})

export type ApplyOnboardingRequest = z.infer<typeof applyOnboardingRequestSchema>

export const applyOnboardingResponseSchema = z.object({
  applied: z.boolean(),
  createdHabitCount: z.number(),
  createdGoal: z.boolean(),
  loggedFirstHabit: z.boolean(),
})

export type ApplyOnboardingResponse = z.infer<typeof applyOnboardingResponseSchema>
