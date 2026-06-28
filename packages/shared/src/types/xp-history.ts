import { z } from 'zod'

export const xpHistoryPointSchema = z.object({
  date: z.string(),
  dailyXp: z.number(),
  cumulativeXp: z.number(),
})

export type XpHistoryPoint = z.infer<typeof xpHistoryPointSchema>

export const xpHistoryResponseSchema = z.object({
  totalXp: z.number(),
  points: z.array(xpHistoryPointSchema),
})

export type XpHistoryResponse = z.infer<typeof xpHistoryResponseSchema>
