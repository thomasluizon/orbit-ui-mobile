import { z } from 'zod'

export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  createdAtUtc: z.string(),
  lastUsedAtUtc: z.string().nullable(),
  isRevoked: z.boolean(),
})

export type ApiKey = z.infer<typeof apiKeySchema>

export const apiKeyCreateResponseSchema = apiKeySchema.extend({
  key: z.string(),
})

export type ApiKeyCreateResponse = z.infer<typeof apiKeyCreateResponseSchema>
