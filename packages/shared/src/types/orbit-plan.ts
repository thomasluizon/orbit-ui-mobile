import { z } from 'zod'

export const orbitPlanStepSchema = z.object({
  id: z.string(),
  text: z.string(),
  status: z.string(),
  tool: z.string(),
  phase: z.enum(['execution', 'approval']),
  toolCallId: z.string().nullish(),
  pendingOperationId: z.uuid().nullish(),
})

export const orbitPlanSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  steps: z.array(orbitPlanStepSchema),
})

export type OrbitPlanStep = z.infer<typeof orbitPlanStepSchema>
export type OrbitPlan = z.infer<typeof orbitPlanSchema>
