import { describe, expect, it } from 'vitest'
import { bulkMoveHabitParentRequestSchema, bulkMoveHabitParentResultSchema } from '../types/habit'

const habitId = '11111111-1111-4111-8111-111111111111'

describe('bulk move parent contract', () => {
  it('accepts the full result key set including localized item errors', () => {
    const response = { results: [
      { index: 0, status: 'Success', habitId, error: null, errorCode: null },
      { index: 1, status: 'Failed', habitId, error: 'Target was removed', errorCode: 'TARGET_PARENT_NOT_FOUND' },
    ] }
    expect(bulkMoveHabitParentResultSchema.parse(response)).toEqual(response)
    expect(bulkMoveHabitParentResultSchema.safeParse({ results: [{ index: 0, status: 'Unknown', habitId }] }).success).toBe(false)
  })

  it('accepts a root destination and enforces one through one hundred ids', () => {
    expect(bulkMoveHabitParentRequestSchema.parse({ habitIds: [habitId], parentId: null }).parentId).toBeNull()
    for (const count of [0, 101]) {
      expect(bulkMoveHabitParentRequestSchema.safeParse({ habitIds: Array(count).fill(habitId), parentId: null }).success).toBe(false)
    }
    expect(bulkMoveHabitParentRequestSchema.safeParse({ habitIds: Array(100).fill(habitId), parentId: null }).success).toBe(true)
  })
})
