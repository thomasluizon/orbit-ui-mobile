import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { plural } from '../utils/plural'

describe('streak final fact grammar', () => {
  it.each([0, 1, 2, 1000])('keeps complete localized facts and standalone units for %s', (count) => {
    expect(plural(en.celebration.streak.unit, count)).toBe(count === 1 ? 'day' : 'days')
    expect(plural(ptBR.celebration.streak.unit, count)).toBe(count === 1 ? 'dia' : 'dias')
    expect(plural(en.streakDisplay.badge.tooltip, count).replace('{count}', String(count))).toBe(`${count}-day streak`)
    expect(plural(ptBR.streakDisplay.badge.tooltip, count).replace('{count}', String(count))).toBe(`Sequência de ${count} ${count === 1 ? 'dia' : 'dias'}`)
  })
})
