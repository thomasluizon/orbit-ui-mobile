import { describe, expect, it } from 'vitest'
import { createMockHabit } from './factories'
import { LOGGED_PARENT_TODAY, loggedParentRowCases } from '../test-support/logged-parent-row-cases'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { parseAPIDate } from '../utils/dates'
import {
  canLogHabitOnDate,
  computeHabitCardStatus,
  computeHabitFrequencyLabel,
  computeHabitRowNextDueHint,
  isLoggedParentHabitRow,
  computeHabitMatchBadges,
  getHabitLogDateDecision,
  getHabitLogDateConfirmationKeys,
  getHabitRowTypeLabelKey,
  getHabitTypeLabelKey,
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
  it.each([
    { frequencyUnit: null, isFlexible: false, isGeneral: false, rowKey: 'habits.rowTypeTask', fullKey: 'habits.form.typeTask' },
    { frequencyUnit: 'Day', isFlexible: false, isGeneral: false, rowKey: 'habits.form.typeHabit', fullKey: 'habits.form.typeHabit' },
    { frequencyUnit: 'Week', isFlexible: true, isGeneral: false, rowKey: 'habits.form.typeHabit', fullKey: 'habits.form.typeHabit' },
    { frequencyUnit: null, isFlexible: false, isGeneral: true, rowKey: 'habits.form.typeHabit', fullKey: 'habits.form.typeHabit' },
  ] as const)('keeps row and full type labels distinct for $frequencyUnit, flexible=$isFlexible, general=$isGeneral', ({ rowKey, fullKey, ...schedule }) => {
    const habit = createMockHabit(schedule)
    expect(getHabitRowTypeLabelKey(habit)).toBe(rowKey)
    expect(getHabitTypeLabelKey(habit)).toBe(fullKey)
  })

  it('uses permanent removal copy only for an unlog before a known child creation date', () => {
    const child = createMockHabit({
      parentId: 'parent-1',
      createdAtUtc: '2025-01-08T12:00:00Z',
      createdAtUtcIsInherited: false,
      frequencyUnit: 'Day',
    })

    const decision = getHabitLogDateDecision(child, '2025-01-07', '2025-01-10', 'UTC', false, 'unlog')

    expect(decision).toBe('confirm-permanent-unlog')
    expect(getHabitLogDateConfirmationKeys('unlog', decision === 'confirm-permanent-unlog')).toEqual({
      message: 'habits.detail.logDateConfirmPermanentUnlogMessage',
      action: 'habits.detail.logDateConfirmUnlog',
    })
    expect(getHabitLogDateConfirmationKeys('unlog', false).message).toBe('habits.detail.logDateConfirmUnlogMessage')
  })

  it('derives the overdue status for an overdue one-time task', () => {
    const habit = createMockHabit({
      isCompleted: false,
      isLoggedInRange: false,
      isGeneral: false,
      isOverdue: true,
      frequencyUnit: null,
    })

    expect(computeHabitCardStatus(habit, new Date('2025-01-02'))).toBe('overdue')
  })

  it('marks overdue recurring habits as overdue regardless of frequency', () => {
    const weekly = createMockHabit({
      isCompleted: false,
      isLoggedInRange: false,
      isGeneral: false,
      isOverdue: true,
      frequencyUnit: 'Week',
    })
    const monthly = createMockHabit({
      isCompleted: false,
      isLoggedInRange: false,
      isGeneral: false,
      isOverdue: true,
      frequencyUnit: 'Month',
    })

    expect(computeHabitCardStatus(weekly, new Date('2025-01-02'))).toBe('overdue')
    expect(computeHabitCardStatus(monthly, new Date('2025-01-02'))).toBe('overdue')
  })

  it('builds flexible frequency labels', () => {
    const translator = createTranslator()
    const habit = createMockHabit({
      isGeneral: false,
      frequencyUnit: 'Week',
      frequencyQuantity: 2,
      days: [],
      isFlexible: true,
    })

    expect(computeHabitFrequencyLabel(habit, translator)).toContain(
      'habits.frequency.flexibleLabel',
    )
  })

  it('omits a frequency label when the habit has no schedule', () => {
    const translate = createTranslator()
    expect(computeHabitFrequencyLabel(createMockHabit({ frequencyUnit: null, isGeneral: false }), translate)).toBeNull()
    expect(computeHabitFrequencyLabel(createMockHabit({ frequencyUnit: 'Day', isGeneral: true }), translate)).toBeNull()
  })

  it.each([
    { messages: ptBR, expected: 'Todo dia' },
    { messages: en, expected: 'Every day' },
  ])('shows $expected for daily and all-seven fixed-day row metadata', ({ messages, expected }) => {
    const translate = (key: string) => {
      if (key === 'habits.frequency.everyDay') return messages.habits.frequency.everyDay
      if (key.startsWith('dates.daysShort.')) {
        const day = key.slice('dates.daysShort.'.length) as keyof typeof messages.dates.daysShort
        return messages.dates.daysShort[day]
      }
      return key
    }
    const daily = createMockHabit({ frequencyUnit: 'Day', frequencyQuantity: 1, days: [] })
    const everyFixedDay = createMockHabit({
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    })

    expect(computeHabitFrequencyLabel(daily, translate)).toBe(expected)
    expect(computeHabitFrequencyLabel(everyFixedDay, translate)).toBe(expected)
  })

  it.each([
    { field: 'title' as const, value: null },
    { field: 'description' as const, value: null },
    { field: 'tag' as const, value: 'a long tag value that stays intact' },
    { field: 'child' as const, value: 'Walk to the shop' },
  ])('preserves the structured $field match', (match) => {
    expect(computeHabitMatchBadges('walk', createMockHabit({ searchMatches: [match] }))).toEqual([match])
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

  it('omits match lines when there is no query or no metadata', () => {
    expect(computeHabitMatchBadges('', createMockHabit({ searchMatches: [{ field: 'title', value: null }] }))).toEqual([])
    expect(computeHabitMatchBadges('walk', createMockHabit({ searchMatches: null }))).toEqual([])
  })
})

describe('canLogHabitOnDate', () => {
  const today = '2025-01-10'

  it('lets one-time tasks log within the window, including future dates', () => {
    const oneTime = createMockHabit({ frequencyUnit: null })
    expect(canLogHabitOnDate(oneTime, '2025-01-20', today)).toBe(true)
    expect(canLogHabitOnDate(oneTime, today, today)).toBe(true)
  })

  it('blocks recurring and flexible habits from logging a future date', () => {
    const recurring = createMockHabit({ frequencyUnit: 'Day', isFlexible: false })
    const flexible = createMockHabit({ frequencyUnit: 'Week', isFlexible: true })
    expect(canLogHabitOnDate(recurring, '2025-01-11', today)).toBe(false)
    expect(canLogHabitOnDate(flexible, '2025-01-11', today)).toBe(false)
  })

  it('requires recurring non-flexible habits to be scheduled on the date', () => {
    const scheduled = createMockHabit({
      frequencyUnit: 'Day',
      isFlexible: false,
      isOverdue: false,
      scheduledDates: [today],
      instances: [],
    })
    const notScheduled = createMockHabit({
      frequencyUnit: 'Day',
      isFlexible: false,
      isOverdue: false,
      scheduledDates: ['2025-01-09'],
      instances: [],
      dueDate: '2025-01-09',
    })
    expect(canLogHabitOnDate(scheduled, today, today)).toBe(true)
    expect(canLogHabitOnDate(notScheduled, today, today)).toBe(false)
  })

  it('allows logging an overdue recurring habit today even when not scheduled', () => {
    const overdue = createMockHabit({
      frequencyUnit: 'Day',
      isFlexible: false,
      isOverdue: true,
      scheduledDates: ['2025-01-08'],
      instances: [],
      dueDate: '2025-01-08',
    })
    expect(canLogHabitOnDate(overdue, today, today)).toBe(true)
  })

  it('rejects dates older than the overdue window', () => {
    const oneTime = createMockHabit({ frequencyUnit: null })
    expect(canLogHabitOnDate(oneTime, '2025-01-01', today)).toBe(false)
  })
})

describe('getHabitLogDateDecision', () => {
  const today = '2025-01-10'
  const recurring = createMockHabit({ createdAtUtc: '2025-01-03T12:00:00Z', frequencyUnit: 'Day' })

  it('blocks API rejected past and future dates', () => {
    expect(getHabitLogDateDecision(recurring, '2025-01-02', today, 'UTC')).toBe('block')
    expect(getHabitLogDateDecision(recurring, '2025-01-11', today, 'UTC')).toBe('block')
  })

  it('keeps the accepted backfill window immediate', () => {
    expect(getHabitLogDateDecision(recurring, '2025-01-03', today, 'UTC')).toBe('write')
    expect(getHabitLogDateDecision(recurring, '2025-01-09', today, 'UTC')).toBe('write')
  })

  it('confirms accepted dates the app never offers', () => {
    const oneTime = createMockHabit({ createdAtUtc: '2025-01-09T12:00:00Z', frequencyUnit: null })
    expect(getHabitLogDateDecision(oneTime, '2025-01-08', today, 'UTC')).toBe('confirm')
    expect(getHabitLogDateDecision(oneTime, '2025-05-01', today, 'UTC')).toBe('confirm')
    expect(getHabitLogDateDecision(oneTime, '2025-01-08', today, 'UTC', true)).toBe('write')
    expect(getHabitLogDateDecision(recurring, '2025-01-11', today, 'UTC', true)).toBe('block')
    expect(getHabitLogDateDecision(undefined, today, today, 'UTC', true)).toBe('block')
  })

  it('confirms a past date for a child with an unknown creation time', () => {
    const child = createMockHabit({ parentId: 'parent-1', createdAtUtc: '2025-01-01T12:00:00Z', createdAtUtcIsInherited: true, frequencyUnit: 'Day' })
    expect(getHabitLogDateDecision(child, '2025-01-09', today, 'UTC')).toBe('confirm')
    expect(getHabitLogDateDecision(child, '2025-01-09', today, 'UTC', true)).toBe('write')
    expect(getHabitLogDateDecision(child, today, today, 'UTC')).toBe('write')
  })

  it('blocks dates before a child was created and writes accepted dates immediately', () => {
    const child = createMockHabit({ parentId: 'parent-1', createdAtUtc: '2025-01-08T12:00:00Z', createdAtUtcIsInherited: false, dueDate: '2025-01-01', frequencyUnit: 'Day' })
    expect(getHabitLogDateDecision(child, '2025-01-07', today, 'UTC')).toBe('block')
    expect(getHabitLogDateDecision(child, '2025-01-07', today, 'UTC', true)).toBe('block')
    expect(getHabitLogDateDecision(child, '2025-01-07', today, 'UTC', false, 'unlog')).toBe('confirm-permanent-unlog')
    expect(getHabitLogDateDecision(child, '2025-01-07', today, 'UTC', true, 'unlog')).toBe('write')
    expect(getHabitLogDateDecision(child, '2025-01-08', today, 'UTC')).toBe('write')
    expect(getHabitLogDateDecision(child, '2025-01-09', today, 'UTC')).toBe('write')
  })
})

describe('computeHabitRowNextDueHint distance words', () => {
  const today = '2025-01-10'
  const t = createTranslator()
  const onToday = { selectedDate: today, today, hasChildren: false }

  it('returns null for today or past due dates', () => {
    expect(computeHabitRowNextDueHint(createMockHabit({ dueDate: today }), onToday, t, 'en')).toBeNull()
    expect(computeHabitRowNextDueHint(createMockHabit({ dueDate: '2025-01-05' }), onToday, t, 'en')).toBeNull()
  })

  it('says due tomorrow for the next day', () => {
    expect(computeHabitRowNextDueHint(createMockHabit({ dueDate: '2025-01-11' }), onToday, t, 'en')).toBe('habits.schedule.dueTomorrow')
  })

  it('renders a relative day hint when due within a week', () => {
    expect(['2025-01-12', '2025-01-16', '2025-01-17'].map((dueDate) => computeHabitRowNextDueHint(createMockHabit({ dueDate }), onToday, t, 'en')))
      .toEqual(['habits.schedule.dueInDays({"count":2})', 'habits.schedule.dueInDays({"count":6})', 'habits.schedule.dueInDays({"count":7})'])
  })

  it('renders an absolute scheduled date beyond a week', () => {
    expect(computeHabitRowNextDueHint(createMockHabit({ dueDate: '2025-02-09' }), onToday, t, 'en')).toContain('habits.schedule.scheduledOn')
  })
})

describe('computeHabitRowNextDueHint', () => {
  const today = '2025-01-10'
  const t = createTranslator()
  const onToday = { selectedDate: today, today, hasChildren: false }

  it('gives the next due label only on today', () => {
    const habit = createMockHabit({ dueDate: '2025-01-11', frequencyUnit: 'Day' })
    expect(computeHabitRowNextDueHint(habit, onToday, t, 'en')).toBe('habits.schedule.dueTomorrow')
    expect(computeHabitRowNextDueHint(habit, { ...onToday, selectedDate: '2025-01-09' }, t, 'en')).toBeNull()
  })

  it('gives no label for a completed one-time task', () => {
    expect(computeHabitRowNextDueHint(createMockHabit({ dueDate: '2025-01-11', frequencyUnit: null, isCompleted: true }), onToday, t, 'en')).toBeNull()
  })

  it('gives no label for a recurring habit whose next due date passes its end date', () => {
    expect(computeHabitRowNextDueHint(createMockHabit({ dueDate: '2025-01-11', frequencyUnit: 'Day', endDate: '2025-01-10', isCompleted: true }), onToday, t, 'en')).toBeNull()
  })

  it('keeps the label for a recurring habit that a detail row marks completed for the date', () => {
    expect(computeHabitRowNextDueHint(createMockHabit({ dueDate: '2025-01-11', frequencyUnit: 'Day', isCompleted: true }), onToday, t, 'en')).toBe('habits.schedule.dueTomorrow')
  })

  it('gives a logged parent its own next day words and keeps the first-occurrence words for every other row', () => {
    const due = { dueDate: '2025-01-11', frequencyUnit: 'Day' as const }
    expect({
      loggedParent: computeHabitRowNextDueHint(createMockHabit({ ...due, hasSubHabits: true, isLoggedInRange: true }), onToday, t, 'en'),
      loggedParentInView: computeHabitRowNextDueHint(createMockHabit({ ...due, isLoggedInRange: true }), { ...onToday, hasChildren: true }, t, 'en'),
      openParent: computeHabitRowNextDueHint(createMockHabit({ ...due, hasSubHabits: true }), { ...onToday, hasChildren: true }, t, 'en'),
      loggedLeaf: computeHabitRowNextDueHint(createMockHabit({ ...due, isLoggedInRange: true }), onToday, t, 'en'),
      loggedParentInTwoDays: computeHabitRowNextDueHint(createMockHabit({ ...due, dueDate: '2025-01-12', hasSubHabits: true, isLoggedInRange: true }), onToday, t, 'en'),
    }).toEqual({
      loggedParent: 'habits.schedule.nextDueTomorrow',
      loggedParentInView: 'habits.schedule.nextDueTomorrow',
      openParent: 'habits.schedule.dueTomorrow',
      loggedLeaf: 'habits.schedule.dueTomorrow',
      loggedParentInTwoDays: 'habits.schedule.dueInDays({"count":2})',
    })
  })
})

describe('next day words in both locales', () => {
  const today = '2025-01-10'
  const catalogTranslator = (messages: object) => (key: string) =>
    String(key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages))
  const onToday = { selectedDate: today, today, hasChildren: false }
  const openTaskDueTomorrow = createMockHabit({ title: 'Dentist', dueDate: '2025-01-11', frequencyUnit: null, frequencyQuantity: null })
  const openParentDueTomorrow = createMockHabit({ dueDate: '2025-01-11', hasSubHabits: true })
  const loggedParentDueTomorrow = createMockHabit({ dueDate: '2025-01-11', hasSubHabits: true, isLoggedInRange: true })

  it.each([['en', en, 'due tomorrow', 'due tomorrow'], ['pt-BR', ptBR, 'amanhã', 'volta amanhã']] as const)(
    'never tells a %s screen reader that a row which has not happened yet comes back', (locale, messages, firstOccurrence, loggedParent) => {
      const t = catalogTranslator(messages)
      expect({
        openTask: computeHabitRowNextDueHint(openTaskDueTomorrow, onToday, t, locale),
        openParent: computeHabitRowNextDueHint(openParentDueTomorrow, { ...onToday, hasChildren: true }, t, locale),
        loggedParent: computeHabitRowNextDueHint(loggedParentDueTomorrow, { ...onToday, hasChildren: true }, t, locale),
      }).toEqual({ openTask: firstOccurrence, openParent: firstOccurrence, loggedParent })
    },
  )
})

describe('isLoggedParentHabitRow', () => {
  it.each(loggedParentRowCases)('decides $name from the habit and the view: logged parent=$loggedParent', ({ habit, hasChildren, loggedParent }) => {
    expect(isLoggedParentHabitRow(habit, hasChildren)).toBe(loggedParent)
  })

  it.each(loggedParentRowCases)('shows the next due label of $name only when it is a logged parent on today: $nextDueVisible', ({ habit, hasChildren, selectedDate, nextDueVisible }) => {
    const hint = computeHabitRowNextDueHint(habit, { selectedDate, today: LOGGED_PARENT_TODAY, hasChildren }, createTranslator(), 'en')
    expect(isLoggedParentHabitRow(habit, hasChildren) && hint !== null).toBe(nextDueVisible)
  })

  it('reads the done state from the log of the habit, not from the check that a caller paints', () => {
    expect([
      isLoggedParentHabitRow(createMockHabit({ hasSubHabits: true, isCompleted: true }), false),
      isLoggedParentHabitRow(createMockHabit({ hasSubHabits: true, isLoggedInRange: true }), false),
      isLoggedParentHabitRow(createMockHabit({ hasSubHabits: true }), true),
    ]).toEqual([true, true, false])
  })
})
