import { z } from 'zod'

export const streakHistoryPointSchema = z.object({
  date: z.string(),
  streak: z.number(),
})

export type StreakHistoryPoint = z.infer<typeof streakHistoryPointSchema>

export const streakHistoryResponseSchema = z.object({
  points: z.array(streakHistoryPointSchema),
})

export type StreakHistoryResponse = z.infer<typeof streakHistoryResponseSchema>
