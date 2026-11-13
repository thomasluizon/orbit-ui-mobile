import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import {
  buildCalendarOrbitRequest,
  formatCalendarOrbitLine,
  nextCalendarPageTurn,
  resolveCalendarJumpPhrase,
  resolveCalendarOrbitLine,
  type CalendarOrbitLineInput,
  type CalendarOrbitSentence,
} from '../utils'
import en from '../i18n/en.json'
import pt from '../i18n/pt-BR.json'

const TODAY = '2026-11-13'
const done = { status: 'completed' as const }
const open = { status: 'upcoming' as const }
const missed = { status: 'missed' as const }

function input(overrides: Partial<CalendarOrbitLineInput>): CalendarOrbitLineInput {
  return { view: 'month', monthState: 'ready', monthStart: '2026-11-01', rangeLoading: false, span: null, selectedDay: TODAY, todayKey: TODAY, entries: [], ...overrides }
}

describe('resolveCalendarOrbitLine', () => {
  it('names each of the six cases and the future month', () => {
    expect(resolveCalendarOrbitLine(input({ monthState: 'empty' }))).toEqual({ kind: 'monthEmpty', month: '2026-11-01', withYear: false })
    expect(resolveCalendarOrbitLine(input({ monthState: 'future', monthStart: '2027-01-01', selectedDay: '2027-01-01' }))).toEqual({ kind: 'monthFuture', month: '2027-01-01', withYear: true })
    expect(resolveCalendarOrbitLine(input({ entries: [] }))).toEqual({ kind: 'dayNone', day: TODAY })
    expect(resolveCalendarOrbitLine(input({ selectedDay: '2026-11-20', entries: [open, open, open] }))).toEqual({ kind: 'dayFuture', day: '2026-11-20', count: 3 })
    expect(resolveCalendarOrbitLine(input({ entries: [done, done] }))).toEqual({ kind: 'dayFull', day: TODAY })
    expect(resolveCalendarOrbitLine(input({ selectedDay: '2026-11-10', entries: [done, missed] }))).toEqual({ kind: 'dayLoggable', day: '2026-11-10' })
    expect(resolveCalendarOrbitLine(input({ entries: [done, open, open] }))).toEqual({ kind: 'dayPartial', day: TODAY, done: 1, total: 3 })
  })

  it('applies the order when two cases hold at once', () => {
    expect(resolveCalendarOrbitLine(input({ monthState: 'empty', entries: [] }))?.kind).toBe('monthEmpty')
    expect(resolveCalendarOrbitLine(input({ selectedDay: '2026-11-20', entries: [] }))?.kind).toBe('dayNone')
    expect(resolveCalendarOrbitLine(input({ selectedDay: '2026-11-20', entries: [done] }))?.kind).toBe('dayFuture')
    expect(resolveCalendarOrbitLine(input({ selectedDay: '2026-11-10', entries: [done, done] }))?.kind).toBe('dayFull')
    expect(resolveCalendarOrbitLine(input({ selectedDay: '2026-11-10', entries: [done, open] }))?.kind).toBe('dayLoggable')
    expect(resolveCalendarOrbitLine(input({ selectedDay: '2026-10-01', monthStart: '2026-10-01', entries: [done, missed] }))?.kind).toBe('dayPartial')
  })

  it('shows the loading line, and is absent when no day is selected or the day is outside the shown dates', () => {
    expect(resolveCalendarOrbitLine(input({ monthState: 'loading' }))).toEqual({ kind: 'loading' })
    expect(resolveCalendarOrbitLine(input({ view: 'week', rangeLoading: true, span: { from: '2026-11-09', to: '2026-11-15' } }))).toEqual({ kind: 'loading' })
    expect(resolveCalendarOrbitLine(input({ view: 'week', selectedDay: '' }))).toBeNull()
    expect(resolveCalendarOrbitLine(input({ view: 'range', span: { from: '2026-10-01', to: '2026-10-31' } }))).toBeNull()
    expect(resolveCalendarOrbitLine(input({ view: 'agenda', monthState: 'empty', span: { from: '2026-11-13', to: '2026-11-19' }, entries: [done] }))?.kind).toBe('dayFull')
  })
})

const sentences: readonly [CalendarOrbitSentence, string, string][] = [
  [{ kind: 'dayFull', day: '2026-11-02' }, 'The 2nd: all done.', 'Dia 2: tudo feito.'],
  [{ kind: 'dayPartial', day: '2026-11-21', done: 1, total: 3 }, 'The 21st: 1 of 3 done.', 'Dia 21: 1 de 3 feitos.'],
  [{ kind: 'dayPartial', day: '2026-11-13', done: 0, total: 1 }, 'The 13th: 0 of 1 done.', 'Dia 13: 0 de 1 feito.'],
  [{ kind: 'dayLoggable', day: '2026-11-10' }, 'You can still log this day.', 'Ainda dá para registrar esse dia.'],
  [{ kind: 'dayFuture', day: '2026-11-20', count: 1 }, 'Friday has 1 thing planned.', 'Sexta-feira tem 1 coisa marcada.'],
  [{ kind: 'dayFuture', day: '2026-11-20', count: 3 }, 'Friday has 3 things planned.', 'Sexta-feira tem 3 coisas marcadas.'],
  [{ kind: 'dayNone', day: '2026-11-20' }, 'Nothing planned that day.', 'Nada marcado nesse dia.'],
  [{ kind: 'monthEmpty', month: '2026-11-01', withYear: false }, 'Nothing planned in November.', 'Nada marcado em novembro.'],
  [{ kind: 'monthEmpty', month: '2025-11-01', withYear: true }, 'Nothing planned in November 2025.', 'Nada marcado em novembro de 2025.'],
  [{ kind: 'monthFuture', month: '2027-01-01', withYear: true }, 'This month has not arrived yet.', 'Este mês ainda não chegou.'],
]

