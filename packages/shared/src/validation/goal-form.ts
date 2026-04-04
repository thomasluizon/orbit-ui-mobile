import { z } from 'zod'

// --- Goal form schema ---

export const goalFormSchema = z.object({
  title: z.string().min(1, 'goals.form.titleRequired').max(200).trim(),
  description: z.string().max(500).optional().default(''),
  targetValue: z.number().positive().nullable().optional(),
  unit: z.string().optional().default(''),
  deadline: z.string().optional().default(''),
  habitIds: z.array(z.string()).optional().default([]),
})

export type GoalFormData = z.infer<typeof goalFormSchema>
