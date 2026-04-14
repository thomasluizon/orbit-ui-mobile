import { describe, expect, it } from 'vitest'
import { createMockHabit } from './factories'
import { parseAPIDate } from '../utils/dates'
import {
  computeHabitCardStatus,
  computeHabitFlexibleProgressLabel,
  computeHabitFrequencyLabel,
  computeHabitMatchBadges,
  computeHabitStatusBadge,
  getHabitInitial,
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

  it('handles completed, general, and pending habit statuses', () => {
    expect(
      computeHabitCardStatus(
        createMockHabit({ isCompleted: true }),
        parseAPIDate('2025-01-02'),
      ),
    ).toBe('completed')
    expect(
      computeHabitCardStatus(
        createMockHabit({ isGeneral: true, isCompleted: false }),
        parseAPIDate('2025-01-02'),
      ),
    ).toBe('due-today')
    expect(
      computeHabitCardStatus(
        createMockHabit({
          dueDate: '2025-01-03',
          scheduledDates: ['2025-01-03'],
          instances: [],
          isOverdue: false,
        }),
        parseAPIDate('2025-01-02'),
      ),
    ).toBe('pending')
  })

  it('returns null for non-overdue status badges', () => {
    expect(computeHabitStatusBadge('pending', createTranslator())).toBeNull()
  })

  it('builds weekly, one-time, and pluralized frequency labels', () => {
    const translator = (key: string, params?: Record<string, string | number | Date>) => {
      if (key.startsWith('habits.frequency.everyN')) {
        return 'none | once | many'
      }
      if (key.startsWith('dates.daysShort.')) {
        return key.replace('dates.daysShort.', '')
      }
      if (params && Object.keys(params).length > 0) {
        return `${key}(${JSON.stringify(params)})`
      }
      return key
    }

    expect(
      computeHabitFrequencyLabel(
        createMockHabit({
          frequencyUnit: 'Day',
          frequencyQuantity: 1,
          days: ['Monday', 'Wednesday'],
        }),
        translator,
      ),
    ).toBe('monday, wednesday')
    expect(
      computeHabitFrequencyLabel(
        createMockHabit({
          frequencyUnit: 'Month',
          frequencyQuantity: 1,
          days: [],
        }),
        translator,
      ),
    ).toBe('habits.frequency.everyMonth')
    expect(
      computeHabitFrequencyLabel(
        createMockHabit({
          frequencyUnit: 'Week',
          frequencyQuantity: 2,
          days: [],
        }),
        translator,
      ),
    ).toBe('many')
  })

  it('handles two-form, three-form, and fallback plural variants', () => {
    const twoFormTranslator = (key: string) =>
      key.startsWith('habits.frequency.everyN') ? 'single | plural' : key
    const threeFormTranslator = (key: string) =>
      key.startsWith('habits.frequency.everyN') ? 'zero | one | many' : key
    const fallbackTranslator = (key: string) =>
      key.startsWith('habits.frequency.everyN') ? 'a | b | c | d' : key

    expect(
      computeHabitFrequencyLabel(
        createMockHabit({
          frequencyUnit: 'Week',
          frequencyQuantity: null,
          days: [],
        }),
        twoFormTranslator,
      ),
    ).toBe('single')
    expect(
      computeHabitFrequencyLabel(
        createMockHabit({
          frequencyUnit: 'Week',
          frequencyQuantity: 2,
          days: [],
        }),
        twoFormTranslator,
      ),
    ).toBe('plural')
    expect(
      computeHabitFrequencyLabel(
        createMockHabit({
          frequencyUnit: 'Week',
          frequencyQuantity: 0,
          days: [],
        }),
        threeFormTranslator,
      ),
    ).toBe('zero')
    expect(
      computeHabitFrequencyLabel(
        createMockHabit({
          frequencyUnit: 'Week',
          frequencyQuantity: 2,
          days: [],
        }),
        fallbackTranslator,
      ),
    ).toBe('a | b | c | d')
  })

  it('builds flexible progress labels and returns null for non-flexible habits', () => {
    const translator = createTranslator()

    expect(
      computeHabitFlexibleProgressLabel(
        createMockHabit({
          isFlexible: true,
          frequencyUnit: null,
          flexibleTarget: null,
          frequencyQuantity: 4,
          flexibleCompleted: 2,
        }),
        translator,
      ),
    ).toContain('"target":4')
    expect(
      computeHabitFlexibleProgressLabel(
        createMockHabit({
          isFlexible: false,
        }),
        translator,
      ),
    ).toBeNull()
  })

  it('returns description match badges and no badges when search input is empty', () => {
    const translator = createTranslator()

    expect(
      computeHabitMatchBadges(
        'habit',
        createMockHabit({
          searchMatches: [{ field: 'description', value: 'deeper context' }],
        }),
        translator,
      ),
    ).toEqual([{ label: 'habits.search.matchDescription' }])
    expect(
      computeHabitMatchBadges('', createMockHabit({ searchMatches: null }), translator),
    ).toEqual([])
  })
})

describe('getHabitInitial', () => {
  it('returns empty for null/undefined/empty', () => {
    expect(getHabitInitial(null)).toBe('')
    expect(getHabitInitial(undefined)).toBe('')
    expect(getHabitInitial('')).toBe('')
    expect(getHabitInitial('   ')).toBe('')
  })

  it('returns first letter uppercased for ASCII titles', () => {
    expect(getHabitInitial('Morning run')).toBe('M')
    expect(getHabitInitial('read')).toBe('R')
  })

  it('handles accented first letter', () => {
    expect(getHabitInitial('Ácido')).toBe('\u00C1')
  })

  it('returns the first grapheme for emoji-only titles', () => {
    const result = getHabitInitial('\u{1F3C3} Morning run')
    expect(result).toBe('\u{1F3C3}')
  })

  it('handles a ZWJ-joined grapheme as a single unit', () => {
    // woman astronaut = woman + ZWJ + rocket
    const title = '\u{1F469}\u200D\u{1F680} Dream'
    expect(getHabitInitial(title)).toBe('\u{1F469}\u200D\u{1F680}')
  })

  it('trims whitespace before extracting the first grapheme', () => {
    expect(getHabitInitial('  Hello')).toBe('H')
  })
})
