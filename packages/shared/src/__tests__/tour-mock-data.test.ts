import { describe, expect, it } from 'vitest'
import {
  createTourMockGoals,
  createTourMockHabits,
  createTourMockTags,
} from '../tour/tour-mock-data'

function translate(key: string): string {
  return key
}

describe('tour mock data', () => {
  it('creates deterministic tags, habits, and goals for the guided tour', () => {
    const tags = createTourMockTags(translate)
    const habits = createTourMockHabits('2025-04-11', translate)
    const goals = createTourMockGoals(translate)

    expect(tags).toHaveLength(3)
    expect(habits).toHaveLength(5)
    expect(goals).toHaveLength(2)
    expect(habits[1]?.hasSubHabits).toBe(true)
    expect(habits[4]?.isGeneral).toBe(true)
    expect(goals[0]?.linkedHabits[0]?.id).toBe('tour-habit-2')
  })
})
