import { z } from 'zod'

export const checklistTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  items: z.array(z.string()),
})

export type ChecklistTemplate = z.infer<typeof checklistTemplateSchema>

export const createChecklistTemplateRequestSchema = z.object({
  name: z.string(),
  items: z.array(z.string()),
})

export type CreateChecklistTemplateRequest = z.infer<typeof createChecklistTemplateRequestSchema>

export const createChecklistTemplateResponseSchema = z.object({
  id: z.string(),
})

export type CreateChecklistTemplateResponse = z.infer<typeof createChecklistTemplateResponseSchema>
