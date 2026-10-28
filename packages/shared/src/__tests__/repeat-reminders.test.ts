import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { habitFormSchema, validateHabitForm } from '../validation/habit-form'
import { habitDetailSchema, habitScheduleItemSchema, normalizedHabitSchema } from '../types/habit'
import { createMockHabit } from './factories'

const repeat = { intervalMinutes: 30 }
describe('repeat reminder contract and validation', () => {
  it.each([habitDetailSchema, habitScheduleItemSchema, normalizedHabitSchema])('preserves next instant absence, null and UTC value', (schema) => {
    const habit = { ...createMockHabit(), linkedGoals: [], children: [] }
    expect(schema.parse({ ...habit, nextReminderAtUtc: '2026-10-29T04:00:00Z' })).toHaveProperty('nextReminderAtUtc', '2026-10-29T04:00:00Z')
    expect(schema.parse({ ...habit, nextReminderAtUtc: null })).toHaveProperty('nextReminderAtUtc', null)
    expect(schema.parse(habit)).not.toHaveProperty('nextReminderAtUtc')
  })
  it.each([
    { frequencyUnit: 'Week', frequencyQuantity: 1 },
    { frequencyUnit: 'Day', frequencyQuantity: 2 },
    { frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'] },
    { frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: 2 },
    {},
  ])('refuses repeat on unsupported schedules %j', (schedule) => {
    expect(validateHabitForm(habitFormSchema.parse({ title: 'Water', ...schedule, reminderEnabled: true, repeatReminder: repeat }))).toBe('habits.form.repeatDailyOnly')
  })
  it.each([
    { isGeneral: true },
    { frequencyUnit: 'Day', frequencyQuantity: 1 },
    { frequencyUnit: 'Day', frequencyQuantity: 8, isFlexible: true },
  ])('accepts supported everyday schedules %j', (schedule) => {
    expect(validateHabitForm(habitFormSchema.parse({ title: 'Water', ...schedule, reminderEnabled: true, repeatReminder: repeat }))).toBeNull()
  })
  it.each([{ intervalMinutes: 10 }, { intervalMinutes: 90 }, { intervalMinutes: 1440 }, { intervalMinutes: 30, activeStart: '20:00' }, { intervalMinutes: 30, activeStart: '20:00', activeEnd: '20:00' }])('refuses invalid options %j', (repeatReminder) => {
    expect(validateHabitForm(habitFormSchema.parse({ title: 'Water', isGeneral: true, reminderEnabled: true, repeatReminder }))).toBe('habits.form.repeatInvalid')
  })
})

import { repeatReminderClock, repeatReminderInstant } from '../utils/repeat-reminders'
import { createTimeDisplay } from '../utils/locale-format'
import { normalizeHabitDetailForDrill } from '../utils/drill-navigation'
it('keeps next time and cadence through detail normalization for roots and children', () => {
  const child = { ...createMockHabit(), children: [], repeatReminder: { intervalMinutes: 480 }, nextReminderAtUtc: null }
  const habit = habitDetailSchema.parse({ ...child, nextReminderAtUtc: '2026-10-29T04:00:00Z', children: [child] })
  const normalized = normalizeHabitDetailForDrill(habit, '2026-10-28')
  expect(normalized.parent).toMatchObject({ nextReminderAtUtc: habit.nextReminderAtUtc, repeatReminder: habit.repeatReminder })
  expect(normalized.childrenByParent.get(habit.id)?.[0]).toMatchObject({ nextReminderAtUtc: null, repeatReminder: child.repeatReminder })
})
it('edits account-local times across midnight and refuses nonexistent daylight-saving times', () => {
  expect(repeatReminderClock('2026-10-29T02:30:00Z', 'America/Sao_Paulo')).toBe('23:30')
  expect(repeatReminderInstant('2026-10-28', '23:00', 'America/Sao_Paulo')).toBe('2026-10-29T02:00:00.000Z')
  expect(repeatReminderInstant('2026-03-08', '02:30', 'America/New_York')).toBeNull()
  expect(repeatReminderInstant('2026-03-08', '03:30', 'America/New_York')).toBe('2026-03-08T07:30:00.000Z')
  expect(createTimeDisplay('en', false, 'America/Sao_Paulo').displayClock('2026-10-29T02:30:00Z')).toBe('11:30 PM')
})

it('makes the reminder utility resolvable through the public package used by both apps', () => {
  const require = createRequire(import.meta.url)
  expect(require.resolve('@orbit/shared/utils/repeat-reminders')).toMatch(/utils\/repeat-reminders\.ts$/)
})
