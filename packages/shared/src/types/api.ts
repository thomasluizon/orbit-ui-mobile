import { z } from 'zod'

export const apiErrorSchema = z.object({
  error: z.string(),
})

export type APIError = z.infer<typeof apiErrorSchema>
