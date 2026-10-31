import { z } from 'zod'

export const astraNextActionSchema = z.object({
  offerKey: z.string().min(1).max(200),
  kind: z.enum(['openSurface', 'continueChat', 'preparePreview']),
  label: z.string().min(1),
  surface: z.string().nullish(),
  prompt: z.string().nullish(),
  entityId: z.uuid().nullish(),
  date: z.iso.date().nullish(),
})
export type AstraNextAction = z.infer<typeof astraNextActionSchema>

export const dismissConversationOffersRequestSchema = z.object({
  conversationId: z.uuid(),
  offerKeys: z.array(z.string().min(1).max(200)).min(1).max(100),
})
