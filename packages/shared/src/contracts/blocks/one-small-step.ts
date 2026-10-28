import { z } from 'zod'
import { utf16Length } from '../../validation/utf16-length'

const startingTextSchema = z.string().check(utf16Length('max', 200)).regex(/^[^\r\n]+$/).refine(text => text.trim().length > 0)
const actionSchema = z.object({
  id: z.enum(['smaller', 'saveTask', 'saveChecklistItem']),
  label: z.string().min(1),
  message: z.string().min(1),
}).strict()

export const oneSmallStepCardSchema = z.object({
  suggestion: z.object({
    goal: startingTextSchema,
    step: startingTextSchema,
    language: z.enum(['en', 'pt-BR']),
  }).strict(),
  actions: z.array(actionSchema).length(3).refine(actions => new Set(actions.map(action => action.id)).size === 3),
}).strict()

export type OneSmallStepCard = z.infer<typeof oneSmallStepCardSchema>
export type OneSmallStepAction = OneSmallStepCard['actions'][number]
