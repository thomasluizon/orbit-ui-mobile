import { z } from 'zod'

export const userFactSchema = z.object({
  id: z.string(),
  factText: z.string(),
  category: z.string().nullable(),
  extractedAtUtc: z.string(),
  updatedAtUtc: z.string().nullable(),
})

export type UserFact = z.infer<typeof userFactSchema>
