import { z } from 'zod'
import { chatMessageSchema } from '@orbit/shared/types/chat'

export const checkpointSchema = z.object({
  accountId: z.string(),
  expiresAt: z.number(),
  conversationOpen: z.boolean(),
  chat: z.object({
    conversationId: z.uuid().nullable().default(null),
    dismissedOfferKeys: z.array(z.string()).default([]),
    messages: z.array(chatMessageSchema.extend({ timestamp: z.coerce.date() })),
    draft: z.string(),
    proactiveEntryId: z.string().nullable(),
    proactiveOutcomes: z.record(z.string(), z.enum(['opened', 'acted'])),
    contextualSuggestion: z.object({ id: z.string(), label: z.string(), prompt: z.string() }).nullable(),
  }),
})

