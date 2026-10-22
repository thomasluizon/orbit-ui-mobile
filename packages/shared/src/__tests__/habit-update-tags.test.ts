import { describe, expect, it } from 'vitest'
import { updateHabitRequestSchema } from '../types/habit'
import { MAX_TAGS_PER_HABIT } from '../validation'

const core = { title: 'Read', isBadHabit: false }
const tagId = '11111111-1111-4111-8111-111111111111'

describe('atomic habit update tags', () => {
  it('preserves omitted or null selection and accepts an explicit clear', () => {
    expect(updateHabitRequestSchema.parse(core)).not.toHaveProperty('tagIds')
    expect(updateHabitRequestSchema.parse({ ...core, tagIds: null }).tagIds).toBeNull()
    expect(updateHabitRequestSchema.parse({ ...core, tagIds: [] }).tagIds).toEqual([])
    expect(updateHabitRequestSchema.parse({ ...core, tagIds: [tagId] }).tagIds).toEqual([tagId])
  })
  it('enforces UUID ownership inputs and counts duplicate IDs toward the submitted cap', () => {
    expect(updateHabitRequestSchema.safeParse({ ...core, tagIds: ['invalid'] }).success).toBe(false)
    expect(updateHabitRequestSchema.safeParse({ ...core, tagIds: Array(MAX_TAGS_PER_HABIT).fill(tagId) }).success).toBe(true)
    expect(updateHabitRequestSchema.safeParse({ ...core, tagIds: Array(MAX_TAGS_PER_HABIT + 1).fill(tagId) }).success).toBe(false)
  })
})
