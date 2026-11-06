import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { summarizePendingOperationItem } from '../chat/pending-operation-item-summary'
import type { PendingOperationChange } from '../types/ai'
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
    expect(english('habits.form.monthDaysOnlyForMonthly')).toBe('Set the week interval back to 1.')
    expect(portuguese('habits.form.monthDaysOnlyForMonthly')).toBe('Volte o intervalo semanal para 1.')
  })

  it('explains every API month-day condition apart from the form week interval line', () => {
    expect(english('habits.form.monthDaysNeedMonthly')).toBe('To choose days of the month, the habit must repeat monthly, with no weekdays and no week interval.')
    expect(portuguese('habits.form.monthDaysNeedMonthly')).toBe('Para escolher dias do mês, o hábito precisa se repetir todo mês, sem dias da semana e sem intervalo de semanas.')
  })

  it.each([
    [[8, 15], 1, 'On the 8th and 15th', 'Todo dia 8 e 15'],
    [[1, 2, 3, 22], 1, 'On the 1st, 2nd, 3rd and 22nd', 'Todo dia 1, 2, 3 e 22'],
    [[31], 1, 'On the 31st', 'Todo dia 31'],
    [[8], 2, 'Every 2 months on the 8th', 'A cada 2 meses, no dia 8'],
    [[8, 15], 2, 'Every 2 months on the 8th and 15th', 'A cada 2 meses, nos dias 8 e 15'],
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
  ] as const)('summarises an update_habit preview in the orbit-api source shape that only %s', (_change, oldValue, newValue, proposedValue, englishText, portugueseText) => {
    const fields = [change('habit_id', null, habitId, habitId), change('month_days', oldValue, newValue, [...proposedValue])]
    expect(summarizePendingOperationItem(fields, english, (value) => value, 'en', 'updateHabit')).toBe(englishText)
    expect(summarizePendingOperationItem(fields, portuguese, (value) => value, 'pt-BR', 'updateHabit')).toBe(portugueseText)
  })

  const captured = (entityId: string, entityName: string, changes: readonly Omit<PendingOperationChange, 'entityId' | 'entityName'>[]): PendingOperationChange[] => changes.map((row) => ({ entityId, entityName, ...row }))

  /** Each item below is one habit's rows from a real staging `bulk_update_habits` preview. */
  const stagingBulkMoveRent = captured('f73a6a5e-b9f9-445b-aeea-070aad6e6621', 'Rent rb2 348ba0', [
    { field: 'month_days', oldValue: '8, 15', newValue: '10, 20', valueType: 'text', proposedValue: [10, 20], isEditable: true, provenance: 'requested' },
    { field: 'due_date', oldValue: '2026-11-08', newValue: '2026-11-10', valueType: 'date', proposedValue: '2026-11-10', isEditable: true, provenance: 'stored' },
  ])
  const stagingBulkMoveWaterBill = captured('83054d52-631e-478a-8eb7-8da811e14ac7', 'Water bill rb2 348ba0', [
    { field: 'month_days', oldValue: '3', newValue: '10, 20', valueType: 'text', proposedValue: [10, 20], isEditable: true, provenance: 'requested' },
    { field: 'due_date', oldValue: '2026-12-03', newValue: '2026-11-10', valueType: 'date', proposedValue: '2026-11-10', isEditable: true, provenance: 'stored' },
  ])
  const stagingBulkMonthToOneTime = captured('fa7d47a8-a9bf-48b2-b5e2-33437732e8b1', 'Rent rb2 0b0ff5', [
    { field: 'frequency_unit', oldValue: 'Month', newValue: null, valueType: 'text', proposedValue: null, isEditable: true, provenance: 'requested' },
    { field: 'frequency_quantity', oldValue: '1', newValue: null, valueType: 'number', proposedValue: null, isEditable: true, provenance: 'requested' },
    { field: 'month_days', oldValue: '5, 25', newValue: '(none)', valueType: 'text', proposedValue: [], isEditable: false, provenance: 'stored' },
  ])
  const stagingBulkOneTimeToMonth = captured('6a892c6e-f411-443f-a058-4a5589938178', 'Gym fee rb2 0b0ff5', [
    { field: 'frequency_unit', oldValue: null, newValue: 'Month', valueType: 'text', proposedValue: 'Month', isEditable: true, provenance: 'requested' },
    { field: 'frequency_quantity', oldValue: null, newValue: '1', valueType: 'number', proposedValue: 1, isEditable: true, provenance: 'requested' },
    { field: 'month_days', oldValue: '(none)', newValue: '5, 25', valueType: 'text', proposedValue: [5, 25], isEditable: true, provenance: 'requested' },
    { field: 'due_date', oldValue: '2026-11-20', newValue: '2026-11-25', valueType: 'date', proposedValue: '2026-11-25', isEditable: true, provenance: 'stored' },
  ])
  /** The rows of a real staging `update_habit` preview that makes a monthly habit one-time. */
  const stagingUpdateMonthToOneTime = captured('f73a6a5e-b9f9-445b-aeea-070aad6e6621', 'Rent rb2 348ba0', [
    { field: 'frequency_unit', oldValue: 'Month', newValue: null, valueType: 'text', proposedValue: null, isEditable: true, provenance: 'stored' },
    { field: 'habit_id', oldValue: null, newValue: 'f73a6a5e-b9f9-445b-aeea-070aad6e6621', valueType: 'text', proposedValue: 'f73a6a5e-b9f9-445b-aeea-070aad6e6621', isEditable: false, provenance: 'requested' },
  ])

  it.each([
    ['moves the days of two named habits and their next due dates (first habit)', stagingBulkMoveRent, 'updateHabits',
      'Nov 8, 2026 · On the 8th and 15th → Nov 10, 2026 · On the 10th and 20th', '8 de nov. de 2026 · Nos dias 8 e 15 → 10 de nov. de 2026 · Nos dias 10 e 20'],
    ['moves the days of two named habits and their next due dates (second habit)', stagingBulkMoveWaterBill, 'updateHabits',
      'Dec 3, 2026 · On the 3rd → Nov 10, 2026 · On the 10th and 20th', '3 de dez. de 2026 · No dia 3 → 10 de nov. de 2026 · Nos dias 10 e 20'],
    ['makes a monthly habit one-time without a day of the month on the one-time side', stagingBulkMonthToOneTime, 'updateHabits',
      '1 month · On the 5th and 25th → Once', '1 mês · Nos dias 5 e 25 → Uma vez'],
    ['makes a one-time habit monthly and keeps the one-time side as one-time', stagingBulkOneTimeToMonth, 'updateHabits',
      'Nov 20, 2026 · Once → 1 month · Nov 25, 2026 · On the 5th and 25th', '20 de nov. de 2026 · Uma vez → 1 mês · 25 de nov. de 2026 · Nos dias 5 e 25'],
    ['makes a monthly habit one-time through update_habit', stagingUpdateMonthToOneTime, 'updateHabit',
      'Repetition in months → Once', 'Repetição em meses → Uma vez'],
  ] as const)('summarises a captured staging preview that %s', (_shape, fields, actionKey, englishText, portugueseText) => {
    expect(summarizePendingOperationItem(fields, english, (value) => value, 'en', actionKey)).toBe(englishText)
    expect(summarizePendingOperationItem(fields, portuguese, (value) => value, 'pt-BR', actionKey)).toBe(portugueseText)
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
    ['MONTH_DAYS_REQUIRE_MONTH', 'habits.form.monthDaysNeedMonthly'],
  ])('localizes the API code %s', (code, key) => {
    const error = createApiClientError(400, { error: 'Month days rejected.', errorCode: code }, 'Request failed')
    expect(getFriendlyErrorKey(error, 'errors.generic', 'habit')).toBe(key)
  })
})
