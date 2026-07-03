import { describe, expect, it } from 'vitest'
import { createMockHabit } from './factories'
import { buildHabitPickerOptions } from '../utils/habit-picker'
import type { NormalizedHabit } from '../types/habit'

function buildHabitMap(habits: NormalizedHabit[]): Map<string, NormalizedHabit> {
  return new Map(habits.map((habit) => [habit.id, habit]))
}

describe('buildHabitPickerOptions', () => {
  it('omits completed one-time habits while keeping their active descendants', () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Finished project',
      isCompleted: true,
      frequencyUnit: null,
    })
    const activeChild = createMockHabit({
      id: 'child',
      title: 'Loose end',
      parentId: 'parent',
    })
    const doneOneOff = createMockHabit({
      id: 'errand',
      title: 'One-off errand',
      isCompleted: true,
      frequencyUnit: null,
    })
    const recurring = createMockHabit({ id: 'recurring', title: 'Daily walk' })

    const options = buildHabitPickerOptions(
      [parent, doneOneOff, recurring],
      new Map([['parent', ['child']]]),
      buildHabitMap([parent, activeChild, doneOneOff, recurring]),
    )

    expect(options.map((option) => option.id)).toEqual(['child', 'recurring'])
    expect(options.find((option) => option.id === 'child')?.parentTitle).toBe(
      'Finished project',
    )
  })
})
