import { describe, expect, it } from 'vitest'
import { buildHabitFormPatchFromSuggestion } from '../utils/habit-form-helpers'
import {
  habitSetupSuggestionSchema,
  type HabitSetupSuggestion,
} from '../types/habit'

function makeSuggestion(overrides: Partial<HabitSetupSuggestion> = {}): HabitSetupSuggestion {
  return {
    emoji: null,
    frequencyUnit: null,
    frequencyQuantity: null,
    days: [],
    subHabits: [],
    ...overrides,
  }
}

describe('buildHabitFormPatchFromSuggestion', () => {
  it('maps a daily suggestion to recurring and keeps the suggested days', () => {
    const patch = buildHabitFormPatchFromSuggestion(
      makeSuggestion({
        emoji: '🏃',
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        days: ['Monday', 'Wednesday'],
        subHabits: ['Warm up', 'Cool down'],
      }),
    )

    expect(patch.mode).toBe('recurring')
    expect(patch.emoji).toBe('🏃')
    expect(patch.frequencyUnit).toBe('Day')
    expect(patch.frequencyQuantity).toBe(1)
    expect(patch.days).toEqual(['Monday', 'Wednesday'])
    expect(patch.subHabitTitles).toEqual(['Warm up', 'Cool down'])
  })

  it('drops days for a weekly suggestion', () => {
    const patch = buildHabitFormPatchFromSuggestion(
      makeSuggestion({ frequencyUnit: 'Week', frequencyQuantity: 1, days: ['Monday'] }),
    )

    expect(patch.mode).toBe('recurring')
    expect(patch.frequencyUnit).toBe('Week')
    expect(patch.days).toEqual([])
  })

  it('drops days when daily quantity is not 1', () => {
    const patch = buildHabitFormPatchFromSuggestion(
      makeSuggestion({ frequencyUnit: 'Day', frequencyQuantity: 2, days: ['Monday'] }),
    )

    expect(patch.days).toEqual([])
    expect(patch.frequencyQuantity).toBe(2)
  })

  it('defaults a recurring suggestion without a quantity to 1', () => {
    const patch = buildHabitFormPatchFromSuggestion(
      makeSuggestion({ frequencyUnit: 'Week', frequencyQuantity: null }),
    )

    expect(patch.frequencyQuantity).toBe(1)
  })

  it('maps a suggestion without a frequency to a one-time task', () => {
    const patch = buildHabitFormPatchFromSuggestion(
      makeSuggestion({ emoji: '📌', subHabits: ['Step 1'] }),
    )

    expect(patch.mode).toBe('oneTime')
    expect(patch.frequencyUnit).toBeNull()
    expect(patch.frequencyQuantity).toBeNull()
    expect(patch.days).toEqual([])
    expect(patch.subHabitTitles).toEqual(['Step 1'])
  })
})

describe('habitSetupSuggestionSchema', () => {
  it('parses a valid suggestion payload', () => {
    const parsed = habitSetupSuggestionSchema.parse({
      emoji: '🏃',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      days: ['Monday'],
      subHabits: ['Warm up'],
    })

    expect(parsed.frequencyUnit).toBe('Day')
    expect(parsed.subHabits).toEqual(['Warm up'])
  })

  it('parses null schedule fields for a one-time task', () => {
    const parsed = habitSetupSuggestionSchema.parse({
      emoji: null,
      frequencyUnit: null,
      frequencyQuantity: null,
      days: [],
      subHabits: [],
    })

    expect(parsed.frequencyUnit).toBeNull()
  })

  it('rejects an unknown frequency unit', () => {
    expect(() =>
      habitSetupSuggestionSchema.parse({
        emoji: null,
        frequencyUnit: 'Fortnight',
        frequencyQuantity: 1,
        days: [],
        subHabits: [],
      }),
    ).toThrow()
  })
})
