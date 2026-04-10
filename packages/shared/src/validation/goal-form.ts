import { z } from 'zod'
import {
  MAX_GOAL_TITLE_LENGTH,
  MAX_GOAL_UNIT_LENGTH,
} from './constants'

// --- Goal form schema ---

export const goalFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'goals.form.titleRequired')
    .max(MAX_GOAL_TITLE_LENGTH, 'goals.form.titleTooLong'),
  description: z.string().max(500).optional().default(''),
  targetValue: z.number().positive().nullable().optional(),
  unit: z
    .string()
    .trim()
    .max(MAX_GOAL_UNIT_LENGTH, 'goals.form.unitTooLong')
    .optional()
    .default(''),
  deadline: z.string().optional().default(''),
  habitIds: z.array(z.string()).optional().default([]),
  type: z.enum(['Standard', 'Streak']).optional().default('Standard'),
})

export type GoalFormData = z.infer<typeof goalFormSchema>

export function validateGoalForm(
  title: string,
  targetValue: number | null | undefined,
  unit: string,
): string | null {
  if (!title.trim()) {
    return 'goals.form.titleRequired'
  }
  if (title.trim().length > MAX_GOAL_TITLE_LENGTH) {
    return 'goals.form.titleTooLong'
  }
  if (!targetValue || targetValue <= 0) {
    return 'goals.form.targetValueRequired'
  }
  if (!unit.trim()) {
    return 'goals.form.unitRequired'
  }
  if (unit.trim().length > MAX_GOAL_UNIT_LENGTH) {
    return 'goals.form.unitTooLong'
  }
  return null
}

export function validateGoalProgressValue(value: number | null | undefined): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'goals.form.progressValueInvalid'
  }
  if (value < 0) {
    return 'goals.form.progressValueInvalid'
  }
  return null
}
