import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { summarizePendingOperationItem } from '../chat/pending-operation-item-summary'
import { habitDetailSchema, habitScheduleItemSchema, updateHabitRequestSchema, createHabitRequestSchema } from '../types/habit'
import { createApiClientError, getFriendlyErrorKey } from '../utils/error-utils'
import { computeHabitFrequencyLabel } from '../utils/habit-card-helpers'
import { buildHabitHistoryMonth, mergeHabitDetailWithScopedHabit } from '../utils/habit-detail-flow'
import { applyHabitPhraseRead, buildHabitUnderstandingSentence, createHabitFormController, normalizeHabitFormData } from '../utils/habit-form-helpers'
import { buildEditHabitFormState } from '../utils/habit-form-state'
import { readHabitPhrase } from '../utils/habit-phrase-parser'
import { readHabitRecurrencePhrase } from '../utils/habit-recurrence-phrase'
import { buildCreateHabitRequest, buildUpdateHabitRequest } from '../utils/habit-request-builders'
import { matchesHabitMonthDays, toggleHabitMonthDay } from '../utils/month-days'
import { parseAPIDate } from '../utils/dates'
import { validateHabitForm, type HabitFormData } from '../validation/habit-form'
import { createMockHabit } from './factories'
import { makeHabitDetail, makeHabitScheduleItem } from '../test-support/habit-detail-fixtures'

function translator(messages: typeof en | typeof ptBR) {
  return (key: string, values?: Record<string, string | number | Date>): string => {
    const template = key.split('.').reduce<unknown>((current, part) => Reflect.get(current as object, part), messages)
    if (typeof template !== 'string') throw new Error(`Missing message ${key}`)
    return String(new IntlMessageFormat(template, messages === ptBR ? 'pt-BR' : 'en').format(values))
  }
}

const english = translator(en)
const portuguese = translator(ptBR)

function formFromPhrase(title: string, locale: 'en' | 'pt-BR'): HabitFormData {
  const values = normalizeHabitFormData({ title, dueDate: '2026-11-05', itemType: 'habit' })
  applyHabitPhraseRead(true, readHabitPhrase(title, locale), false, { cadence: false, dueTime: false }, {
    setOneTime: () => {}, setFlexible: () => {}, setGeneral: () => {},
    setRecurring: () => { Object.assign(values, { isFlexible: false, isGeneral: false }) },
    setField: (field, value) => { Object.assign(values, { [field]: value }) },
  })
  return values
}

