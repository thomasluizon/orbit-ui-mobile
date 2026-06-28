import { z } from 'zod'

export const goalProgressHistoryPointSchema = z.object({
  date: z.string(),
  value: z.number(),
  previousValue: z.number(),
  note: z.string().nullable(),
})

export type GoalProgressHistoryPoint = z.infer<typeof goalProgressHistoryPointSchema>

export const goalProgressHistoryResponseSchema = z.object({
  goalId: z.string(),
  points: z.array(goalProgressHistoryPointSchema),
})

export type GoalProgressHistoryResponse = z.infer<typeof goalProgressHistoryResponseSchema>
