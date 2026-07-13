import type { ZodType } from 'zod'
import type { MutationType } from '@orbit/shared/types/sync'
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
 * `undefined` when the type has no registered schema. Because a queued mutation is a persisted
 * plain object that cannot carry a runtime schema function, both the immediate execute path and
 * the deferred flush replay look the schema up by type here — so a mutation's response is validated
 * at the trust boundary identically on either path. Types absent from the registry are not
 * validated (opt-in), preserving prior behavior.
 * See https://github.com/thomasluizon/orbit-ui-mobile/issues/479
 */
export function getMutationResponseSchema(type: MutationType): ZodType | undefined {
  return MUTATION_RESPONSE_SCHEMAS[type]
}
