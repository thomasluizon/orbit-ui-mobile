import { z } from 'zod'

export const dailySummaryResponseSchema = z.object({
  summary: z.string(),
  insight: z.string(),
  fromCache: z.boolean(),
})

export type DailySummaryResponse = z.infer<typeof dailySummaryResponseSchema>
