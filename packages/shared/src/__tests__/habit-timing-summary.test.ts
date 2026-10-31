import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { buildHabitTimingSummary } from '../utils/habit-timing-summary'
import { buildEmptyHabitFormValues } from '../utils/habit-form-state'
import { buildHabitUnderstandingLabels } from '../utils/habit-form-helpers'

for (const [locale, messages] of [['en', en], ['pt-BR', ptBR]] as const) {
  const translate = (key: string, values?: Record<string, string | number>) => {
    const template = Object.entries(messages.habits.form).find(([name]) => key === `habits.form.${name}`)?.[1]
    if (!template) throw new Error(`Missing test translation: ${key}`)
    return String(new IntlMessageFormat(template, locale).format(values))
  }
  describe(`form decision copy in ${locale}`, () => {
    it('uses missing-title guidance for both item types', () => {
      expect(messages.habits.form.titleRequired).toBe(locale === 'en' ? 'Enter a title.' : 'Escreva um título.')
    })
    it('labels a task and habit according to the selected type', () => {
      expect(buildHabitUnderstandingLabels(translate, 'task')).toMatchObject({ field: messages.habits.form.taskDescribe, placeholder: messages.habits.form.taskDescribePlaceholder })
      expect(buildHabitUnderstandingLabels(translate, 'habit')).toMatchObject({ field: messages.habits.form.describe, placeholder: messages.habits.form.describePlaceholder })
    })
    it('summarizes time and the enabled reminder model', () => {
      const values = { ...buildEmptyHabitFormValues(), dueTime: '08:00', reminderEnabled: true, repeatReminder: { intervalMinutes: 480 } }
      expect(buildHabitTimingSummary(values, [], time => time, translate)).toBe(locale === 'en' ? '08:00, every 8 hours' : '08:00, a cada 8 horas')
      expect(buildHabitTimingSummary({ ...values, isGeneral: true }, [], time => time, translate)).toBe(locale === 'en' ? 'every 8 hours' : 'a cada 8 horas')
      expect(buildHabitTimingSummary({ ...values, reminderEnabled: false }, [], time => time, translate)).toBe('08:00')
      expect(buildHabitTimingSummary(buildEmptyHabitFormValues(), [], time => time, translate)).toBe(messages.habits.form.timingEmpty)
      expect(buildHabitTimingSummary({ ...values, repeatReminder: null, scheduledReminders: [{ when: 'day_before', time: '20:00' }] }, [15], time => time, translate)).toContain('20:00')
    })
  })
}
