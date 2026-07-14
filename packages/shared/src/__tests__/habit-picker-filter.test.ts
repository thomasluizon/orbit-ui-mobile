import { describe, expect, it } from 'vitest'
import { filterHabitPickerOptions, type HabitPickerOption } from '../utils/habit-picker'

const options: HabitPickerOption[] = [
  { id: 'a', title: 'Morning run', parentTitle: null },
  { id: 'b', title: 'Stretch', parentTitle: 'Morning run' },
  { id: 'c', title: 'Read', parentTitle: 'Evening wind-down' },
]

describe('filterHabitPickerOptions', () => {
  it('returns every option when the query is blank', () => {
    expect(filterHabitPickerOptions(options, '   ')).toBe(options)
  })

  it('matches on the option title, case-insensitively', () => {
    expect(filterHabitPickerOptions(options, 'READ').map((option) => option.id)).toEqual(['c'])
  })

  it('matches on the parent title', () => {
    expect(filterHabitPickerOptions(options, 'evening').map((option) => option.id)).toEqual(['c'])
  })

  it('returns nothing when neither title nor parent matches', () => {
    expect(filterHabitPickerOptions(options, 'swim')).toEqual([])
  })
})
