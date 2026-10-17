import { describe, expect, it } from 'vitest'
import { habitsFilterSchema } from '../types/habit'
import { HABIT_FREQUENCY_FILTER_OPTIONS, toggleHabitFrequencyFilter } from '../utils/habit-frequency-filter'

describe('habit frequency filter', () => {
  it.each(HABIT_FREQUENCY_FILTER_OPTIONS)('selects and clears $id', ({ id, value }) => {
    expect(toggleHabitFrequencyFilter(undefined, id)).toBe(value)
    expect(toggleHabitFrequencyFilter(value, id)).toBeUndefined()
    expect(habitsFilterSchema.parse({ frequencyUnit: value }).frequencyUnit).toBe(value)
  })

  it('clears any selection with all and ignores unknown choices', () => {
    expect(toggleHabitFrequencyFilter('Week', 'all')).toBeUndefined()
    expect(toggleHabitFrequencyFilter('Week', 'invalid')).toBe('Week')
  })
})
