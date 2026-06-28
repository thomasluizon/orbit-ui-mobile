import { z } from 'zod'

export const habitsCompletionTrendPointSchema = z.object({
  date: z.string(),
  completedCount: z.number(),
  completionRate: z.number(),
})

export type HabitsCompletionTrendPoint = z.infer<typeof habitsCompletionTrendPointSchema>

export const habitsCompletionTrendsResponseSchema = z.object({
  activeHabitCount: z.number(),
  points: z.array(habitsCompletionTrendPointSchema),
})

export type HabitsCompletionTrendsResponse = z.infer<typeof habitsCompletionTrendsResponseSchema>
