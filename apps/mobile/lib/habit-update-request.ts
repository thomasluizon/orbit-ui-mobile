import { z } from 'zod'
import { updateHabitRequestSchema } from '@orbit/shared/types/habit'
import { MAX_TAGS_PER_HABIT } from '@orbit/shared/validation'

export const queuedHabitUpdateRequestSchema = updateHabitRequestSchema.extend({
  parentId: z.union([z.uuid(), z.string().regex(/^offline-habit-.+$/)]).nullish(),
  tagIds: z.array(z.union([z.uuid(), z.string().startsWith('offline-tag-')])).max(MAX_TAGS_PER_HABIT).nullish(),
})

export function validateResolvedHabitReferences(type: string, payload: unknown): void {
  if (type === 'updateHabit' && payload && typeof payload === 'object' && 'tagIds' in payload) {
    updateHabitRequestSchema.shape.tagIds.parse(payload.tagIds)
  }
  if (type === 'updateHabit' && payload && typeof payload === 'object' && 'parentId' in payload) {
    updateHabitRequestSchema.shape.parentId.parse(payload.parentId)
  }
}
