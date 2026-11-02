import { z } from 'zod'

const conversationOrderSchema = z.union([z.number().int().safe(), z.string().regex(/^-?(?:0|[1-9]\d*)$/)])

export const conversationImageReferenceSchema = z.object({
  fileName: z.string(),
  contentType: z.string(),
  sha256: z.string(),
  url: z.string().nullish(),
})

export const conversationPreviewOutcomeSchema = z.object({
  PendingOperationId: z.uuid(),
  Outcome: z.enum(['approved', 'edited', 'rejected', 'expired', 'pending']),
  Arguments: z.unknown(),
  Revision: z.number().int(),
})

export const conversationDisplayTurnSchema = z.object({
  turnId: z.uuid(),
  order: conversationOrderSchema,
  role: z.enum(['user', 'assistant']),
  createdAtUtc: z.iso.datetime({ offset: true }),
  content: z.string().nullable(),
  responseJson: z.string().nullable(),
  previewOutcomesJson: z.string(),
  image: conversationImageReferenceSchema.nullable(),
})

export const conversationPageSchema = z.object({
  conversationId: z.uuid(),
  turns: z.array(conversationDisplayTurnSchema),
  beforeOrder: conversationOrderSchema.nullable(),
})

export type ConversationImageReference = z.infer<typeof conversationImageReferenceSchema>
export type ConversationDisplayTurn = z.infer<typeof conversationDisplayTurnSchema>
export type ConversationPage = z.infer<typeof conversationPageSchema>
