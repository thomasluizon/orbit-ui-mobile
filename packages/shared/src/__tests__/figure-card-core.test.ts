import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { comparisonPresentation, formatFigurePeriod } from '../chat/figure-card-core'
import { completedHabitComparisonFixture, focusedPeriodComparisonFixture } from '../test-support/chat-fixtures'
import en from '../i18n/en.json'
import pt from '../i18n/pt-BR.json'

for (const [locale, messages] of [['en', en], ['pt-BR', pt]] as const) {
  const translate = (key: string, values?: Record<string, string | number>) => {
    const message = key.split('.').reduce<unknown>((entry, segment) => (entry as Record<string, unknown>)[segment], messages)
    return new IntlMessageFormat(String(message), locale).format(values) as string
  }
  describe(`compact figures in ${locale}`, () => {
    it('names complete and running months from the supplied windows', () => {
      expect(formatFigurePeriod({ from: '2026-10-01', to: '2026-10-25' }, locale, translate)).toContain(locale === 'en' ? 'October 2026 (so far)' : 'outubro de 2026 (até agora)')
      expect(formatFigurePeriod({ from: '2026-09-01', to: '2026-09-30' }, locale, translate)).not.toContain(locale === 'en' ? 'so far' : 'até agora')
    })
    it.each([[3, 1], [1, 3], [0, 0]] as const)('names completed habits in a comparison of %s and %s', (currentValue, baselineValue) => {
      const card = { ...completedHabitComparisonFixture, currentValue, baselineValue }
      const presentation = comparisonPresentation(card, locale, translate)
      expect(presentation.verdict).toContain(String(currentValue))
      expect(presentation.verdict[0]).toBe(presentation.verdict[0]!.toLocaleUpperCase(locale))
      expect(presentation.verdict).not.toMatch(/^(?:Sim|Yes),/)
      expect(presentation.verdict).not.toMatch(/está (?:à frente|atrás)/)
      expect(presentation.verdict).toContain(locale === 'en'
        ? currentValue === 1 ? 'habit completed' : 'habits completed'
        : currentValue === 1 ? 'hábito concluído' : 'hábitos concluídos')
      expect(presentation.verdict).not.toMatch(/completions?|conclus(?:ão|ões)/i)
    })
    it.each([
      ['habits', locale === 'en' ? 'habit completed' : 'hábito concluído', locale === 'en' ? 'habits completed' : 'hábitos concluídos'],
      ['records', locale === 'en' ? 'completion' : 'conclusão', locale === 'en' ? 'completions' : 'conclusões'],
      ['days', locale === 'en' ? 'day' : 'dia', locale === 'en' ? 'days' : 'dias'],
    ] as const)('puts the %s unit right after the current figure in both directions', (unit, singular, plural) => {
      const behind = comparisonPresentation({ ...completedHabitComparisonFixture, unit, currentValue: 1, baselineValue: 4 }, locale, translate)
      const ahead = comparisonPresentation({ ...completedHabitComparisonFixture, unit, currentValue: 4, baselineValue: 1 }, locale, translate)
      expect(behind.verdict).toContain(`1 ${singular}`)
      expect(ahead.verdict).toContain(`4 ${plural}`)
      expect(`${behind.verdict} ${ahead.verdict}`).not.toMatch(/\b(?:mais|menos|fewer)\b/)
    })
    it.each([[88, 20, 'ahead'], [2, 20, 'behind'], [0, 0, 'equal']] as const)('answers a comparison of %s and %s', (currentValue, baselineValue, _direction) => {
      const card = { ...focusedPeriodComparisonFixture, currentValue, baselineValue }
      const presentation = comparisonPresentation(card, locale, translate)
      expect(presentation.verdict).toContain(String(currentValue))
      expect(presentation.verdict[0]).toBe(presentation.verdict[0]!.toLocaleUpperCase(locale))
      expect(presentation.verdict).not.toMatch(/^(?:Sim|Yes),/)
      expect(presentation.verdict).not.toMatch(/está (?:à frente|atrás)/)
      expect(presentation.verdict).toContain(locale === 'en' ? 'completions' : 'conclusões')
      expect(presentation.bars[0]!.width).toBe(currentValue / Math.max(currentValue, baselineValue, 1) * 100)
      expect(presentation.bars[1]!.width).toBe(baselineValue / Math.max(currentValue, baselineValue, 1) * 100)
    })
  })
}
