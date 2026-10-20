import { describe, expect, it } from 'vitest'
import { API } from '../api/endpoints'
import { skipHabitRequestSchema } from '../types/habit'

describe('skip undo contract', () => {
  it('preserves the optional request fields and accepts a client receipt', () => {
    const skipId = '11111111-1111-4111-8111-111111111111'
    expect(skipHabitRequestSchema.parse({})).toEqual({})
    expect(skipHabitRequestSchema.parse({ date: null, skipId: null })).toEqual({ date: null, skipId: null })
    expect(skipHabitRequestSchema.parse({ date: '2026-09-12', skipId })).toEqual({ date: '2026-09-12', skipId })
    expect(skipHabitRequestSchema.safeParse({ skipId: 'local-receipt' }).success).toBe(false)
    expect(API.habits.undoSkip('habit-id', skipId)).toBe(`/api/habits/habit-id/skip/${skipId}/undo`)
  })
})
