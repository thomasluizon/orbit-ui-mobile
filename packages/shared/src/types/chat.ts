import { z } from 'zod'
import { frequencyUnitSchema } from './habit'
import {
  agentOperationResultSchema,
  pendingAgentOperationSchema,
  agentPolicyDenialSchema,
} from './ai'

// --- Enums ---

export const aiActionTypeSchema = z.enum([
  'CreateHabit',
  'LogHabit',
  'UpdateHabit',
  'DeleteHabit',
  'SkipHabit',
  'BulkLogHabits',
  'BulkSkipHabits',
  'CreateSubHabit',
  'SuggestBreakdown',
  'AssignTags',
  'DuplicateHabit',
  'MoveHabit',
  'CreateGoal',
  'UpdateGoal',
  'DeleteGoal',
  'UpdateGoalProgress',
  'UpdateGoalStatus',
  'LinkHabitsToGoal',
])

export type AiActionType = z.infer<typeof aiActionTypeSchema>

export const actionStatusSchema = z.enum(['Success', 'Failed', 'Suggestion', 'NeedsClarification'])

export type ActionStatus = z.infer<typeof actionStatusSchema>

// --- Clarification (NeedsClarification status) ---

export const quickActionSchema = z.object({
  label: z.string(),
  value: z.string(),
  // Backend always emits the field; serializes as `null` when unset, not omitted.
  description: z.string().nullable(),
})

export type QuickAction = z.infer<typeof quickActionSchema>

export const clarificationRequestSchema = z.object({
  question: z.string(),
  operationId: z.string().uuid(),
  missingArgumentKey: z.string(),
  quickActions: z.array(quickActionSchema),
})

export type ClarificationRequest = z.infer<typeof clarificationRequestSchema>

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

export const actionResultSchema = z
  .object({
    type: aiActionTypeSchema,
    status: actionStatusSchema,
    entityId: z.string().nullable(),
    entityName: z.string().nullable(),
    error: z.string().nullable(),
    field: z.string().nullable(),
    suggestedSubHabits: z.array(suggestedSubHabitSchema).nullable(),
    conflictWarning: conflictWarningSchema.nullable(),
    clarificationRequest: clarificationRequestSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    // NeedsClarification is meaningless without the structured payload — fail loudly
    // rather than letting the card silently fail to render.
    if (value.status === 'NeedsClarification' && !value.clarificationRequest) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clarificationRequest'],
        message: 'clarificationRequest is required when status is NeedsClarification',
      })
    }
  })

export type ActionResult = z.infer<typeof actionResultSchema>

// --- Chat ---

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'ai']),
  content: z.string(),
  actions: z.array(actionResultSchema).optional(),
  operations: z.array(agentOperationResultSchema).optional(),
  pendingOperations: z.array(pendingAgentOperationSchema).optional(),
  policyDenials: z.array(agentPolicyDenialSchema).optional(),
  imageUrl: z.string().nullable().optional(),
  timestamp: z.date(),
})

export type ChatMessage = z.infer<typeof chatMessageSchema>

export const chatResponseSchema = z.object({
  aiMessage: z.string().nullable(),
  actions: z.array(actionResultSchema),
  operations: z.array(agentOperationResultSchema).optional(),
  pendingOperations: z.array(pendingAgentOperationSchema).optional(),
  policyDenials: z.array(agentPolicyDenialSchema).optional(),
})

export type ChatResponse = z.infer<typeof chatResponseSchema>
