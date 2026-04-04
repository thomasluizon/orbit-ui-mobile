import { z } from 'zod'
import { frequencyUnitSchema } from './habit'

// --- Enums ---

export const aiActionTypeSchema = z.enum([
  'CreateHabit',
  'LogHabit',
  'UpdateHabit',
  'DeleteHabit',
  'SkipHabit',
  'CreateSubHabit',
  'SuggestBreakdown',
  'AssignTags',
  'DuplicateHabit',
  'MoveHabit',
])

export type AiActionType = z.infer<typeof aiActionTypeSchema>

export const actionStatusSchema = z.enum(['Success', 'Failed', 'Suggestion'])

export type ActionStatus = z.infer<typeof actionStatusSchema>

// --- Sub-schemas ---

export const conflictingHabitSchema = z.object({
  habitId: z.string(),
  habitTitle: z.string(),
  conflictDescription: z.string(),
})

export type ConflictingHabit = z.infer<typeof conflictingHabitSchema>

export const conflictWarningSchema = z.object({
  hasConflict: z.boolean(),
  conflictingHabits: z.array(conflictingHabitSchema),
  severity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  recommendation: z.string().nullable(),
})

export type ConflictWarning = z.infer<typeof conflictWarningSchema>

export const suggestedSubHabitSchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  frequencyUnit: frequencyUnitSchema.nullable().optional(),
  frequencyQuantity: z.number().nullable().optional(),
  days: z.array(z.string()).nullable().optional(),
  isBadHabit: z.boolean().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  dueTime: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  habitId: z.string().optional(),
  slipAlertEnabled: z.boolean().optional(),
  reminderEnabled: z.boolean().optional(),
  reminderTimes: z.array(z.string()).optional(),
  tagNames: z.array(z.string()).optional(),
  checklistItems: z
    .array(
      z.object({
        text: z.string(),
        isChecked: z.boolean(),
      }),
    )
    .optional(),
})

export type SuggestedSubHabit = z.infer<typeof suggestedSubHabitSchema>

// --- Action result ---

export const actionResultSchema = z.object({
  type: aiActionTypeSchema,
  status: actionStatusSchema,
  entityId: z.string().nullable(),
  entityName: z.string().nullable(),
  error: z.string().nullable(),
  field: z.string().nullable(),
  suggestedSubHabits: z.array(suggestedSubHabitSchema).nullable(),
  conflictWarning: conflictWarningSchema.nullable(),
})

export type ActionResult = z.infer<typeof actionResultSchema>

// --- Chat ---

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'ai']),
  content: z.string(),
  actions: z.array(actionResultSchema).optional(),
  imageUrl: z.string().nullable().optional(),
  timestamp: z.date(),
})

export type ChatMessage = z.infer<typeof chatMessageSchema>

export const chatResponseSchema = z.object({
  aiMessage: z.string().nullable(),
  actions: z.array(actionResultSchema),
})

export type ChatResponse = z.infer<typeof chatResponseSchema>
