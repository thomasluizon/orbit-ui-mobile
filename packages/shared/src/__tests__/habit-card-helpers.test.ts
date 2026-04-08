import { describe, expect, it } from 'vitest'
import { createMockHabit } from './factories'
import { parseAPIDate } from '../utils/dates'
import {
  computeHabitCardStatus,
  computeHabitFlexibleProgressLabel,
  computeHabitFrequencyLabel,
  computeHabitMatchBadges,
  computeHabitStatusBadge,
} from '../utils/habit-card-helpers'

function createTranslator() {
  return (key: string, params?: Record<string, string | number | Date>) => {
    if (params && Object.keys(params).length > 0) {
      return `${key}(${JSON.stringify(params)})`
    }
    return key
  }
}

describe('habit card helpers', () => {
  it('derives the correct status and overdue badge', () => {
    const habit = createMockHabit({
      isCompleted: false,
      isLoggedInRange: false,
      isGeneral: false,
      isOverdue: true,
      frequencyUnit: null,
    })

    const status = computeHabitCardStatus(habit, new Date('2025-01-02'))

    expect(status).toBe('overdue')
    expect(computeHabitStatusBadge(status, createTranslator())).toEqual({
      text: 'habits.overdue',
      color: 'text-red-500',
      bg: 'bg-red-500/10',
    })
  })

  it('builds frequency and flexible progress labels', () => {
    const translator = createTranslator()
    const habit = createMockHabit({
      isGeneral: false,
      frequencyUnit: 'Week',
      frequencyQuantity: 2,
      days: [],
      isFlexible: true,
      flexibleTarget: 3,
      flexibleCompleted: 1,
    })

    expect(computeHabitFrequencyLabel(habit, translator)).toContain(
      'habits.frequency.flexibleLabel',
    )
    expect(computeHabitFlexibleProgressLabel(habit, translator)).toContain(
      'habits.frequency.flexibleProgress',
    )
  })

  it('builds search match badges for non-title matches only', () => {
    const translator = createTranslator()
    const habit = createMockHabit({
      searchMatches: [
        { field: 'tag', value: 'a very long tag value that should be truncated' },
        { field: 'child', value: 'child habit' },
        { field: 'title', value: 'ignored title match' },
      ],
    })

    expect(computeHabitMatchBadges('habit', habit, translator)).toEqual([
      { label: 'habits.search.matchTag({"value":"a very long tag valu..."})' },
      { label: 'habits.search.matchChild({"value":"child habit"})' },
    ])
  })

  it('marks optimistic habits as due today when only scheduledDates are present', () => {
    const habit = createMockHabit({
      dueDate: '2025-01-02',
      scheduledDates: ['2025-01-02'],
      instances: [],
      isOverdue: false,
    })

    expect(computeHabitCardStatus(habit, parseAPIDate('2025-01-02'))).toBe('due-today')
  })

  it('falls back to dueDate when optimistic sub-habits have no instances yet', () => {
    const habit = createMockHabit({
      dueDate: '2025-01-02',
      scheduledDates: [],
      instances: [],
      isOverdue: false,
    })

    expect(computeHabitCardStatus(habit, parseAPIDate('2025-01-02'))).toBe('due-today')
  })
})
