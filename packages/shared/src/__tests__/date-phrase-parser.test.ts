import { describe, expect, it } from 'vitest'
import { parseDatePhrase } from '../utils/date-phrase-parser'

const referenceDate = '2026-10-20'
const parse = (phrase: string, locale = 'pt-BR', reference = referenceDate, timeZone: string | null | undefined = 'America/Sao_Paulo') => parseDatePhrase(phrase, { referenceDate: reference, locale, timeZone })

describe('calendar date phrases', () => {
  it.each([
    ['dia 26', 'pt-BR', '2026-10-26'], ['on the 26th', 'en', '2026-10-26'],
    ['hoje', 'pt-BR', referenceDate], ['tomorrow', 'en', '2026-10-21'],
    ['amanhã', 'pt-BR', '2026-10-21'], ['em 12 dias', 'pt-BR', '2026-11-01'],
    ['in 12 days', 'en', '2026-11-01'], ['26 de outubro', 'pt-BR', '2026-10-26'],
    ['October 26, 2026', 'en', '2026-10-26'], ['2026-10-26', 'en', '2026-10-26'],
    ['dia 20', 'pt-BR', referenceDate], ['dia 19', 'pt-BR', '2026-11-19'],
  ])('resolves %s without a provider', (phrase, locale, date) => {
    expect(parse(phrase, locale)).toEqual({ status: 'resolved', date })
  })
  it.each(['31 de fevereiro', 'February 31', '2026-02-29', '2026-13-01', 'dia 32'])('rejects impossible %s', (phrase) => {
    expect(parse(phrase).status).toBe('invalid')
  })
  it.each(['03/04', '03/04/2026', '2026/03/04'])('does not guess numeric %s', (phrase) => {
    expect(parse(phrase).status).toBe('ambiguous')
  })
  it('keeps unsupported, empty and unavailable account context distinct', () => {
    expect(parse('after my vacation').status).toBe('unsupported')
    expect(parse('').status).toBe('empty')
    expect(parseDatePhrase('tomorrow', { referenceDate, locale: 'en', timeZone: undefined }).status).toBe('unavailable')
    expect(parseDatePhrase('tomorrow', { referenceDate, locale: 'en', timeZone: null })).toEqual({ status: 'resolved', date: '2026-10-21' })
  })
  it.each([
    ['tomorrow', '2026-12-31', '2027-01-01'], ['tomorrow', '2028-02-28', '2028-02-29'],
    ['tomorrow', '2026-03-07', '2026-03-08'], ['in 2 days', '2026-10-31', '2026-11-02'],
    ['dia 31', '2026-04-01', '2026-05-31'], ['February 29', '2026-10-20', '2028-02-29'],
  ])('uses calendar arithmetic for %s from %s', (phrase, reference, date) => {
    expect(parse(phrase, 'en', reference, 'America/New_York')).toEqual({ status: 'resolved', date })
  })
})
