import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'

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

function read(messages: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages)
}

describe('habit and goal input questions', () => {
  it.each([['en', en], ['pt-BR', ptBR]] as const)('asks every habit and goal input as a short question in %s', (_locale, messages) => {
    for (const key of QUESTION_KEYS) {
      const value = read(messages, key)
      expect(typeof value, key).toBe('string')
      expect(value, key).toMatch(/^\S.*\?$/)
      expect((value as string).split(/\s+/).length, key).toBeLessThanOrEqual(7)
    }
  })
})
