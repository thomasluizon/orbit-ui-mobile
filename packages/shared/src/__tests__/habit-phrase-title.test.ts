import { describe, expect, it, vi } from 'vitest'
import { getHabitPhraseTitle } from '../utils/habit-phrase-title'
import { applyHabitPhraseRead } from '../utils/habit-form-helpers'
import { readHabitPhrase } from '../utils/habit-phrase-parser'

describe('getHabitPhraseTitle', () => {
  it.each([
    ['Alongar 3 vezes por semana', 'pt-BR', 'Alongar'],
    ['Read every day at 8am', 'en', 'Read'],
  ] as const)('removes applied schedule words from %s', (phrase, locale, title) => {
    expect(getHabitPhraseTitle(phrase, locale)).toBe(title)
  })

  it.each([
    ['tabs', '\t'.repeat(50_000), ' '],
    ['mixed separators', ';\t'.repeat(25_000), '; '.repeat(25_000)],
  ])('bounds title cleanup with a long internal run of %s', (_label, separators, normalized) => {
    const sentence = `Read ${separators}a at 8`
    const started = performance.now()
    const title = getHabitPhraseTitle(sentence, 'en')
    const elapsed = performance.now() - started

    expect(title).toBe(`Read ${normalized}a`.replaceAll(/\s+/gu, ' '))
    expect(elapsed).toBeLessThan(500)
  })

  it.each([
    [', ; Read ; , at 8', 'Read'],
    ['Read, ; middle ; , at 8', 'Read, ; middle'],
    [',; at 8 ;,', ',; at 8 ;,'],
  ])('preserves separator trimming and the empty-title fallback: %s', (sentence, title) => {
    expect(getHabitPhraseTitle(sentence, 'en')).toBe(title)
  })

  it.each(['Revisar as finanças sexta sim, sexta não', 'Revisar as finanças sexta'].flatMap((phrase) => [phrase, phrase.normalize('NFD')]))('preserves accented activity words beside a consumed schedule: %s', (phrase) => {
    expect(getHabitPhraseTitle(phrase, 'pt-BR').normalize('NFC')).toBe('Revisar as finanças')
  })

  it('keeps a cadence that the person released', () => {
    expect(getHabitPhraseTitle('Read every day at 8am', 'en', {
      cadence: false,
      dueTime: true,
    })).toBe('Read every day')
    expect(getHabitPhraseTitle('Alongar 3 vezes por semana', 'pt-BR', {
      cadence: false,
      dueTime: false,
    })).toBe('Alongar 3 vezes por semana')
  })

  it('keeps a time that the person released', () => {
    expect(getHabitPhraseTitle('Read every day at 8am', 'en', {
      cadence: true,
      dueTime: false,
    })).toBe('Read at 8am')
  })

  it('keeps an interval after removing the only weekday from a phrase', () => {
    const setOneTime = vi.fn()
    const target = {
      setOneTime,
      setRecurring: vi.fn(),
      setFlexible: vi.fn(),
      setGeneral: vi.fn(),
      setField: vi.fn(),
    }
    const applied = applyHabitPhraseRead(true, readHabitPhrase('Run Monday every 2 weeks', 'en'), false,
      { cadence: false, dueTime: false }, target)
    const finalPhrase = 'Run every 2 weeks'
    const ownership = applyHabitPhraseRead(true, readHabitPhrase(finalPhrase, 'en'), false, applied, target)

    expect(setOneTime).toHaveBeenCalledOnce()
    expect(ownership.cadence).toBe(true)
    expect(getHabitPhraseTitle(finalPhrase, 'en', ownership)).toBe(finalPhrase)
  })

  it('removes an applied time while keeping an unapplied interval', () => {
    expect(getHabitPhraseTitle('Run every 2 weeks at 8am', 'en', {
      cadence: true,
      dueTime: true,
    })).toBe('Run every 2 weeks')
  })

  it.each([
    ['the full form, flag off, keeps it a one-time item with the words in the title', false, 'Run every 2 weeks'],
    ['the guided flow, flag on, makes it a habit every 2 weeks and drops the words', true, 'Run'],
  ] as const)('reads Run every 2 weeks after the only weekday goes: %s', (_path, readsBareInterval, title) => {
    const target = { setOneTime: vi.fn(), setRecurring: vi.fn(), setFlexible: vi.fn(), setGeneral: vi.fn(), setField: vi.fn() }
    const applied = applyHabitPhraseRead(true, readHabitPhrase('Run Monday every 2 weeks', 'en'), false,
      { cadence: false, dueTime: false }, target, readsBareInterval)
    target.setField.mockClear()
    const phrase = 'Run every 2 weeks'
    const ownership = applyHabitPhraseRead(true, readHabitPhrase(phrase, 'en'), false, applied, target, readsBareInterval)

    expect(target.setOneTime).toHaveBeenCalledTimes(readsBareInterval ? 0 : 1)
    expect(target.setField.mock.calls.some(([field, value]) => field === 'frequencyUnit' && value === 'Week')).toBe(readsBareInterval)
    expect(target.setField.mock.calls.some(([field, value]) => field === 'frequencyQuantity' && value === 2)).toBe(readsBareInterval)
    expect(getHabitPhraseTitle(phrase, 'en', ownership, readsBareInterval)).toBe(title)
  })

  it('keeps onboarding interval title stripping', () => {
    expect(getHabitPhraseTitle('Clean every 2 weeks', 'en')).toBe('Clean')
  })

  it.each([
    ['3 vezes por semana', 'pt-BR'],
    ['every day at 8am', 'en'],
  ] as const)('keeps a phrase made only of schedule words: %s', (phrase, locale) => {
    expect(getHabitPhraseTitle(phrase, locale)).toBe(phrase)
  })
})