for (const [locale, messages] of [['en', en], ['pt-BR', pt]] as const) {
  const translate = (key: string, values?: Record<string, string | number>) => {
    const message = key.split('.').reduce<unknown>((entry, segment) => (entry as Record<string, unknown>)[segment], messages)
    return new IntlMessageFormat(String(message), locale).format(values) as string
  }

  describe(`formatCalendarOrbitLine in ${locale}`, () => {
    it.each(sentences)('renders %o with its plural forms', (line, english, portuguese) => {
      expect(formatCalendarOrbitLine(line, locale, translate)).toBe(locale === 'en' ? english : portuguese)
    })

    it('never states the missed count', () => {
      const line = resolveCalendarOrbitLine(input({ selectedDay: '2026-10-01', monthStart: '2026-10-01', entries: [done, missed, missed, missed] }))
      if (!line || line.kind === 'loading') throw new Error('expected a sentence')
      const text = formatCalendarOrbitLine(line, locale, translate)
      expect(text).not.toMatch(/\b3\b/)
      expect(text).toBe(locale === 'en' ? 'The 1st: 1 of 4 done.' : 'Dia 1: 1 de 4 feitos.')
    })

    it('offers the selected day or the shown month to the conversation', () => {
      expect(buildCalendarOrbitRequest({ kind: 'dayFull', day: '2026-11-02' }, locale, translate)).toEqual(locale === 'en'
        ? { id: 'calendar-day:2026-11-02', label: 'November 2', prompt: 'Tell me about November 2 in my calendar.' }
        : { id: 'calendar-day:2026-11-02', label: '2 de novembro', prompt: 'Me fala sobre o dia 2 de novembro no meu calendário.' })
      expect(buildCalendarOrbitRequest({ kind: 'monthEmpty', month: '2026-11-01', withYear: false }, locale, translate)).toEqual(locale === 'en'
        ? { id: 'calendar-month:2026-11-01', label: 'November', prompt: 'Tell me about November in my calendar.' }
        : { id: 'calendar-month:2026-11-01', label: 'Novembro', prompt: 'Me fala sobre novembro no meu calendário.' })
    })
  })
}

describe('nextCalendarPageTurn', () => {
  it('counts a page change and keeps the count through a view switch', () => {
    const start = { view: 'month' as const, page: '2026-11', turns: 0 }
    expect(nextCalendarPageTurn(start, 'month', '2026-11')).toBe(start)
    const turned = nextCalendarPageTurn(start, 'month', '2026-12')
    expect(turned.turns).toBe(1)
    const switched = nextCalendarPageTurn(turned, 'week', '2026-12-07')
    expect(switched.turns).toBe(1)
    expect(nextCalendarPageTurn(switched, 'week', '2026-12-14').turns).toBe(2)
  })
})

describe('resolveCalendarJumpPhrase', () => {
  const context = { monthStart: '2026-12-01', todayKey: TODAY, locale: 'pt-BR', timeZone: 'America/Sao_Paulo' }

  it('reads a bare day inside the shown month', () => {
    expect(resolveCalendarJumpPhrase('dia 20', context)).toBe('2026-12-20')
    expect(resolveCalendarJumpPhrase('Dia 3', context)).toBe('2026-12-03')
    expect(resolveCalendarJumpPhrase('the 20th', { ...context, locale: 'en' })).toBe('2026-12-20')
  })

  it('finds the first day 20 from the shown month that falls on the named weekday', () => {
    expect(resolveCalendarJumpPhrase('sexta, dia 20', context)).toBe('2027-08-20')
    expect(resolveCalendarJumpPhrase('sexta, dia 20', { ...context, monthStart: '2026-11-01' })).toBe('2026-11-20')
    expect(resolveCalendarJumpPhrase('Friday, the 20th', { ...context, locale: 'en' })).toBe('2027-08-20')
  })

  it('reads relative words from today', () => {
    expect(resolveCalendarJumpPhrase('amanhã', context)).toBe('2026-11-14')
    expect(resolveCalendarJumpPhrase('hoje', context)).toBe(TODAY)
  })

  it('returns null for a text that does not resolve', () => {
    expect(resolveCalendarJumpPhrase('qualquer coisa', context)).toBeNull()
    expect(resolveCalendarJumpPhrase('', context)).toBeNull()
    expect(resolveCalendarJumpPhrase('dia 45', context)).toBeNull()
  })
})
