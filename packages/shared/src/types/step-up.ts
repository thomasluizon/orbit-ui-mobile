import { z } from 'zod'

export const stepUpMessageResponseSchema = z.object({
  message: z.string(),
})

export type StepUpMessageResponse = z.infer<typeof stepUpMessageResponseSchema>

export const accountDeactivationResponseSchema = stepUpMessageResponseSchema.extend({
  scheduledDeletionAt: z.string(),
})

export type AccountDeactivationResponse = z.infer<typeof accountDeactivationResponseSchema>
