import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { plural } from '../utils/plural'

describe('plural', () => {
  it('returns text without a pipe separator unchanged', () => {
    expect(plural('Há 5 minutos', 5)).toBe('Há 5 minutos')
  })

  it('picks singular or plural from two forms', () => {
    expect(plural('Há 1 minuto | Há 1 minutos', 1)).toBe('Há 1 minuto')
    expect(plural('Há 5 minuto | Há 5 minutos', 5)).toBe('Há 5 minutos')
  })

  it('picks zero, singular, or plural from three forms', () => {
    expect(plural('none | one | many', 0)).toBe('none')
    expect(plural('none | one | many', 1)).toBe('one')
    expect(plural('none | one | many', 7)).toBe('many')
  })

  it('selects the singular and plural day celebration copy in both locales', () => {
    expect(plural(en.celebration.day.line.replace('{count}', '1'), 1)).toBe(
      'All 1 habit for today is done.',
    )
    expect(plural(en.celebration.day.line.replaceAll('{count}', '2'), 2)).toBe(
      'All 2 habits for today are done.',
    )
    expect(plural(ptBR.celebration.day.line.replace('{count}', '1'), 1)).toBe(
      'O 1 hábito de hoje está feito.',
    )
    expect(plural(ptBR.celebration.day.line.replaceAll('{count}', '2'), 2)).toBe(
      'Os 2 hábitos de hoje estão feitos.',
    )
  })
})
