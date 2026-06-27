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
    isFlexible: false,
    flexibleTarget: null,
    dueTime: null,
    subHabits: [],
    checklistItems: [],
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

  it('maps a flexible suggestion using the per-period target as the form quantity', () => {
    const patch = buildHabitFormPatchFromSuggestion(
      makeSuggestion({
        frequencyUnit: 'Week',
        frequencyQuantity: 1,
        isFlexible: true,
        flexibleTarget: 4,
        days: ['Monday'],
      }),
    )

    expect(patch.mode).toBe('flexible')
    expect(patch.frequencyUnit).toBe('Week')
    expect(patch.frequencyQuantity).toBe(4)
    expect(patch.days).toEqual([])
  })

  it('defaults a flexible suggestion without a target to once per period', () => {
    const patch = buildHabitFormPatchFromSuggestion(
      makeSuggestion({ frequencyUnit: 'Week', isFlexible: true, flexibleTarget: null }),
    )

    expect(patch.mode).toBe('flexible')
    expect(patch.frequencyQuantity).toBe(1)
  })

  it('carries the suggested due time through to the patch', () => {
    const patch = buildHabitFormPatchFromSuggestion(
      makeSuggestion({ frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '07:30' }),
    )

    expect(patch.dueTime).toBe('07:30')
  })

  it('maps checklist strings to unchecked items, kept distinct from sub-habits', () => {
    const patch = buildHabitFormPatchFromSuggestion(
      makeSuggestion({ checklistItems: ['Towel', 'Goggles'], subHabits: [] }),
    )

    expect(patch.checklistItems).toEqual([
      { text: 'Towel', isChecked: false },
      { text: 'Goggles', isChecked: false },
    ])
    expect(patch.subHabitTitles).toEqual([])
  })
})

describe('habitSetupSuggestionSchema', () => {
  it('parses a valid suggestion payload', () => {
    const parsed = habitSetupSuggestionSchema.parse({
      emoji: '🏃',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      days: ['Monday'],
      isFlexible: false,
      flexibleTarget: null,
      dueTime: '07:00',
      subHabits: ['Warm up'],
      checklistItems: ['Towel'],
    })

    expect(parsed.frequencyUnit).toBe('Day')
    expect(parsed.subHabits).toEqual(['Warm up'])
    expect(parsed.dueTime).toBe('07:00')
    expect(parsed.checklistItems).toEqual(['Towel'])
  })

  it('parses null schedule fields for a one-time task', () => {
    const parsed = habitSetupSuggestionSchema.parse({
      emoji: null,
      frequencyUnit: null,
      frequencyQuantity: null,
      days: [],
      isFlexible: false,
      flexibleTarget: null,
      dueTime: null,
      subHabits: [],
      checklistItems: [],
    })

    expect(parsed.frequencyUnit).toBeNull()
  })

  it('parses a flexible suggestion payload', () => {
    const parsed = habitSetupSuggestionSchema.parse({
      emoji: '🏊',
      frequencyUnit: 'Week',
      frequencyQuantity: 1,
      days: [],
      isFlexible: true,
      flexibleTarget: 3,
      dueTime: null,
      subHabits: [],
      checklistItems: [],
    })

    expect(parsed.isFlexible).toBe(true)
    expect(parsed.flexibleTarget).toBe(3)
  })

  it('rejects an unknown frequency unit', () => {
    expect(() =>
      habitSetupSuggestionSchema.parse({
        emoji: null,
        frequencyUnit: 'Fortnight',
        frequencyQuantity: 1,
        days: [],
        isFlexible: false,
        flexibleTarget: null,
        dueTime: null,
        subHabits: [],
        checklistItems: [],
      }),
    ).toThrow()
  })
})
