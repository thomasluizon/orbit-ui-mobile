import { z } from 'zod'

export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  scopes: z.array(z.string()),
  isReadOnly: z.boolean(),
  expiresAtUtc: z.string().nullable(),
  createdAtUtc: z.string(),
  lastUsedAtUtc: z.string().nullable(),
  isRevoked: z.boolean(),
})

export type ApiKey = z.infer<typeof apiKeySchema>

export const apiKeyCreateResponseSchema = apiKeySchema.extend({
  key: z.string(),
})

export type ApiKeyCreateResponse = z.infer<typeof apiKeyCreateResponseSchema>

export const apiKeyCreateRequestSchema = z.object({
  name: z.string(),
  scopes: z.array(z.string()).optional(),
  isReadOnly: z.boolean().optional(),
  expiresAtUtc: z.string().nullable().optional(),
})

export type ApiKeyCreateRequest = z.infer<typeof apiKeyCreateRequestSchema>
