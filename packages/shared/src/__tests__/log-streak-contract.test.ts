import { describe, expect, it } from 'vitest'
import { bulkLogResultSchema, logHabitResponseSchema } from '../types/habit'

describe('log streak response contracts', () => {
  it('preserves the single response transition while accepting older responses', () => {
    const response = { logId: 'confirmed-log', isFirstCompletionToday: true, currentStreak: 1 }
    expect(logHabitResponseSchema.parse(response)).toEqual(response)
    expect(logHabitResponseSchema.parse({ ...response, previousStreak: 0 })).toEqual({ ...response, previousStreak: 0 })
    expect(logHabitResponseSchema.safeParse({ ...response, previousStreak: '0' }).success).toBe(false)
  })

  it('preserves optional bulk transition fields independently', () => {
    for (const transition of [{}, { previousStreak: 0 }, { currentStreak: 1 }, { previousStreak: 0, currentStreak: 1 }]) {
      const response = { results: [], ...transition }
      expect(bulkLogResultSchema.parse(response)).toEqual(response)
    }
    expect(bulkLogResultSchema.safeParse({ results: [], previousStreak: '0' }).success).toBe(false)
    expect(bulkLogResultSchema.safeParse({ results: [], currentStreak: '1' }).success).toBe(false)
  })
})
