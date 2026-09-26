import type { ZodType } from 'zod'
import { mutationTypeSchema, type MutationType } from '@orbit/shared/types/sync'
import {
  bulkCreateResponseSchema,
  bulkDeleteResponseSchema,
  bulkLogResultSchema,
  bulkSkipResultSchema,
  logHabitResponseSchema,
} from '@orbit/shared/types/habit'

const MUTATION_RESPONSE_SCHEMAS: Partial<Record<MutationType, ZodType>> = {
  logHabit: logHabitResponseSchema,
  bulkCreateHabits: bulkCreateResponseSchema,
  bulkDeleteHabits: bulkDeleteResponseSchema,
  bulkLogHabits: bulkLogResultSchema,
  bulkSkipHabits: bulkSkipResultSchema,
}

export function getMutationResponseSchema(type: string): ZodType | undefined {
  const currentType = mutationTypeSchema.safeParse(type)
  return currentType.success ? MUTATION_RESPONSE_SCHEMAS[currentType.data] : undefined
}
