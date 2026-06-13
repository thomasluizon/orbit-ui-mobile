import { describe, expect, it } from 'vitest'
import type { BreakdownEditableHabit } from '../utils/breakdown-suggestion'
import {
  buildBreakdownCreateRequest,
  filterValidBreakdownHabits,
} from '../utils/breakdown-suggestion'

function makeEditableHabit(
  overrides: Partial<BreakdownEditableHabit> = {},
): BreakdownEditableHabit {
  return {
    title: 'Stretch',
    description: '',
    frequencyUnit: null,
    frequencyQuantity: null,
    days: null,
    isBadHabit: false,
    dueDate: null,
    checklistItems: null,
    ...overrides,
  }
}

describe('filterValidBreakdownHabits', () => {
  it('drops rows whose title is empty after trimming', () => {
    const habits = [
      makeEditableHabit({ title: 'Stretch' }),
      makeEditableHabit({ title: '   ' }),
      makeEditableHabit({ title: '' }),
    ]

    expect(filterValidBreakdownHabits(habits)).toHaveLength(1)
  })

  it('preserves extra platform-local fields on the rows', () => {
    const habits = [{ ...makeEditableHabit(), id: 'row-1' }]

    expect(filterValidBreakdownHabits(habits)[0]?.id).toBe('row-1')
  })
})

describe('buildBreakdownCreateRequest', () => {
  it('builds a flat request with trimmed titles and normalized optionals', () => {
    const request = buildBreakdownCreateRequest(
      [
        makeEditableHabit({
          title: '  Stretch  ',
          description: '  morning  ',
          frequencyUnit: 'Day',
          frequencyQuantity: null,
          days: ['Monday'],
          dueDate: '2025-02-01',
          checklistItems: [{ text: 'Neck', isChecked: false }],
        }),
        makeEditableHabit({ title: 'Walk', isBadHabit: true }),
      ],
      'Get fit',
      false,
    )

    expect(request).toEqual({
      habits: [
        {
          title: 'Stretch',
          description: 'morning',
          frequencyUnit: 'Day',
          frequencyQuantity: 1,
          days: ['Monday'],
          isBadHabit: false,
          dueDate: '2025-02-01',
          checklistItems: [{ text: 'Neck', isChecked: false }],
        },
        {
          title: 'Walk',
          description: undefined,
          frequencyUnit: undefined,
          frequencyQuantity: undefined,
          days: undefined,
          isBadHabit: true,
          dueDate: undefined,
          checklistItems: undefined,
        },
      ],
    })
  })

  it('keeps an explicit valid frequency quantity', () => {
    const request = buildBreakdownCreateRequest(
      [makeEditableHabit({ frequencyUnit: 'Week', frequencyQuantity: 3 })],
      'Get fit',
      false,
    )

    expect(request.habits[0]?.frequencyQuantity).toBe(3)
  })

  it('ignores the frequency quantity when no unit is set', () => {
    const request = buildBreakdownCreateRequest(
      [makeEditableHabit({ frequencyUnit: null, frequencyQuantity: 4 })],
      'Get fit',
      false,
    )

    expect(request.habits[0]?.frequencyQuantity).toBeUndefined()
  })

  it('nests rows under a parent that inherits frequency and earliest due date', () => {
    const request = buildBreakdownCreateRequest(
      [
        makeEditableHabit({ title: 'Walk', dueDate: '2025-03-05' }),
        makeEditableHabit({
          title: 'Stretch',
          frequencyUnit: 'Day',
          frequencyQuantity: 2,
          dueDate: '2025-03-01',
        }),
      ],
      'Get fit',
      true,
    )

    expect(request.habits).toHaveLength(1)
    const parent = request.habits[0]
    expect(parent?.title).toBe('Get fit')
    expect(parent?.frequencyUnit).toBe('Day')
    expect(parent?.frequencyQuantity).toBe(2)
    expect(parent?.dueDate).toBe('2025-03-01')
    expect(parent?.subHabits?.map((subHabit) => subHabit.title)).toEqual([
      'Walk',
      'Stretch',
    ])
  })

  it('falls back to today for the parent due date when no row has one', () => {
    const request = buildBreakdownCreateRequest(
      [makeEditableHabit({ dueDate: null })],
      'Get fit',
      true,
    )

    expect(request.habits[0]?.dueDate).toBe(new Date().toISOString().slice(0, 10))
  })

  it('leaves the parent frequency unset when no row has a unit', () => {
    const request = buildBreakdownCreateRequest(
      [makeEditableHabit({ frequencyUnit: null, frequencyQuantity: 5 })],
      'Get fit',
      true,
    )

    expect(request.habits[0]?.frequencyUnit).toBeUndefined()
    expect(request.habits[0]?.frequencyQuantity).toBeUndefined()
  })
})
