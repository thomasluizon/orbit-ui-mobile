import { z } from 'zod'

export const astraPlanStepSchema = z.object({
  id: z.string(),
  text: z.string(),
  status: z.string(),
  tool: z.string(),
  phase: z.enum(['execution', 'approval']),
  toolCallId: z.string().nullish(),
  pendingOperationId: z.uuid().nullish(),
})

export const astraPlanSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  steps: z.array(astraPlanStepSchema),
})

export type AstraPlanStep = z.infer<typeof astraPlanStepSchema>
export type AstraPlan = z.infer<typeof astraPlanSchema>
