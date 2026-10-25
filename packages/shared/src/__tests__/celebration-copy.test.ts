import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { IntlMessageFormat } from 'intl-messageformat'

describe('streak final fact grammar', () => {
  it.each([0, 1, 2, 1000])('keeps complete localized facts and standalone units for %s', (count) => {
    expect(new IntlMessageFormat(en.celebration.streak.unit, 'en').format({ count })).toBe(count === 1 ? 'day' : 'days')
    expect(new IntlMessageFormat(ptBR.celebration.streak.unit, 'pt-BR').format({ count })).toBe(count === 1 ? 'dia' : 'dias')
    expect(new IntlMessageFormat(en.streakDisplay.badge.tooltip, 'en').format({ count })).toBe(`${count}-day streak`)
    expect(new IntlMessageFormat(ptBR.streakDisplay.badge.tooltip, 'pt-BR').format({ count })).toBe(`Sequência de ${count} ${count === 1 ? 'dia' : 'dias'}`)
  })
})
