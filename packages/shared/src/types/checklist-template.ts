import { z } from 'zod'

export const checklistTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  items: z.array(z.string()),
})

export type ChecklistTemplate = z.infer<typeof checklistTemplateSchema>
