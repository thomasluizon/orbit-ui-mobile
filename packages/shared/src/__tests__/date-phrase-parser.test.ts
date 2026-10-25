import { describe, expect, it } from 'vitest'
import { parseDatePhrase } from '../utils/date-phrase-parser'

const referenceDate = '2026-10-20'
const parse = (phrase: string, locale = 'pt-BR', reference = referenceDate, timeZone: string | null | undefined = 'America/Sao_Paulo') => parseDatePhrase(phrase, { referenceDate: reference, locale, timeZone })

describe('calendar date phrases', () => {
  it.each([
    ['domingo', 'sun', '2026-10-25'], ['segunda-feira', 'mon', '2026-10-26'],
    ['terça-feira', 'tue', '2026-10-27'], ['quarta-feira', 'wed', '2026-10-21'],
    ['quinta-feira', 'thu', '2026-10-22'], ['sexta-feira', 'fri', '2026-10-23'],
    ['sábado', 'sat', '2026-10-24'],
  ])('resolves %s and %s against the account calendar', (portuguese, english, date) => {
    expect(parse(portuguese, 'pt-BR')).toEqual({ status: 'resolved', date })
    expect(parse(english, 'en')).toEqual({ status: 'resolved', date })
    expect(parse(`próxima ${portuguese}`, 'pt-BR')).toEqual({ status: 'resolved', date })
    expect(parse(`next ${english}`, 'en')).toEqual({ status: 'resolved', date })
  })
  it.each([
    ['3/11/2027', 'pt-BR', '2027-11-03'], ['11/3/2027', 'en', '2027-11-03'],
    ['fim do mês', 'pt-BR', '2028-02-29'], ['end of month', 'en', '2028-02-29'],
  ])('handles numeric years and leap month ends: %s', (phrase, locale, date) => {
    expect(parse(phrase, locale, '2028-02-01')).toEqual({ status: 'resolved', date })
  })

  it.each([
    ['dia 26', 'pt-BR', '2026-10-26'], ['on the 26th', 'en', '2026-10-26'],
    ['hoje', 'pt-BR', referenceDate], ['today', 'en', referenceDate], ['dia 3', 'pt-BR', '2026-11-03'], ['on the 3rd', 'en', '2026-11-03'], ['3/11', 'pt-BR', '2026-11-03'], ['3/11', 'en', '2027-03-11'], ['11/3', 'en', '2026-11-03'], ['fim do mês', 'pt-BR', '2026-10-31'], ['end of the month', 'en', '2026-10-31'], ['depois de amanhã', 'pt-BR', '2026-10-22'], ['day after tomorrow', 'en', '2026-10-22'], ['daqui a 12 dias', 'pt-BR', '2026-11-01'], ['em 2 semanas', 'pt-BR', '2026-11-03'], ['in 2 weeks', 'en', '2026-11-03'], ['tomorrow', 'en', '2026-10-21'],
    ['amanhã', 'pt-BR', '2026-10-21'], ['em 12 dias', 'pt-BR', '2026-11-01'],
    ['in 12 days', 'en', '2026-11-01'], ['26 de outubro', 'pt-BR', '2026-10-26'],
    ['October 26, 2026', 'en', '2026-10-26'], ['2026-10-26', 'en', '2026-10-26'],
    ['dia 20', 'pt-BR', referenceDate], ['dia 19', 'pt-BR', '2026-11-19'],
  ])('resolves %s without a provider', (phrase, locale, date) => {
    expect(parse(phrase, locale)).toEqual({ status: 'resolved', date })
  })
  it.each(['31 de fevereiro', 'February 31', '2026-02-29', '2026-13-01', 'dia 32', '31/2', '13/13', 'in 9999999999999999 weeks'])('rejects impossible %s', (phrase) => {
    expect(parse(phrase).status).toBe('invalid')
  })
  it.each(['2026/03/04', '03-04'])('does not guess numeric %s', (phrase) => {
    expect(parse(phrase).status).toBe('ambiguous')
  })
  it.each(['segunda', 'segunda-feira', 'seg', 'próxima segunda', 'monday', 'mon', 'next monday'])('takes the next weekday for %s even on Monday', (phrase) => {
    expect(parse(phrase, 'pt-BR', '2026-10-26')).toEqual({ status: 'resolved', date: '2026-11-02' })
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
