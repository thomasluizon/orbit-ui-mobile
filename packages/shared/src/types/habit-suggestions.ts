import { z } from 'zod'
import { frequencyUnitSchema } from './habit'
import type { AgentExecuteOperationResponse } from './ai'

export const habitSuggestionDraftSchema = z.object({
  id: z.uuid(),
  emoji: z.string(),
  title: z.string(),
  type: z.enum(['Task', 'Habit']),
  frequencyUnit: frequencyUnitSchema.nullable(),
  frequencyQuantity: z.number().int().nullable(),
  days: z.array(z.enum(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])),
  dueDate: z.iso.date(),
  dueTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  dueEndTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  reminderMinutesBefore: z.number().int().nullable(),
  checklistItems: z.array(z.string()),
  reason: z.string(),
  existingHabitId: z.uuid().nullish(),
})

export const habitSuggestionsCardSchema = z.object({
  language: z.string(),
  drafts: z.array(habitSuggestionDraftSchema).min(1).max(5),
})

export const habitSuggestionPreviewErrorSchema = z.object({
  error: z.string(), errorCode: z.string().nullable(), draftIndex: z.number().int().nonnegative(),
})

export type HabitSuggestionDraft = z.infer<typeof habitSuggestionDraftSchema>
export type HabitSuggestionsCard = z.infer<typeof habitSuggestionsCardSchema>
export type HabitSuggestionPreviewResult = { response: AgentExecuteOperationResponse; conflictIndex?: never } | { conflictIndex: number; response?: never }
