import { z } from 'zod'
import { frequencyUnitSchema } from './habit'
import {
  agentOperationResultSchema,
  pendingAgentOperationSchema,
  agentPolicyDenialSchema,
} from './ai'

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

export const quickActionSchema = z.object({
  label: z.string(),
  // `value` is what the client echoes back verbatim to the resolve endpoint; empty
  // strings would be meaningless and the backend rejects them anyway.
  value: z.string().min(1),
  description: z.string().nullable().optional(),
})

export type QuickAction = z.infer<typeof quickActionSchema>

export const clarificationRequestSchema = z.object({
  question: z.string(),
  operationId: z.string().uuid(),
  missingArgumentKey: z.string(),
  quickActions: z.array(quickActionSchema),
})

export type ClarificationRequest = z.infer<typeof clarificationRequestSchema>

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
  recommendation: z.string().nullable().optional(),
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

export const actionResultSchema = z
  .object({
    // The backend emits PascalCase tool names beyond the 18-value aiActionTypeSchema
    // enum (e.g. CreateTag, ReorderHabits), and the chat path renders these without
    // ever calling .parse() — so a plain string keeps the type honest about the wire.
    type: z.string(),
    status: actionStatusSchema,
    // The buffered endpoint writes null for unset fields while the SSE stream omits
    // them entirely (WhenWritingNull serializer), so every nullable field must also
    // be optional or the final stream event fails parsing and the send looks failed.
    entityId: z.string().nullable().optional(),
    entityName: z.string().nullable().optional(),
    error: z.string().nullable().optional(),
    field: z.string().nullable().optional(),
    suggestedSubHabits: z.array(suggestedSubHabitSchema).nullable().optional(),
    conflictWarning: conflictWarningSchema.nullable().optional(),
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

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'ai']),
  content: z.string(),
  actions: z.array(actionResultSchema).optional(),
  operations: z.array(agentOperationResultSchema).nullable().optional(),
  pendingOperations: z.array(pendingAgentOperationSchema).nullable().optional(),
  policyDenials: z.array(agentPolicyDenialSchema).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  correlationId: z.string().nullable().optional(),
  // App surface IDs (e.g. "today", "gamification") the assistant linked to via a
  // describe_feature reply; rendered as a deep-link footer when present.
  relatedSurfaces: z.array(z.string()).nullable().optional(),
  timestamp: z.date(),
})

export type ChatMessage = z.infer<typeof chatMessageSchema>

export const chatResponseSchema = z.object({
  aiMessage: z.string().nullable().optional(),
  actions: z.array(actionResultSchema),
  operations: z.array(agentOperationResultSchema).nullable().optional(),
  pendingOperations: z.array(pendingAgentOperationSchema).nullable().optional(),
  policyDenials: z.array(agentPolicyDenialSchema).nullable().optional(),
  correlationId: z.string().nullable().optional(),
  relatedSurfaces: z.array(z.string()).nullable().optional(),
})

export type ChatResponse = z.infer<typeof chatResponseSchema>

/**
 * One server-sent event on the chat stream, mirroring the backend's
 * ChatStreamEvent record: started/round keep the connection alive during tool
 * work, delta/reset drive incremental rendering, final carries the complete
 * ChatResponse (always authoritative over streamed text), and error carries an
 * HTTP-equivalent status plus the buffered endpoint's error/code shape.
 */
export const chatStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('started') }),
  z.object({ type: z.literal('round'), iteration: z.number() }),
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({ type: z.literal('reset') }),
  z.object({ type: z.literal('final'), response: chatResponseSchema }),
  z.object({
    type: z.literal('error'),
    status: z.number(),
    error: z.string(),
    code: z.string().optional(),
  }),
])

export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>
