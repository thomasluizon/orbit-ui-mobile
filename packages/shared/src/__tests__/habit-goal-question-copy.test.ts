import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'

const LOCALES = [['en', en], ['pt-BR', ptBR]] as const
const FREQUENCY_UNITS = ['Day', 'Week', 'Month', 'Year'] as const

const QUESTION_KEYS = [
  'habits.form.itemType', 'habits.form.describe', 'habits.form.taskDescribe', 'habits.form.descriptionQuestion',
  'habits.form.datePhrase', 'habits.form.habitStartDate', 'habits.form.frequency', 'habits.form.everyCount',
  'habits.form.timesCount', 'habits.form.unit', 'habits.form.checklistQuestion', 'habits.form.subHabitsQuestion',
  'habits.form.subTasksQuestion', 'habits.form.habitTypeAvoid', 'habits.form.slipAlertQuestion', 'habits.form.addEndDate',
  'habits.form.endDateQuestion', 'goals.form.title', 'goals.form.description', 'goals.form.typeQuestion',
  'goals.form.targetValueQuestion', 'goals.form.unitQuestion', 'goals.form.streakTarget', 'goals.form.deadlineQuestion',
  'goals.form.progressQuestion', 'goals.form.progressNoteQuestion', 'onboarding.flow.when.scheduleMode',
  'onboarding.flow.when.frequencyUnitLabel', 'onboarding.flow.when.daysLabel', 'onboarding.flow.when.timeLabel',
] as const

const HABIT_FORM_QUESTIONS = [
  'habits.form.itemType', 'habits.form.describe', 'habits.form.descriptionQuestion', 'habits.form.datePhrase',
  'habits.form.habitStartDate', 'habits.form.frequency', 'habits.form.everyCount', 'habits.form.timesCount',
  'habits.form.unit', 'habits.form.checklistQuestion', 'habits.form.subHabitsQuestion', 'habits.form.habitTypeAvoid',
  'habits.form.slipAlertQuestion', 'habits.form.addEndDate', 'habits.form.endDateQuestion', 'habits.form.exactTime',
  'habits.form.addEndTime', 'habits.form.dueEndTime', 'habits.form.reminder', 'habits.form.reminderKind',
  'habits.form.reminderCustomLabel', 'habits.form.reminderCustomUnit', 'habits.form.reminderDirection',
  'habits.form.repeatStart', 'habits.form.repeatInterval', 'habits.form.repeatAllDay', 'habits.form.repeatActiveStart',
  'habits.form.repeatActiveEnd', 'habits.form.scheduledReminder', 'habits.form.scheduledReminderTime',
] as const

const FORM_QUESTIONS = {
  'habit form': HABIT_FORM_QUESTIONS,
  'task form': HABIT_FORM_QUESTIONS.map((key) => key === 'habits.form.describe' ? 'habits.form.taskDescribe' : key === 'habits.form.subHabitsQuestion' ? 'habits.form.subTasksQuestion' : key),
  'create goal sheet': ['goals.form.typeQuestion', 'goals.form.title', 'goals.form.targetValueQuestion', 'goals.form.unitQuestion', 'goals.form.streakTarget', 'goals.form.deadlineQuestion'],
  'create goal from habit': ['goals.form.typeQuestion', 'goals.form.targetValueQuestion', 'goals.form.unitQuestion', 'goals.form.streakTarget', 'goals.form.deadlineQuestion'],
  'edit goal': ['goals.form.description', 'goals.form.targetValueQuestion', 'goals.form.unitQuestion', 'goals.form.streakTarget', 'goals.form.deadlineQuestion'],
  'goal progress': ['goals.form.progressQuestion', 'goals.form.progressNoteQuestion'],
  'onboarding schedule': ['onboarding.flow.when.scheduleMode', 'onboarding.flow.when.frequencyUnitLabel', 'onboarding.flow.when.daysLabel', 'onboarding.flow.when.timeLabel'],
} as const

function read(messages: unknown, key: string): string {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages)
  if (typeof value !== 'string') throw new Error(`${key} is not a string`)
  return value
}

function renderings(messages: unknown, locale: string, key: string): string[] {
  const message = read(messages, key)
  if (!message.includes('{')) return [message]
  return FREQUENCY_UNITS.map((unit) => String(new IntlMessageFormat(message, locale).format({ unit })))
}

describe('habit and goal input questions', () => {
  it.each(LOCALES)('asks every habit and goal input as a short question in %s', (locale, messages) => {
    for (const key of QUESTION_KEYS) {
      for (const question of renderings(messages, locale, key)) {
        expect(question, key).toMatch(/^\S.*\?$/)
        expect(question.split(/\s+/).length, key).toBeLessThanOrEqual(7)
      }
    }
  })

  it.each(LOCALES)('names the chosen period in the every count question in %s', (locale, messages) => {
    const questions = renderings(messages, locale, 'habits.form.everyCount')
    expect(new Set(questions).size).toBe(FREQUENCY_UNITS.length)
    const periods = locale === 'en' ? ['days', 'weeks', 'months', 'years'] : ['dias', 'semanas', 'meses', 'anos']
    questions.forEach((question, index) => expect(question).toContain(periods[index]))
  })

  it.each(LOCALES)('gives each field on one form its own question in %s', (locale, messages) => {
    for (const [form, keys] of Object.entries(FORM_QUESTIONS)) {
      const owners = new Map<string, string>()
      for (const key of keys) {
        for (const question of renderings(messages, locale, key)) {
          const owner = owners.get(question)
          expect(owner === undefined || owner === key, `${form}: ${key} repeats "${question}" from ${owner}`).toBe(true)
          owners.set(question, key)
        }
      }
    }
  })
})
