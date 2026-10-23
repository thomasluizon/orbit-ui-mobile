import { z } from 'zod'
import { updateHabitRequestSchema } from '@orbit/shared/types/habit'
import { MAX_TAGS_PER_HABIT } from '@orbit/shared/validation'

export const queuedHabitUpdateRequestSchema = updateHabitRequestSchema.extend({
  tagIds: z.array(z.union([z.uuid(), z.string().startsWith('offline-tag-')])).max(MAX_TAGS_PER_HABIT).nullish(),
})

export function validateResolvedHabitTags(type: string, payload: unknown): void {
  if (type === 'updateHabit' && payload && typeof payload === 'object' && 'tagIds' in payload) {
    updateHabitRequestSchema.shape.tagIds.parse(payload.tagIds)
  }
}