describe('a habit on chosen days of the month', () => {
  it.each([
    ['todo dia 8 e 15', 'pt-BR'],
    ['Pagar o cartão todo dia 8 e dia 15 do mês', 'pt-BR'],
    ['dia 8 e dia 15 do mês', 'pt-BR'],
    ['Pay rent the 8th and 15th of every month', 'en'],
    ['every month on the 15th and the 8th', 'en'],
  ] as const)('reads %s as the 8th and 15th of every month', (title, locale) => {
    const read = readHabitPhrase(title, locale)
    expect(read).toMatchObject({ cadence: 'monthly', monthDays: [8, 15], days: [] })
    expect(read.consumed.map((token) => token.kind)).toContain('monthDay')
  })

  it('keeps a bare number after every day as a daily quantity, not a day of the month', () => {
    expect(readHabitPhrase('Ler todo dia 10 páginas', 'pt-BR')).toMatchObject({ cadence: 'daily', monthDays: [] })
    expect(readHabitPhrase('todo dia às 8', 'pt-BR')).toMatchObject({ cadence: 'daily', dueTime: '08:00', monthDays: [] })
  })

  it('leaves a day outside 1 to 31 unresolved instead of guessing', () => {
    expect(readHabitPhrase('todo dia 32', 'pt-BR')).toMatchObject({ cadence: null, monthDays: [] })
  })

  it('reads the chosen days with a reminder time', () => {
    expect(readHabitPhrase('todo dia 8 às 9h', 'pt-BR')).toMatchObject({ cadence: 'monthly', monthDays: [8], dueTime: '09:00' })
  })

  it('reads a month-day date phrase as an Every 1 month recurrence', () => {
    expect(readHabitRecurrencePhrase('todo dia 8 e dia 15 do mês')).toEqual({
      schedule: { unit: 'Month', quantity: 1, days: [], monthDays: [8, 15], flexible: false, intervalWeeks: 1 },
      startPhrase: null,
    })
    expect(readHabitRecurrencePhrase('the 8th and 15th of every month')?.schedule.monthDays).toEqual([8, 15])
  })

  it.each([
    ['todo dia 8 e dia 15 do mês', 'pt-BR'],
    ['the 8th and 15th of every month', 'en'],
  ] as const)('creates %s with monthDays [8, 15] on Every 1 month', (title, locale) => {
    const request = buildCreateHabitRequest(formFromPhrase(title, locale), [], [], [], [])
    expect(createHabitRequestSchema.parse(request)).toMatchObject({
      frequencyUnit: 'Month', frequencyQuantity: 1, monthDays: [8, 15], startDate: '2026-11-05',
    })
    expect(request).not.toHaveProperty('days')
  })

  it('sends no month days once the habit stops repeating monthly', () => {
    const values = { ...formFromPhrase('todo dia 8 e 15', 'pt-BR'), frequencyUnit: 'Week' as const }
    expect(buildCreateHabitRequest(values, [], [], [], [])).not.toHaveProperty('monthDays')
    expect(buildUpdateHabitRequest(values, false, '', [], [])).not.toHaveProperty('monthDays')
  })

  it('clears stored month days on edit when the start date day is chosen again', () => {
    const habit = createMockHabit({ frequencyUnit: 'Month', frequencyQuantity: 1, days: [], monthDays: [8, 15], startDate: '2026-11-08' })
    const state = buildEditHabitFormState(habit)
    expect(state.formValues.monthDays).toEqual([8, 15])
    const cleared = { ...state.formValues, monthDays: [] }
    expect(updateHabitRequestSchema.parse(buildUpdateHabitRequest(cleared, false, '', [], []))).toMatchObject({ frequencyUnit: 'Month', monthDays: [] })
  })

  it('prefers the detail month days when the edit form opens from the detail', () => {
    const habit = createMockHabit({ frequencyUnit: 'Month', frequencyQuantity: 1, days: [] })
    const detail = habitDetailSchema.parse({ ...makeHabitDetail(), frequencyUnit: 'Month', monthDays: [1, 20] })
    expect(buildEditHabitFormState(habit, detail).formValues.monthDays).toEqual([1, 20])
  })

  it('toggles days from the start date day and returns to the default when only that day is left', () => {
    expect(toggleHabitMonthDay([], 15, 8)).toEqual([8, 15])
    expect(toggleHabitMonthDay([8, 15], 15, 8)).toEqual([])
    expect(toggleHabitMonthDay([8, 15], 8, 8)).toEqual([15])
    expect(toggleHabitMonthDay([], 8, 8)).toEqual([])
  })

  it('writes a toggled month day through the shared form controller', () => {
    const values: Record<string, unknown> = {}
    const controller = createHabitFormController({ action: undefined, atLimit: false, lockedGeneral: false, target: {
      setOneTime: () => {}, setRecurring: () => {}, setFlexible: () => {}, setGeneral: () => {}, toggleDay: () => {},
      getOwnership: () => ({ cadence: true, dueTime: false }), setOwnership: () => {}, updateProposal: () => {},
      setField: (field, value) => { values[field] = value },
    } })
    controller.toggleMonthDay(15, 8, [])
    expect(values.monthDays).toEqual([8, 15])
  })

  it('rejects chosen month days on a habit that also skips weeks', () => {
    const values = formFromPhrase('todo dia 8 e 15', 'pt-BR')
    expect(validateHabitForm(values)).toBeNull()
    expect(validateHabitForm({ ...values, intervalWeeks: 2 })).toBe('habits.form.monthDaysOnlyForMonthly')
  })

  it.each([
    [[8, 15], 1, 'On the 8th and 15th', 'Todo dia 8 e 15'],
    [[1, 2, 3, 22], 1, 'On the 1st, 2nd, 3rd and 22nd', 'Todo dia 1, 2, 3 e 22'],
    [[31], 1, 'On the 31st', 'Todo dia 31'],
    [[8], 2, 'Every 2 months on the 8th', 'A cada 2 meses, dia 8'],
  ] as const)('summarises %j every %i months in both locales', (monthDays, quantity, englishText, portugueseText) => {
    const habit = createMockHabit({ frequencyUnit: 'Month', frequencyQuantity: quantity, days: [], monthDays: [...monthDays] })
    expect(computeHabitFrequencyLabel(habit, english)).toBe(englishText)
    expect(computeHabitFrequencyLabel(habit, portuguese)).toBe(portugueseText)
  })

  it('carries month days from the habit detail into its schedule summary', () => {
    const detail = habitDetailSchema.parse({ ...makeHabitDetail(), frequencyUnit: 'Month', frequencyQuantity: 1, days: [], monthDays: [8, 15] })
    const habit = mergeHabitDetailWithScopedHabit(detail, undefined, '2026-11-05')
    expect(computeHabitFrequencyLabel(habit, portuguese)).toBe('Todo dia 8 e 15')
    expect(computeHabitFrequencyLabel(habit, english)).toBe('On the 8th and 15th')
  })

  it('keeps the plain monthly summary when no day is chosen', () => {
    expect(computeHabitFrequencyLabel(createMockHabit({ frequencyUnit: 'Month', frequencyQuantity: 1, days: [], monthDays: [] }), english)).toBe('Every month')
  })

  it('states the chosen days in the understanding sentence', () => {
    expect(buildHabitUnderstandingSentence([], [], false, 'Month', 1, '09:00', 'pt-BR', portuguese, 1, [8, 15])).toBe('Todo dia 8 e 15 às 09:00')
    expect(buildHabitUnderstandingSentence([], [], false, 'Month', 1, '', 'en', english, 1, [8, 15])).toBe('On the 8th and 15th')
  })

  it('summarises an Astra create preview with its month days', () => {
    const field = (name: string, proposedValue: unknown, newValue: string) => ({
      entityId: '00000000-0000-0000-0000-000000000000', entityName: 'Rent', field: name,
      oldValue: null, newValue, valueType: 'text', proposedValue, isEditable: true,
    })
    const fields = [
      field('frequency_unit', 'Month', 'Month'), field('frequency_quantity', 1, '1'), field('month_days', [8, 15], '[8,15]'),
    ]
    expect(summarizePendingOperationItem(fields, english, (value) => value, 'en', 'createHabit')).toBe('On the 8th and 15th')
    expect(summarizePendingOperationItem(fields, portuguese, (value) => value, 'pt-BR', 'createHabit')).toBe('Todo dia 8 e 15')
  })

  const habitId = '2dab1b90-8339-4086-adcd-b4c36305c7cd'
  const change = (field: string, oldValue: string | null, newValue: string, proposedValue: unknown, valueType = 'text') => ({
    entityId: habitId, entityName: 'Rent', field, oldValue, newValue, valueType, proposedValue, isEditable: field !== 'habit_id',
  })

  it.each([
    ['moves the days', '8, 15', '[10,20]', [10, 20], 'On the 8th and 15th → On the 10th and 20th', 'Nos dias 8 e 15 → Nos dias 10 e 20'],
    ['returns to the start date', '8', '[]', [], 'On the 8th → On the same day as the start date', 'No dia 8 → No mesmo dia do início'],
  ] as const)('summarises a staging update_habit preview that only %s', (_change, oldValue, newValue, proposedValue, englishText, portugueseText) => {
    const fields = [change('habit_id', null, habitId, habitId), change('month_days', oldValue, newValue, [...proposedValue])]
    expect(summarizePendingOperationItem(fields, english, (value) => value, 'en', 'updateHabit')).toBe(englishText)
    expect(summarizePendingOperationItem(fields, portuguese, (value) => value, 'pt-BR', 'updateHabit')).toBe(portugueseText)
  })

  it('summarises a staging bulk_update_habits preview that moves the days and the next due date', () => {
    const fields = [change('month_days', '8, 15', '10, 20', [10, 20]), change('due_date', '2026-11-08', '2026-11-10', '2026-11-10', 'date')]
    expect(summarizePendingOperationItem(fields, english, (value) => value, 'en', 'updateHabits')).toBe('Nov 8, 2026 · On the 8th and 15th → Nov 10, 2026 · On the 10th and 20th')
    expect(summarizePendingOperationItem(fields, portuguese, (value) => value, 'pt-BR', 'updateHabits')).toBe('8 de nov. de 2026 · Nos dias 8 e 15 → 10 de nov. de 2026 · Nos dias 10 e 20')
  })

  it('reads the windowed bulk list text the API writes when a day is added after an unchanged one', () => {
    const fields = [change('month_days', '+1 earlier, (none)', '+1 earlier, 15', [10, 15])]
    expect(summarizePendingOperationItem(fields, english, (value) => value, 'en', 'updateHabits')).toBe('On the 10th and 15th')
  })

  it('never calls the old days of a daily habit the start date day when a bulk update makes it monthly', () => {
    const fields = [change('frequency_unit', 'Day', 'Month', 'Month'), change('month_days', '(none)', '5, 25', [5, 25])]
    expect(summarizePendingOperationItem(fields, english, (value) => value, 'en', 'updateHabits')).toBe('Repetition in days → Repetition in months · On the 5th and 25th')
  })

  it('never calls the cleared days of a habit that stops being monthly the start date day', () => {
    const fields = [change('frequency_unit', 'Month', 'Day', 'Day'), change('month_days', '5, 25', '(none)', [])]
    expect(summarizePendingOperationItem(fields, english, (value) => value, 'en', 'updateHabits')).toBe('Repetition in months · On the 5th and 25th → Repetition in days')
  })

  it('puts a missing day on the last day of a short month, as the API does', () => {
    expect(matchesHabitMonthDays([8, 31], parseAPIDate('2027-02-28'))).toBe(true)
    expect(matchesHabitMonthDays([8, 31], parseAPIDate('2027-02-27'))).toBe(false)
    expect(matchesHabitMonthDays([30, 31], parseAPIDate('2027-02-28'))).toBe(true)
  })

  it('shows the habit history due only on the chosen days', () => {
    const habit = {
      createdAtUtc: '2026-10-01T00:00:00Z', days: [], dueDate: '2026-11-08', endDate: null, frequencyQuantity: 1,
      frequencyUnit: 'Month', monthDays: [8, 15], isBadHabit: false, isGeneral: false, isFlexible: false, scheduledStartDate: '2026-11-08',
    }
    const month = buildHabitHistoryMonth(habit, [], parseAPIDate('2026-12-01'), parseAPIDate('2026-12-31'), 1)
    const due = month.filter((day) => !day.outsideMonth && day.outcome === 'none').map((day) => day.day)
    expect(due).toEqual([8, 15])
  })

  it('parses month days on schedule items and details, and tolerates their absence', () => {
    const item = makeHabitScheduleItem({ frequencyUnit: 'Month' })
    expect(habitScheduleItemSchema.parse({ ...item, monthDays: [8, 15] }).monthDays).toEqual([8, 15])
    expect(habitScheduleItemSchema.parse(item).monthDays).toBeUndefined()
    expect(habitDetailSchema.parse({ ...makeHabitDetail(), monthDays: [1] }).monthDays).toEqual([1])
    expect(() => habitDetailSchema.parse({ ...makeHabitDetail(), monthDays: [32] })).toThrow()
  })

  it.each([
    ['MONTH_DAYS_INVALID', 'habits.form.monthDaysInvalid'],
    ['MONTH_DAYS_REQUIRE_MONTH', 'habits.form.monthDaysOnlyForMonthly'],
  ])('localizes the API code %s', (code, key) => {
    const error = createApiClientError(400, { error: 'Month days rejected.', errorCode: code }, 'Request failed')
    expect(getFriendlyErrorKey(error, 'errors.generic', 'habit')).toBe(key)
  })
})
