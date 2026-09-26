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

/**
 * Resolves the `@orbit/shared` response schema for an offline-queue mutation `type`, or
 * `undefined` when the type has no registered schema. Types absent from the registry are not
 * validated (opt-in), preserving prior behavior.
 */
export function getMutationResponseSchema<TResult = unknown>(type: string): ZodType<TResult> | undefined {
  const currentType = mutationTypeSchema.safeParse(type)
  return currentType.success
    ? MUTATION_RESPONSE_SCHEMAS[currentType.data] as ZodType<TResult> | undefined
    : undefined
}
