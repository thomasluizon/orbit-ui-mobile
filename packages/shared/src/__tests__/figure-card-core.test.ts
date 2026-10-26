import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { comparisonPresentation, formatFigurePeriod } from '../chat/figure-card-core'
import { focusedPeriodComparisonFixture } from '../test-support/chat-fixtures'
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
    it.each([[88, 20, 'ahead'], [2, 20, 'behind'], [0, 0, 'equal']] as const)('answers a comparison of %s and %s', (currentValue, baselineValue, _direction) => {
      const card = { ...focusedPeriodComparisonFixture, currentValue, baselineValue }
      const presentation = comparisonPresentation(card, locale, translate)
      expect(presentation.verdict).toContain(String(currentValue))
      expect(presentation.verdict).toContain(locale === 'en' ? 'completions' : 'conclusões')
      expect(presentation.bars[0]!.width).toBe(currentValue / Math.max(currentValue, baselineValue, 1) * 100)
      expect(presentation.bars[1]!.width).toBe(baselineValue / Math.max(currentValue, baselineValue, 1) * 100)
    })
  })
}
