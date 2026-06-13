import { z } from 'zod'

export const goalTypeSchema = z.enum(['Standard', 'Streak'])

export type GoalType = z.infer<typeof goalTypeSchema>

export const goalStatusSchema = z.enum(['Active', 'Completed', 'Abandoned'])

export type GoalStatus = z.infer<typeof goalStatusSchema>

export const linkedHabitInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
})

export type LinkedHabitInfo = z.infer<typeof linkedHabitInfoSchema>

const linkedHabitAdherenceSchema = z.object({
  habitId: z.string(),
  habitTitle: z.string(),
  weeklyCompletionRate: z.number(),
  monthlyCompletionRate: z.number(),
  currentStreak: z.number(),
})

export const goalMetricsSchema = z.object({
  progressPercentage: z.number(),
  velocityPerDay: z.number(),
  projectedCompletionDate: z.string().nullable(),
  daysToDeadline: z.number().nullable(),
  trackingStatus: z.string(),
  habitAdherence: z.array(linkedHabitAdherenceSchema),
})

export type GoalMetrics = z.infer<typeof goalMetricsSchema>

export const goalSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  targetValue: z.number(),
  currentValue: z.number(),
  unit: z.string(),
  type: goalTypeSchema.optional(),
  status: goalStatusSchema,
  deadline: z.string().nullable(),
  position: z.number(),
  createdAtUtc: z.string(),
  completedAtUtc: z.string().nullable(),
  progressPercentage: z.number(),
  trackingStatus: z.string().nullable().optional(),
  linkedHabits: z.array(linkedHabitInfoSchema).optional(),
})

export type Goal = z.infer<typeof goalSchema>

const goalProgressEntrySchema = z.object({
  value: z.number(),
  previousValue: z.number(),
  note: z.string().nullable(),
  createdAtUtc: z.string(),
})

const goalDetailSchema = goalSchema.extend({
  progressHistory: z.array(goalProgressEntrySchema),
})

export const goalDetailWithMetricsSchema = z.object({
  goal: goalDetailSchema,
  metrics: goalMetricsSchema,
})

export type GoalDetailWithMetrics = z.infer<typeof goalDetailWithMetricsSchema>

export const createGoalRequestSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  targetValue: z.number(),
  unit: z.string(),
  deadline: z.string().optional(),
  type: goalTypeSchema.optional(),
})

export type CreateGoalRequest = z.infer<typeof createGoalRequestSchema>

export const updateGoalRequestSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  targetValue: z.number(),
  unit: z.string(),
  deadline: z.string().nullable().optional(),
})

export type UpdateGoalRequest = z.infer<typeof updateGoalRequestSchema>

export const updateGoalProgressRequestSchema = z.object({
  currentValue: z.number(),
  note: z.string().optional(),
})

export type UpdateGoalProgressRequest = z.infer<typeof updateGoalProgressRequestSchema>

export const updateGoalStatusRequestSchema = z.object({
  status: goalStatusSchema,
})

export type UpdateGoalStatusRequest = z.infer<typeof updateGoalStatusRequestSchema>

export const goalPositionItemSchema = z.object({
  id: z.string(),
  position: z.number(),
})

export type GoalPositionItem = z.infer<typeof goalPositionItemSchema>

export const paginatedGoalResponseSchema = z.object({
  items: z.array(goalSchema),
  page: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
  totalPages: z.number(),
})

export type PaginatedGoalResponse = z.infer<typeof paginatedGoalResponseSchema>