describe('a title beside a day or a range of days', () => {
  it.each([
    ['academia de segunda a sexta', 'pt-BR', 'academia'],
    ['academia de segunda', 'pt-BR', 'academia'],
    ['academia das segundas às sextas', 'pt-BR', 'academia'],
    ['academia às segundas e às quartas', 'pt-BR', 'academia'],
    ['reunião às 10 da manhã de segunda a sexta', 'pt-BR', 'reunião'],
    ['gym from monday to friday', 'en', 'gym'],
    ['gym from monday', 'en', 'gym'],
  ] as const)('drops the word that opens the days: %s', (phrase, locale, title) => {
    expect(getHabitPhraseTitle(phrase, locale)).toBe(title)
  })

  it.each([
    ['Aula de inglês toda sexta', 'pt-BR', 'Aula de inglês'],
    ['Pagar conta de luz toda sexta', 'pt-BR', 'Pagar conta de luz'],
    ['Class from home every friday', 'en', 'Class from home'],
  ] as const)('keeps a word that belongs to the title: %s', (phrase, locale, title) => {
    expect(getHabitPhraseTitle(phrase, locale)).toBe(title)
  })

  it.each([
    ['academia seg, ter e qui', 'pt-BR', 'academia'],
    ['academia toda seg.', 'pt-BR', 'academia'],
    ['academia seg., qua. e sex.', 'pt-BR', 'academia'],
    ['academia toda sexta feira', 'pt-BR', 'academia'],
    ['gym mon-wed-fri', 'en', 'gym'],
    ['gym every mon.', 'en', 'gym'],
  ] as const)('leaves nothing of a day name: %s', (phrase, locale, title) => {
    expect(getHabitPhraseTitle(phrase, locale)).toBe(title)
  })

  it.each([
    ['gym mon/wed/fri', 'en', 'gym'],
    ['academia segunda/quarta/sexta', 'pt-BR', 'academia'],
    ['Pilates seg/qua', 'pt-BR', 'Pilates'],
    ['academia seg & qua', 'pt-BR', 'academia'],
    ['gym mon + wed', 'en', 'gym'],
    ['Pilates ter/qui', 'pt-BR', 'Pilates'],
    ['academia seg/ter/qui', 'pt-BR', 'academia'],
    ['academia às ter e às qui', 'pt-BR', 'academia'],
  ] as const)('leaves no mark that joined the days: %s', (phrase, locale, title) => {
    expect(getHabitPhraseTitle(phrase, locale)).toBe(title)
  })

  it('keeps a dash, a comma, a slash and an ampersand that join title words', () => {
    expect(getHabitPhraseTitle('Pull-ups, squats every friday', 'en')).toBe('Pull-ups, squats')
    expect(getHabitPhraseTitle('Push/pull every friday', 'en')).toBe('Push/pull')
    expect(getHabitPhraseTitle('Rock & roll every friday', 'en')).toBe('Rock & roll')
  })
})

describe('a title beside a spoken hour', () => {
  it.each([
    ['Ler toda sexta às 9 horas', 'pt-BR', 'Ler'],
    ['Ler toda sexta às 9 h', 'pt-BR', 'Ler'],
    ['Ler toda sexta às 3 e meia da tarde', 'pt-BR', 'Ler'],
    ["Read every friday at 9 o'clock", 'en', 'Read'],
    ['Read every friday at 3 p.m.', 'en', 'Read'],
  ] as const)('removes the whole hour: %s', (phrase, locale, title) => {
    expect(getHabitPhraseTitle(phrase, locale)).toBe(title)
  })
})
