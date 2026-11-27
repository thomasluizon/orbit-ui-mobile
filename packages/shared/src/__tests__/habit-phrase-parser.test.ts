import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildOnboardingScheduleFromPhrase } from '../utils/onboarding'
import { getHabitPhraseTitle } from '../utils/habit-phrase-title'
import { readHabitRecurrencePhrase } from '../utils/habit-recurrence-phrase'
import { readDateWeekday } from '../utils/date-phrase-parser'
import { isWeeklyRecurrencePhrase, readHabitPhrase as parseHabitPhrase, readTypedHabitPhrase, segmentHabitPhrase } from '../utils/habit-phrase-parser'

function readHabitPhrase(...[input, locale]: Parameters<typeof parseHabitPhrase>) {
  const read = parseHabitPhrase(input, locale)
  let cursor = 0
  for (const token of read.consumed) {
    expect(token.start).toBeGreaterThanOrEqual(cursor)
    expect(token.end).toBeGreaterThan(token.start)
    expect(token.end).toBeLessThanOrEqual(input.length)
    cursor = token.end
  }
  expect(segmentHabitPhrase(input, read.consumed).map((segment) => segment.text).join('')).toBe(input)
  return read
}

interface PhraseCase {
  input: string
  locale: 'en' | 'pt-BR'
  cadence: 'daily' | 'fixed' | 'flexible' | null
  quantity?: number
  days?: string[]
  interval?: number
  time?: string
}

const cases: PhraseCase[] = [
  { input: 'Correr 12 vezes na semana', locale: 'pt-BR', cadence: 'flexible', quantity: 12 },
  { input: 'Correr 3 vezes na semana', locale: 'pt-BR', cadence: 'flexible', quantity: 3 },
  { input: 'correr 3 VEZES POR SEMANA', locale: 'pt-BR', cadence: 'flexible', quantity: 3 },
  { input: 'Ler 1 vez por semana', locale: 'pt-BR', cadence: 'flexible', quantity: 1 },
  { input: 'Caminhar uma vez por semana', locale: 'pt-BR', cadence: 'flexible', quantity: 1 },
  { input: 'Beber agua duas vezes na semana', locale: 'pt-BR', cadence: 'flexible', quantity: 2 },
  { input: 'Alongar 20x semana', locale: 'pt-BR', cadence: 'flexible', quantity: 20 },
  { input: 'Ler terca e quinta as 8h30', locale: 'pt-BR', cadence: 'fixed', days: ['Tuesday', 'Thursday'], time: '08:30' },
  { input: 'Correr térça e quínta', locale: 'pt-BR', cadence: 'fixed', days: ['Tuesday', 'Thursday'] },
  { input: 'LER SEGUNDA-FEIRA', locale: 'pt-BR', cadence: 'fixed', days: ['Monday'] },
  { input: 'Meditar no domingo', locale: 'pt-BR', cadence: 'fixed', days: ['Sunday'] },
  { input: 'Correr sabado e domingo', locale: 'pt-BR', cadence: 'fixed', days: ['Saturday', 'Sunday'] },
  { input: 'Meditar todos os dias às 7', locale: 'pt-BR', cadence: 'daily', time: '07:00' },
  { input: 'alongar diariamente 21:15', locale: 'pt-BR', cadence: 'daily', time: '21:15' },
  { input: 'terça, quarta e quinta a cada 2 semanas', locale: 'pt-BR', cadence: 'fixed', days: ['Tuesday', 'Wednesday', 'Thursday'], interval: 2 },
  { input: '3 vezes por semana a cada 3 semanas', locale: 'pt-BR', cadence: 'flexible', quantity: 3, interval: 3 },
  { input: 'Run 12 times a week', locale: 'en', cadence: 'flexible', quantity: 12 },
  { input: 'RUN 3 TIMES A WEEK', locale: 'en', cadence: 'flexible', quantity: 3 },
  { input: 'Read once a week', locale: 'en', cadence: 'flexible', quantity: 1 },
  { input: 'Stretch twice per week', locale: 'en', cadence: 'flexible', quantity: 2 },
  { input: 'Journal 15x a week', locale: 'en', cadence: 'flexible', quantity: 15 },
  { input: 'Read tuesdays and thursdays at 8:30', locale: 'en', cadence: 'fixed', days: ['Tuesday', 'Thursday'], time: '08:30' },
  { input: 'walk sat and sun at 7pm', locale: 'en', cadence: 'fixed', days: ['Saturday', 'Sunday'], time: '19:00' },
  { input: 'Meditate every day at 7', locale: 'en', cadence: 'daily', time: '07:00' },
  { input: 'tuesday wednesday thursday every 2 weeks', locale: 'en', cadence: 'fixed', days: ['Tuesday', 'Wednesday', 'Thursday'], interval: 2 },
  { input: '3 times a week every 3 weeks', locale: 'en', cadence: 'flexible', quantity: 3, interval: 3 },
  { input: 'Beber água quando der', locale: 'pt-BR', cadence: null },
  { input: 'Drink coffee without sugar every Monday at 8', locale: 'en', cadence: 'fixed', days: ['Monday'], time: '08:00' },
  { input: 'Ler sem celular na segunda às 8', locale: 'pt-BR', cadence: 'fixed', days: ['Monday'], time: '08:00' },
  { input: 'Do not smoke on Monday at 8', locale: 'en', cadence: 'fixed', days: ['Monday'], time: '08:00' },
  { input: 'Não fumar na segunda às 8', locale: 'pt-BR', cadence: 'fixed', days: ['Monday'], time: '08:00' },
]

it('preserves complete reads from the existing corpus across normalized variants', () => {
  const reads = cases.flatMap(({ input, locale }) => [
    input, input.toUpperCase(), input.toLowerCase(), input.normalize('NFD'),
    input.normalize('NFD').replace(/\p{M}/gu, ''), input.replaceAll(' ', '\t  '),
    `  ${input}  `, `🧘 ${input}`,
  ].map((variant) => ({ input: variant, locale, read: readHabitPhrase(variant, locale) })))
  expect(reads).toHaveLength(248)
  expect(createHash('sha256').update(JSON.stringify(reads)).digest('hex')).toMatchInlineSnapshot(`"b8a861bba12f2641c37058334ad6ae2e1c35745bdd99cffa26218b37161f5384"`)
})

it.each([
  ['Escolher aneis corretos', 'pt-BR'],
  ['Get ready for the run', 'en'],
  ['Ler todos os dias exceto segunda', 'pt-BR'],
  ['Run except Monday', 'en'],
  ['Read next Monday', 'en'],
] as const)('reads scheduling without guessing an emoji for %s', (phrase, locale) => {
  expect(readHabitPhrase(phrase, locale)).not.toHaveProperty('emoji')
})

describe('recurrence-only wording', () => {
  it.each(['toda semana', 'todas as semanas', 'semanalmente', 'every week', 'weekly'])('recognizes %s with safe casing, whitespace and punctuation', (phrase) => {
    for (const value of [phrase, `  ${phrase.toUpperCase().replaceAll(' ', '\t  ')}.  `, `! ${phrase} ?`]) {
      expect(isWeeklyRecurrencePhrase(value)).toBe(true)
      for (const locale of ['en', 'pt-BR'] as const) {
        const read = readHabitPhrase(value, locale)
        expect(read).toMatchObject({ cadence: null, dueTime: null, consumed: [] })
        expect(segmentHabitPhrase(value, read.consumed)).toEqual([{ text: value, consumed: false }])
      }
    }
  })

  it.each(['', 'week', 'biweekly', 'every 2 weeks', '3 times a week', 'every week tomorrow', 'tomorrow every week', 'toda semana segunda', 'toda semana às 8', 'weekly report', 'Read weekly', 'todas semanas', 'weekly\u200b', 'weekly '.repeat(1000)])('leaves unsupported or mixed wording unchanged: %s', (phrase) => {
    expect(isWeeklyRecurrencePhrase(phrase)).toBe(false)
  })
})

describe('readHabitPhrase', () => {
  it.each([
    { locale: 'en', invalid: 'at 1.5pm', valid: 'at 1pm', dueTime: '13:00' },
    { locale: 'en', invalid: 'at 13:30.5', valid: 'at 13:30', dueTime: '13:30' },
    { locale: 'en', invalid: '1.5pm', valid: '1pm', dueTime: '13:00' },
    { locale: 'en', invalid: '1.5:30', valid: '5:30', dueTime: '05:30' },
    { locale: 'en', invalid: '13:30.5', valid: '13:30', dueTime: '13:30' },
    { locale: 'en', invalid: '1.5h', valid: '5h', dueTime: '05:00' },
    { locale: 'en', invalid: '13h.5', valid: '13h', dueTime: '13:00' },
    { locale: 'en', invalid: '1pm.5', valid: '1pm', dueTime: '13:00' },
    { locale: 'pt-BR', invalid: 'às 1,5h', valid: 'às 13h', dueTime: '13:00' },
    { locale: 'pt-BR', invalid: 'às 13:30,5', valid: 'às 13:30', dueTime: '13:30' },
    { locale: 'pt-BR', invalid: '1,5h', valid: '5h', dueTime: '05:00' },
    { locale: 'pt-BR', invalid: '1,5:30', valid: '5:30', dueTime: '05:30' },
    { locale: 'pt-BR', invalid: '13:30,5', valid: '13:30', dueTime: '13:30' },
    { locale: 'pt-BR', invalid: '13h,5', valid: '13h', dueTime: '13:00' },
  ] as const)('keeps decimal clock $invalid unresolved and valid clock $valid intact', ({ locale, invalid, valid, dueTime }) => {
    for (const punctuation of ['', '.', ',']) {
      const input = `${valid}${punctuation}`
      const read = readHabitPhrase(input, locale)
      expect(read.dueTime).toBe(dueTime)
      expect(read.consumed).toEqual([{ start: 0, end: valid.length, kind: 'time' }])
    }
    for (const decimal of ['1.5 km', '1,5 km']) {
      expect(readHabitPhrase(decimal, locale)).toMatchObject({ dueTime: null, consumed: [] })
    }
    const read = readHabitPhrase(invalid, locale)
    expect(read).toMatchObject({ dueTime: null, consumed: [] })
    expect(segmentHabitPhrase(invalid, read.consumed)).toEqual([{ text: invalid, consumed: false }])
  })

  it.each([
    ['Read every day at 8h30', '08:30'],
    ['Read every day 08h30', '08:30'],
    ['Read every day at 8h', '08:00'],
    ['Read every day 21h', '21:00'],
  ])('consumes English h-clock forms: %s', (input, dueTime) => {
    for (const variant of [input.toUpperCase(), input.toLowerCase()]) {
      const read = readHabitPhrase(variant, 'en')
      expect(read).toMatchObject({ cadence: 'daily', dueTime })
      expect(read.consumed.filter((token) => token.kind === 'time')).toHaveLength(1)
    }
  })

  it.each([9, 12, 99, 999])('accepts a positive weekly count of %s in both locales', (quantity) => {
    expect(readHabitPhrase(`Run ${quantity} times a week`, 'en').frequencyQuantity).toBe(quantity)
    expect(readHabitPhrase(`Correr ${quantity} vezes na semana`, 'pt-BR').frequencyQuantity).toBe(quantity)
  })

  it.each(cases)('reads case and accent variants of $input', ({ input, locale, cadence, quantity, days, interval, time }) => {
    for (const variant of [input.toUpperCase(), input.toLowerCase(), input.normalize('NFD'), input.normalize('NFD').replace(/\p{M}/gu, '')]) {
      expect(readHabitPhrase(variant, locale)).toMatchObject({ cadence, frequencyQuantity: quantity ?? null, days: days ?? [], intervalWeeks: interval ?? null, dueTime: time ?? null })
    }
  })

  it.each(['Run 0 times a week', 'Run 000 times a week'])('leaves nonpositive counts unresolved: %s', (input) => {
    expect(readHabitPhrase(input, 'en')).toMatchObject({ cadence: null, frequencyQuantity: null, consumed: [] })
  })

  it.each([
    ['toda sexta às 3 da tarde', 'pt-BR', 'toda sexta às 3 da tarde'],
    ['academia toda sexta às 8 da noite', 'pt-BR', 'academia toda sexta às 8 da noite'],
    ['gym every friday at 3 in the afternoon', 'en', 'every friday at 3 in the afternoon'],
    ['Read every day at 9 in the morning', 'en', 'every day at 9 in the morning'],
    ['Academia toda sexta às 15h da tarde', 'pt-BR', 'toda sexta às 15h da tarde'],
  ] as const)('keeps the part of the day inside the time token: %s', (input, locale, consumedText) => {
    const consumed = readHabitPhrase(input, locale).consumed
    const time = consumed.find((token) => token.kind === 'time')!
    expect(input.slice(time.start, time.end)).toBe(consumedText.slice(consumedText.search(/(?:às|at) \d/u)))
  })

  it.each([
    ['at 15 in the morning', 'en'],
    ['at 0 in the afternoon', 'en'],
    ['at 00:30 in the evening', 'en'],
    ['at 15pm', 'en'],
    ['às 15h da manhã', 'pt-BR'],
    ['às 15:00 da madrugada', 'pt-BR'],
    ['às 0h da tarde', 'pt-BR'],
  ] as const)('leaves an hour that disagrees with the part of the day unresolved: %s', (input, locale) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({ dueTime: null, consumed: [] })
  })

  it.each([
    ['às 15h da tarde', 'pt-BR', '15:00'],
    ['15h da tarde', 'pt-BR', '15:00'],
    ['às 20h da noite', 'pt-BR', '20:00'],
    ['às 21h30 da noite', 'pt-BR', '21:30'],
    ['às 15:00 da tarde', 'pt-BR', '15:00'],
    ['15:00 da tarde', 'pt-BR', '15:00'],
    ['às 0h30 da madrugada', 'pt-BR', '00:30'],
    ['às 0h30 da manhã', 'pt-BR', '00:30'],
    ['às 0h da noite', 'pt-BR', '00:00'],
    ['at 13 in the afternoon', 'en', '13:00'],
    ['at 15:00 in the afternoon', 'en', '15:00'],
    ['15:00 in the afternoon', 'en', '15:00'],
    ['at 19h in the evening', 'en', '19:00'],
    ['at 22:00 at night', 'en', '22:00'],
    ['at 0 in the morning', 'en', '00:00'],
    ['at 00:00 at night', 'en', '00:00'],
  ] as const)('keeps a 24-hour hour that agrees with the part of the day: %s', (input, locale, dueTime) => {
    const read = readHabitPhrase(input, locale)
    expect(read.dueTime).toBe(dueTime)
    expect(read.consumed).toEqual([{ start: 0, end: input.length, kind: 'time' }])
  })

  it.each([
    ['Almoço todo dia ao meio-dia e meia', 'ao meio-dia e meia'],
    ['Almoço todo dia meio-dia e meia', 'meio-dia e meia'],
    ['Almoço todo dia ao meio-dia e meio', 'ao meio-dia e meio'],
  ])('reads half past noon inside the time token: %s', (input, timeText) => {
    const read = readHabitPhrase(input, 'pt-BR')
    expect(read).toMatchObject({ cadence: 'daily', dueTime: '12:30' })
    const time = read.consumed.find((token) => token.kind === 'time')!
    expect(input.slice(time.start, time.end)).toBe(timeText)
  })

  it.each([
    ['ao meio-dia e quinze', 'pt-BR'],
    ['ao meio-dia e 15', 'pt-BR'],
    ['ao meio-dia e um quarto', 'pt-BR'],
    ['ao meio-dia menos quinze', 'pt-BR'],
    ['ao meio-dia menos meia hora', 'pt-BR'],
    ['quinze para o meio-dia', 'pt-BR'],
    ['dez pro meio-dia', 'pt-BR'],
    ['meia hora antes do meio-dia', 'pt-BR'],
    ['20 minutos depois do meio-dia', 'pt-BR'],
    ['at half past noon', 'en'],
    ['at quarter to noon', 'en'],
    ['10 minutes before noon', 'en'],
    ['an hour after noon', 'en'],
    ['at half-past noon', 'en'],
    ['fifteen past noon', 'en'],
    ['ten till noon', 'en'],
    ['5 mins until noon', 'en'],
  ] as const)('does not save noon for a time that is an offset from noon: %s', (input, locale) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({ dueTime: null, consumed: [] })
  })

  it.each([
    ['dez para ao meio-dia', 'pt-BR'],
    ['quinze para as meio-dia', 'pt-BR'],
    ['meia hora antes ao meio-dia', 'pt-BR'],
  ] as const)('does not save noon for an offset before a noon word with an article: %s', (input, locale) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({ dueTime: null, consumed: [] })
  })

  it.each([
    ['Ler todo dia ao meio-dia e meia-noite', 'pt-BR'],
    ['Ler todo dia ao meio-dia menos domingo', 'pt-BR'],
    ['Ler todo dia para o meio-dia', 'pt-BR'],
    ['Treinar rapidez para o meio-dia', 'pt-BR'],
    ['Walk to noon mass every day', 'en'],
  ] as const)('keeps plain noon when the next words are not an offset: %s', (input, locale) => {
    expect(readHabitPhrase(input, locale).dueTime).toBe('12:00')
  })

  it.each([
    { input: 'toda sexta às 3 da tarde', locale: 'pt-BR', cadence: 'fixed', days: ['Friday'], time: '15:00' },
    { input: 'toda sexta às 8 da noite', locale: 'pt-BR', cadence: 'fixed', days: ['Friday'], time: '20:00' },
    { input: 'academia toda sexta às 3 da tarde', locale: 'pt-BR', cadence: 'fixed', days: ['Friday'], time: '15:00' },
    { input: 'gym every friday at 3 in the afternoon', locale: 'en', cadence: 'fixed', days: ['Friday'], time: '15:00' },
    { input: 'Meditar todo dia às 9 da manhã', locale: 'pt-BR', cadence: 'daily', days: [], time: '09:00' },
    { input: 'Meditar todo dia às 5 da madrugada', locale: 'pt-BR', cadence: 'daily', days: [], time: '05:00' },
    { input: 'Ler todo dia às 9h30 da noite', locale: 'pt-BR', cadence: 'daily', days: [], time: '21:30' },
    { input: 'Ler todo dia às 12 da noite', locale: 'pt-BR', cadence: 'daily', days: [], time: '00:00' },
    { input: 'Ler todo dia ao meio-dia', locale: 'pt-BR', cadence: 'daily', days: [], time: '12:00' },
    { input: 'Ler todo dia às 15h', locale: 'pt-BR', cadence: 'daily', days: [], time: '15:00' },
    { input: 'Meditate every day at 9 in the morning', locale: 'en', cadence: 'daily', days: [], time: '09:00' },
    { input: 'Read every day at 7 in the evening', locale: 'en', cadence: 'daily', days: [], time: '19:00' },
    { input: 'Read every day at 10 at night', locale: 'en', cadence: 'daily', days: [], time: '22:00' },
    { input: 'Read every day at 8:30 in the evening', locale: 'en', cadence: 'daily', days: [], time: '20:30' },
    { input: 'Read every day at noon', locale: 'en', cadence: 'daily', days: [], time: '12:00' },
    { input: 'Read every day at 3 pm', locale: 'en', cadence: 'daily', days: [], time: '15:00' },
  ] as const)('reads the part of the day after the hour: $input', ({ input, locale, cadence, days, time }) => {
    for (const variant of [input, input.toUpperCase(), input.normalize('NFD').replace(/\p{M}/gu, '')]) {
      expect(readHabitPhrase(variant, locale)).toMatchObject({ cadence, days, dueTime: time })
    }
  })

  it.each([
    ['Ler às 6 da manhãzinha', 'pt-BR', '06:00', 'Ler da manhãzinha'],
    ['Caminhar todo dia às 5 da tardezinha', 'pt-BR', '05:00', 'Caminhar da tardezinha'],
    ['Ler todo dia às 8 da noitezinha', 'pt-BR', '08:00', 'Ler da noitezinha'],
    ['Ler 7:30 da madrugadinha', 'pt-BR', '07:30', 'Ler da madrugadinha'],
    ['Ler 7h da manhãs', 'pt-BR', '07:00', 'Ler da manhãs'],
  ] as const)('keeps a longer word after the hour out of the time token: %s', (input, locale, dueTime, title) => {
    expect(readHabitPhrase(input, locale).dueTime).toBe(dueTime)
    expect(getHabitPhraseTitle(input, locale)).toBe(title)
  })

  it.each([
    ['Remédio do meio-dia às 12h30', 'pt-BR', '12:30'],
    ['Remédio do meio-dia 12:30', 'pt-BR', '12:30'],
    ['Caminhar depois do meio-dia às 14h', 'pt-BR', '14:00'],
    ['Noon meds at 12:30', 'en', '12:30'],
    ['Walk after noon at 2pm', 'en', '14:00'],
    ['Ler todo dia ao meio-dia e 18h', 'pt-BR', '18:00'],
  ] as const)('reads an explicit clock time before a noon word: %s', (input, locale, dueTime) => {
    expect(readHabitPhrase(input, locale).dueTime).toBe(dueTime)
  })

  it.each([
    ['Remédio do meio-dia às 12h30', 'pt-BR', 'Remédio do meio-dia'],
    ['Noon meds at 12:30', 'en', 'Noon meds'],
  ] as const)('keeps the noon word in the title when a clock time exists: %s', (input, locale, title) => {
    expect(getHabitPhraseTitle(input, locale)).toBe(title)
  })

  it.each(['at 8:99', 'at 8:3', 'at 13pm', 'at 0am', 'at 7:30:20'])('does not consume part of an invalid clock: %s', (input) => {
    expect(readHabitPhrase(input, 'en')).toMatchObject({ dueTime: null, consumed: [] })
  })

  it.each(['às 8:99', 'às 8:3', 'às 8h99', '21:15:30'])('does not consume part of an invalid Portuguese clock: %s', (input) => {
    expect(readHabitPhrase(input, 'pt-BR')).toMatchObject({ dueTime: null, consumed: [] })
  })

  it.each(['segundas-feiras', 'terças-feiras', 'quartas-feiras', 'quintas-feiras', 'sextas-feiras'])('consumes the entire plural weekday: %s', (input) => {
    const read = readHabitPhrase(input, 'pt-BR')
    expect(read.cadence).toBe('fixed')
    expect(segmentHabitPhrase(input, read.consumed)).toEqual([{ text: input, consumed: true }])
  })

  it('includes trailing decomposed accents in highlighted spans', () => {
    const input = 'LER SEGUNDA-FEIRÁ'.normalize('NFD')
    const segments = segmentHabitPhrase(input, readHabitPhrase(input, 'pt-BR').consumed)
    expect(segments).toEqual([{ text: 'LER ', consumed: false }, { text: 'SEGUNDA-FEIRÁ'.normalize('NFD'), consumed: true }])
  })

  it.each(cases)('reads $input', ({ input, locale, cadence, quantity, days, interval, time }) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({
      cadence,
      frequencyQuantity: quantity ?? null,
      days: days ?? [],
      intervalWeeks: interval ?? null,
      dueTime: time ?? null,
    })
  })

  it('gives weekdays precedence and leaves the count unconsumed', () => {
    const input = 'Correr terça e quinta 3 vezes na semana'
    const read = readHabitPhrase(input, 'pt-BR')
    expect(read).toMatchObject({ cadence: 'fixed', days: ['Tuesday', 'Thursday'], frequencyQuantity: null })
    expect(read.consumed.map((token) => token.kind)).toEqual(['weekday', 'weekday'])
    expect(segmentHabitPhrase(input, read.consumed).filter((segment) => !segment.consumed).map((segment) => segment.text).join('')).toContain('3 vezes na semana')
  })

  it('does not mistake the Portuguese verb ter for Tuesday', () => {
    expect(readHabitPhrase('Ter foco 3 vezes por semana', 'pt-BR')).toMatchObject({
      cadence: 'flexible',
      days: [],
      frequencyQuantity: 3,
    })
  })

  it('keeps original indices after accent removal and whitespace collapse', () => {
    const input = '  TERÇA,   QUINTA às 8h30  '
    const segments = segmentHabitPhrase(input, readHabitPhrase(input, 'pt-BR').consumed)
    expect(segments.map((segment) => segment.text).join('')).toBe(input)
    expect(segments.filter((segment) => segment.consumed).map((segment) => segment.text)).toEqual(['TERÇA', 'QUINTA', 'às 8h30'])
  })

  it('keeps UTF-16 token offsets exact after a supplementary character', () => {
    const input = '🏃 Run Monday at 8'
    const read = readHabitPhrase(input, 'en')
    expect(read.consumed).toEqual([
      { start: 7, end: 13, kind: 'weekday' },
      { start: 14, end: 18, kind: 'time' },
    ])
    expect(read.consumed.every((token) => Number.isFinite(token.start) && Number.isFinite(token.end))).toBe(true)
    const segments = segmentHabitPhrase(input, read.consumed)
    expect(segments.map((segment) => segment.text).join('')).toBe(input)
    expect(segments.filter((segment) => segment.consumed).map((segment) => segment.text)).toEqual(['Monday', 'at 8'])
  })

  it('does not treat a weekly count as a clock time', () => {
    expect(readHabitPhrase('Run 3 times a week', 'en').dueTime).toBeNull()
  })

  it('does not claim a cadence from an activity name alone', () => {
    expect(readHabitPhrase('Correr', 'pt-BR')).toMatchObject({
      cadence: null,
      days: [],
      frequencyQuantity: null,
      intervalWeeks: null,
      dueTime: null,
      consumed: [],
    })
  })

  it('leaves invalid clock times unresolved', () => {
    expect(readHabitPhrase('Drink water at 27:80', 'en')).toMatchObject({ cadence: null, dueTime: null, consumed: [] })
  })

  it('leaves a repeat interval above the API maximum unconsumed', () => {
    const input = 'Run Tuesday every 53 weeks'
    const read = readHabitPhrase(input, 'en')
    expect(read).toMatchObject({ cadence: 'fixed', intervalWeeks: null })
    expect(segmentHabitPhrase(input, read.consumed).filter((segment) => !segment.consumed).map((segment) => segment.text).join('')).toContain('every 53 weeks')
  })
})

const everyDay = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

describe('weekday negation', () => {
  it.each([
    ['en', 'Read every day except for Sunday'],
    ['en', 'Read not this Sunday'],
    ['en', 'Read but not next Saturday'],
    ['pt-BR', 'Ler todo dia exceto no próximo domingo'],
    ['pt-BR', 'Ler não no próximo domingo'],
    ['pt-BR', 'Ler menos neste sábado'],
  ] as const)('leaves qualified weekday negation unresolved across consumers: %s %s', (locale, input) => {
    const read = readHabitPhrase(input, locale)
    expect(read).toMatchObject({ cadence: null, days: [], intervalWeeks: null, consumed: [] })
    expect(segmentHabitPhrase(input, read.consumed)).toEqual([{ text: input, consumed: false }])
    expect(buildOnboardingScheduleFromPhrase(input, locale)).toMatchObject({ days: [], frequencyUnit: null, isGeneral: true })
    expect(readTypedHabitPhrase(input, locale, 'habit', false)).toMatchObject({ cadence: null, days: [], consumed: [] })
    expect(getHabitPhraseTitle(input, locale)).toBe(input)
    expect(readHabitRecurrencePhrase(input)).toBeNull()
    expect(readDateWeekday(input)).toBeNull()
  })

  it.each([
    { locale: 'en', activity: 'Read', negations: ['except', 'except for', 'but not', 'not', 'never', 'excluding', 'without', "don't", 'cannot'], weekdays: ['for Sunday', 'this Sunday', 'next Sunday', 'on this Sunday', 'on the next Sunday', 'in the coming Sundays', 'on the following Tuesdays'], clock: 'at 8' },
    { locale: 'pt-BR', activity: 'Ler', negations: ['menos', 'exceto', 'sem ser', 'não', 'nunca', 'tirando', 'salvo', 'sem'], weekdays: ['o próximo domingo', 'no próximo domingo', 'neste domingo', 'nesse domingo', 'em um próximo domingo', 'nas próximas terças-feiras'], clock: 'às 8' },
  ] as const)('retains qualified negated weekdays and an independent clock in $locale', ({ locale, activity, negations, weekdays, clock }) => {
    for (const negation of negations) {
      for (const weekday of weekdays) {
        const phrase = `${activity} ${negation} ${weekday} ${clock}`
        for (const input of [phrase, phrase.toUpperCase(), phrase.normalize('NFD'), phrase.replaceAll(' ', '\t  ')]) {
          const read = readHabitPhrase(input, locale)
          expect(read, input).toMatchObject({ cadence: null, days: [], intervalWeeks: null, dueTime: '08:00' })
          expect(read.consumed.map((token) => token.kind), input).toEqual(['time'])
          const unread = segmentHabitPhrase(input, read.consumed).filter((segment) => !segment.consumed).map((segment) => segment.text).join('')
          expect(unread.toLowerCase().normalize('NFD').replace(/\s+/gu, ' '), input).toContain(weekday.toLowerCase().normalize('NFD'))
          expect(buildOnboardingScheduleFromPhrase(input, locale), input).toMatchObject({ days: [], frequencyUnit: null, isGeneral: true, dueTime: '08:00' })
        }
      }
    }
  })

  it.each([
    ['en', 'Meditate every day except Sunday at 8 and Saturday'],
    ['pt-BR', 'Meditar todo dia menos domingo às 8 e sábado'],
  ] as const)('keeps clock and exclusion spans disjoint: %s %s', (locale, input) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({ cadence: 'fixed', days: everyDay.slice(0, 5), dueTime: '08:00' })
  })

  it.each([
    ['en', 'Read not on Monday at 8'],
    ['pt-BR', 'Ler não na segunda às 8'],
  ] as const)('preserves an independent clock when the weekday is unresolved: %s %s', (locale, input) => {
    const read = readHabitPhrase(input, locale)
    expect(read).toMatchObject({ cadence: null, days: [], dueTime: '08:00' })
    expect(read.consumed.map((token) => token.kind)).toEqual(['time'])
    expect(buildOnboardingScheduleFromPhrase(input, locale)).toMatchObject({ days: [], isGeneral: true, dueTime: '08:00' })
    expect(readTypedHabitPhrase(input, locale, 'task', false)).toMatchObject({ cadence: null, days: [], dueTime: '08:00', consumed: read.consumed })
    expect(getHabitPhraseTitle(input, locale, { cadence: false, dueTime: false })).toBe(input)
  })

  it.each([
    ['en', 'Meditate without a phone every day except Sunday at 8'],
    ['pt-BR', 'Meditar sem celular todo dia menos domingo às 8'],
  ] as const)('keeps activity negation separate from an exclusion: %s %s', (locale, input) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({ cadence: 'fixed', days: everyDay.slice(0, 6), dueTime: '08:00' })
  })

  it('keeps token spans sorted and disjoint and round-trips clock placements and normalized variants', () => {
    for (const [locale, activity, schedule, clocks, separator, lastDay] of [
      ['en', '🧘 Meditate', 'every day except Sunday', ['at 8', '08:30', '7pm'], 'and', 'Saturday'],
      ['pt-BR', '🧘 Meditar', 'todo dia menos domingo', ['às 8', '08:30', '21h'], 'e', 'sábado'],
    ] as const) {
      for (const clock of clocks) {
        for (const input of [
          `${activity} ${clock} ${schedule} ${separator} ${lastDay}`,
          `${activity} ${schedule} ${clock} ${separator} ${lastDay}`,
          `${activity} ${schedule} ${separator} ${clock} ${lastDay}`,
          `${activity} ${schedule} ${separator} ${lastDay} ${clock}`,
        ]) {
          for (const variant of [input, input.toUpperCase(), input.normalize('NFD'), input.replaceAll(' ', '\t  ')]) {
            expect(readHabitPhrase(variant, locale).cadence).toBe('fixed')
          }
        }
      }
    }
  })

  it.each([
    ['en', 'every day except Sunday', ['Sunday']],
    ['en', 'every day except Sundays', ['Sunday']],
    ['en', 'every day but not on Saturday', ['Saturday']],
    ['en', 'every day except Saturdays and Sundays', ['Saturday', 'Sunday']],
    ['en', 'except Sundays', ['Sunday']],
    ['en', 'but not on Saturday', ['Saturday']],
    ['pt-BR', 'todo dia menos domingo', ['Sunday']],
    ['pt-BR', 'todos os dias menos aos domingos', ['Sunday']],
    ['pt-BR', 'todo dia exceto sábado', ['Saturday']],
    ['pt-BR', 'todo dia sem ser domingo', ['Sunday']],
    ['pt-BR', 'todos os dias exceto sábados e domingos', ['Saturday', 'Sunday']],
    ['pt-BR', 'exceto sábado', ['Saturday']],
    ['pt-BR', 'sem ser domingo', ['Sunday']],
    ['pt-BR', 'menos às terças-feiras', ['Tuesday']],
  ] as const)('excludes weekdays across schedule readers: %s %s', (locale, phrase, excluded) => {
    const days = everyDay.filter((day) => !excluded.some((excludedDay) => excludedDay === day))
    for (const input of [phrase, phrase.toUpperCase(), phrase.normalize('NFD'), phrase.replaceAll(' ', '\t  ')]) {
      const read = readHabitPhrase(input, locale)
      expect(read).toMatchObject({ cadence: 'fixed', days })
      expect(readTypedHabitPhrase(input, locale, 'habit', false)).toMatchObject({ cadence: 'fixed', days })
      expect(segmentHabitPhrase(input, read.consumed).filter((segment) => !segment.consumed).map((segment) => segment.text).join('').trim()).toBe('')
      expect(buildOnboardingScheduleFromPhrase(input, locale)).toMatchObject({ days, isGeneral: false })
      expect(readHabitRecurrencePhrase(input)).toMatchObject({ schedule: { days, unit: 'Day' } })
      expect(readDateWeekday(input)).toBeNull()
    }
  })

  it.each([
    ['pt-BR', 'Meditar dez minutos depois do café, menos aos domingos'],
    ['pt-BR', 'Meditar todo dia menos domingo quando chover'],
    ['pt-BR', 'Correr três vezes por semana, exceto sábado'],
    ['pt-BR', 'segunda mas não domingo'],
    ['pt-BR', 'não aos domingos'],
    ['en', 'Run every other day except Sunday'],
    ['en', 'Run every day except Sunday when it rains'],
    ['en', 'Monday but not on Saturday'],
    ['en', 'not on Sundays'],
    ['en', 'no Sundays'],
    ['en', 'Do not run every day except Sunday'],
    ['pt-BR', 'Não meditar todo dia menos domingo'],
    ['en', 'weekends except Sundays'],
    ['en', 'every day except Sunday or Monday'],
    ['en', 'every day except Monday, Tuesday, Wednesday, Thursday, Friday, Saturday and Sunday'],
  ] as const)('leaves uncertain scope intact: %s %s', (locale, input) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({ cadence: null, days: [], intervalWeeks: null, consumed: [] })
    expect(buildOnboardingScheduleFromPhrase(input, locale)).toMatchObject({ days: [], isGeneral: true })
    expect(readTypedHabitPhrase(input, locale, 'habit', false)).toMatchObject({ cadence: null, days: [], consumed: [] })
    expect(getHabitPhraseTitle(input, locale)).toBe(input)
    expect(readHabitRecurrencePhrase(input)).toBeNull()
    expect(readDateWeekday(input)).toBeNull()
  })

  it.each([
    ['pt-BR', 'Meditar todo dia menos aos domingos às 8h', 'Meditar'],
    ['en', 'Meditate every day except Sundays at 8', 'Meditate'],
  ] as const)('consumes the complete exclusion without leaving negation in the title: %s', (locale, input, title) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({ cadence: 'fixed', days: everyDay.slice(0, 6), dueTime: '08:00' })
    expect(getHabitPhraseTitle(input, locale)).toBe(title)
  })
})


describe('weekday qualifiers', () => {
  const weeklySuffixes = [
    ['en', 'Read Friday every week at 8', 'Friday', 'Read'],
    ['en', 'Read Friday each week at 8', 'Friday', 'Read'],
    ['en', 'Read Friday per week at 8', 'Friday', 'Read'],
    ['en', 'Read Friday a week at 8', 'Friday', 'Read'],
    ['pt-BR', 'Ler sexta a cada semana às 8', 'Friday', 'Ler'],
    ['pt-BR', 'Ler sexta de cada semana às 8', 'Friday', 'Ler'],
    ['pt-BR', 'Ler toda segunda de cada semana às 8', 'Monday', 'Ler'],
    ['pt-BR', 'Ler sexta toda semana às 8', 'Friday', 'Ler'],
    ['pt-BR', 'Ler sexta todas as semanas às 8', 'Friday', 'Ler'],
    ['pt-BR', 'Ler sexta por semana às 8', 'Friday', 'Ler'],
  ] as const

  it.each(weeklySuffixes)('keeps a plain weekly suffix in the weekday read: %s %s', (locale, sentence, day) => {
    for (const input of [sentence, sentence.toUpperCase(), sentence.normalize('NFD'), sentence.replaceAll(' ', '\t  ')]) {
      const read = readHabitPhrase(input, locale)
      expect(read).toMatchObject({ cadence: 'fixed', days: [day], frequencyQuantity: null, intervalWeeks: null, dueTime: '08:00' })
      expect(read.consumed.map((token) => token.kind)).toEqual(['weekday', 'interval', 'time'])
      expect(readTypedHabitPhrase(input, locale, 'habit', false)).toEqual(read)
    }
  })

  it.each(weeklySuffixes)('keeps a plain weekly suffix in the onboarding schedule: %s %s', (locale, input, day) => {
    expect(buildOnboardingScheduleFromPhrase(input, locale)).toEqual({
      frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: 1,
      days: [day], isGeneral: false, isFlexible: false, dueTime: '08:00',
    })
  })

  it.each(weeklySuffixes)('removes an applied plain weekly suffix from the title: %s %s', (locale, sentence, _day, title) => {
    for (const input of [sentence, sentence.toUpperCase(), sentence.normalize('NFD'), sentence.replaceAll(' ', '\t  ')]) {
      expect(getHabitPhraseTitle(input, locale).toLowerCase().normalize('NFC')).toBe(title.toLowerCase())
      expect(getHabitPhraseTitle(input, locale, { cadence: true, dueTime: true }).toLowerCase().normalize('NFC')).toBe(title.toLowerCase())
      expect(getHabitPhraseTitle(input, locale, { cadence: false, dueTime: false })).toBe(input)
    }
  })

  it.each([
    ['en', 'Read Friday every 2 weeks at 8'],
    ['pt-BR', 'Ler sexta a cada 2 semanas às 8'],
  ] as const)('keeps a numbered weekday interval across consumers: %s %s', (locale, input) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({ cadence: 'fixed', days: ['Friday'], intervalWeeks: 2, dueTime: '08:00' })
    expect(buildOnboardingScheduleFromPhrase(input, locale)).toMatchObject({ days: ['Friday'], intervalWeeks: 2, dueTime: '08:00', isGeneral: false })
    expect(getHabitPhraseTitle(input, locale)).toBe(locale === 'en' ? 'Read' : 'Ler')
  })

  it.each([
    ['en', 'Read every other Friday and every Monday', 'at 8'],
    ['en', 'Read every Monday and every other Friday', 'at 8'],
    ['en', 'Read every other Friday and each Monday', 'at 8'],
    ['en', 'Read every other Friday and every Friday', 'at 8'],
    ['pt-BR', 'Ler sexta sim, sexta não e toda segunda', 'às 8'],
    ['pt-BR', 'Ler toda segunda e sexta sim, sexta não', 'às 8'],
    ['pt-BR', 'Ler sexta sim, sexta não e toda sexta', 'às 8'],
    ['pt-BR', 'Ler na sexta semana sim, semana não e toda segunda', 'às 8'],
    ['pt-BR', 'Ler toda segunda e semana sim, semana não na sexta', 'às 8'],
  ] as const)('leaves mixed weekly and alternating weekdays unresolved across consumers: %s %s', (locale, phrase, clock) => {
    const sentences = [`${phrase} ${clock}`, `${clock} ${phrase}`, phrase.replace(/ (and|e) /u, ` $1 ${clock} `)]
    for (const input of sentences.flatMap((sentence) => [sentence, sentence.toUpperCase(), sentence.normalize('NFD'), sentence.replaceAll(' ', '\t  ')])) {
      const read = readHabitPhrase(input, locale)
      expect(read).toMatchObject({ cadence: null, days: [], intervalWeeks: null, frequencyQuantity: null, dueTime: '08:00' })
      expect(read.consumed.map((token) => token.kind)).toEqual(['time'])
      expect(buildOnboardingScheduleFromPhrase(input, locale)).toEqual({
        frequencyUnit: null, frequencyQuantity: null, intervalWeeks: 1,
        days: [], isGeneral: true, isFlexible: false, dueTime: '08:00',
      })
      expect(readTypedHabitPhrase(input, locale, 'habit', false)).toEqual(read)
      const title = getHabitPhraseTitle(input, locale)
      expect(title.toLowerCase().normalize('NFC')).toBe(phrase.toLowerCase())
      expect(getHabitPhraseTitle(input, locale, { cadence: false, dueTime: false })).toBe(input)
    }
  })

  it.each([
    ['pt-BR', 'Limpar o quarto toda sexta às 8', 'Friday', 'Limpar o quarto'],
    ['pt-BR', 'Limpar o quarto na sexta às 8', 'Friday', 'Limpar o quarto'],
    ['pt-BR', 'Ler no quarto na segunda às 8', 'Monday', 'Ler no quarto'],
    ['pt-BR', 'Limpar o quarto todas as sextas às 8', 'Friday', 'Limpar o quarto'],
    ['pt-BR', 'Ler sexta em quarto separado às 8', 'Friday', 'Ler em quarto separado'],
    ['en', 'Clean the fourth room every Friday at 8', 'Friday', 'Clean the fourth room'],
    ['en', 'Clean the fourth room on Friday at 8', 'Friday', 'Clean the fourth room'],
    ['en', 'Read Friday in the last room at 8', 'Friday', 'Read in the last room'],
    ['en', 'Read Friday for the first class at 8', 'Friday', 'Read for the first class'],
  ] as const)('keeps activity words outside the weekday construction across consumers: %s %s', (locale, sentence, day, title) => {
    for (const input of [sentence, sentence.toUpperCase(), sentence.normalize('NFD'), sentence.replaceAll(' ', '\t  ')]) {
      const read = readHabitPhrase(input, locale)
      expect(read).toMatchObject({ cadence: 'fixed', days: [day], intervalWeeks: null, dueTime: '08:00' })
      expect(read.consumed.map((token) => token.kind)).toEqual(['weekday', 'time'])
      expect(buildOnboardingScheduleFromPhrase(input, locale)).toEqual({
        frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: 1,
        days: [day], isGeneral: false, isFlexible: false, dueTime: '08:00',
      })
      expect(readTypedHabitPhrase(input, locale, 'habit', false)).toEqual(read)
      expect(getHabitPhraseTitle(input, locale).toLowerCase().normalize('NFC')).toBe(title.toLowerCase())
    }
  })

  it.each([
    ['en', 'Read every other Friday and every other Monday at 8', ['Friday', 'Monday']],
    ['en', 'Read every other Friday and Monday at 8', ['Friday', 'Monday']],
    ['pt-BR', 'Ler sexta sim, sexta não e segunda sim, segunda não às 8', ['Friday', 'Monday']],
    ['pt-BR', 'Ler semana sim, semana não na sexta e segunda às 8', ['Friday', 'Monday']],
    ['pt-BR', 'Ler na sexta e segunda semana sim, semana não às 8', ['Friday', 'Monday']],
  ] as const)('keeps alternation when it governs every named weekday: %s %s', (locale, input, days) => {
    const read = readHabitPhrase(input, locale)
    expect(read).toMatchObject({ cadence: 'fixed', days, intervalWeeks: 2, dueTime: '08:00' })
    expect(buildOnboardingScheduleFromPhrase(input, locale)).toMatchObject({ days, intervalWeeks: 2, dueTime: '08:00', isGeneral: false })
    expect(getHabitPhraseTitle(input, locale)).toBe(locale === 'en' ? 'Read' : 'Ler')
  })

  const unresolved: Array<[PhraseCase['locale'], string]> = [
    ['pt-BR', 'Ligar para minha mãe no primeiro domingo de cada mês'],
    ['en', 'Call mom on the first Sunday of every month'],
    ['pt-BR', 'Ir à feira no segundo sábado do mês'],
    ['en', 'Call grandma on the last Sunday of the month'],
    ['en', 'Read next Monday'],
    ['en', 'Read every third Friday'],
    ['en', 'Read alternate Fridays'],
    ['en', 'Read Friday monthly'],
    ['en', 'Read Friday of every month'],
    ['en', 'Read Friday every month'],
    ['en', 'Read Friday in odd weeks'],
    ['en', 'Read Friday odd weeks'],
    ['en', 'Read Friday even weeks'],
    ['en', 'Read Friday in even weeks'],
    ['en', 'Read Friday every odd week'],
    ['en', 'Read Friday each even week'],
    ['pt-BR', 'Ler na próxima segunda'],
    ['pt-BR', 'Ler nas sextas alternadas'],
    ['pt-BR', 'Ler sexta mensalmente'],
    ['pt-BR', 'Ler sexta de cada mês'],
    ['pt-BR', 'Ler sexta em semanas pares'],
    ['pt-BR', 'Ler sexta semanas pares'],
    ['pt-BR', 'Ler sexta semanas ímpares'],
    ['pt-BR', 'Ler sexta em semanas ímpares'],
    ['pt-BR', 'Ler sexta em semanas alternadas'],
    ['pt-BR', 'Ler sexta sim, sábado não'],
    ['en', 'Read every other Friday every 3 weeks'],
    ['pt-BR', 'Ler sexta sim, sexta não a cada 3 semanas'],
  ]

  it.each(unresolved)('retains unsupported weekday qualifiers across consumers: %s %s', (locale, phrase) => {
    for (const input of [phrase, phrase.toUpperCase(), phrase.normalize('NFD'), phrase.replaceAll(' ', '\t  ')]) {
      const read = readHabitPhrase(input, locale)
      expect(read).toMatchObject({ cadence: null, days: [], frequencyQuantity: null, intervalWeeks: null, consumed: [] })
      expect(buildOnboardingScheduleFromPhrase(input, locale)).toMatchObject({ days: [], frequencyUnit: null, isGeneral: true })
      expect(readTypedHabitPhrase(input, locale, 'habit', false)).toEqual(read)
      expect(getHabitPhraseTitle(input, locale)).toBe(input)
    }
  })

  it.each([
    { locale: 'en', ordinals: ['first', 'second', 'third', 'fourth', 'last', 'fifth', '1st'], endings: ['of the month', 'of every month', 'each month'] },
    { locale: 'pt-BR', ordinals: ['primeiro', 'segundo', 'terceiro', 'quarto', 'último', 'quinto', '1º'], endings: ['de cada mês', 'do mês'] },
  ] as const)('leaves monthly ordinals unresolved and preserves an independent clock in $locale', ({ locale, ordinals, endings }) => {
    const weekday = locale === 'en' ? 'Sunday' : 'domingo'
    const clock = locale === 'en' ? 'at 8' : 'às 8'
    for (const ordinal of ordinals) {
      for (const ending of endings) {
        const input = `🧘 ${ordinal} ${weekday} ${ending} ${clock}`
        const read = readHabitPhrase(input, locale)
        expect(read).toMatchObject({ cadence: null, days: [], intervalWeeks: null, dueTime: '08:00' })
        expect(read.consumed.map((token) => token.kind)).toEqual(['time'])
      }
    }
  })

  it.each([
    ['en', 'Review finances every other Friday', 'Friday', 'Review finances'],
    ['pt-BR', 'Revisar as finanças sexta sim, sexta não', 'Friday', 'Revisar as finanças'],
    ['pt-BR', 'Revisar as finanças semana sim, semana não na sexta', 'Friday', 'Revisar as finanças'],
    ['pt-BR', 'Revisar as finanças na sexta semana sim, semana não', 'Friday', 'Revisar as finanças'],
    ['pt-BR', 'Ler segunda-feira sim, segunda-feira não', 'Monday', 'Ler'],
    ['pt-BR', 'Ler terça sim terça não', 'Tuesday', 'Ler'],
    ['en', 'Read every other Sunday', 'Sunday', 'Read'],
  ] as const)('reads alternating weekdays as every two weeks: %s %s', (locale, phrase, day, title) => {
    const equivalent = locale === 'en' ? `every 2 weeks on ${day}` : `a cada duas semanas na ${phrase.includes('sexta') ? 'sexta' : day === 'Monday' ? 'segunda' : 'terça'}`
    for (const input of [phrase, phrase.toUpperCase(), phrase.normalize('NFD'), phrase.replaceAll(' ', '\t  ')]) {
      const read = readHabitPhrase(input, locale)
      expect(read).toMatchObject({ cadence: 'fixed', days: [day], intervalWeeks: 2, frequencyQuantity: null })
      expect(buildOnboardingScheduleFromPhrase(input, locale)).toEqual(buildOnboardingScheduleFromPhrase(equivalent, locale))
      expect(readTypedHabitPhrase(input, locale, 'habit', false)).toEqual(read)
      expect(getHabitPhraseTitle(input, locale).toLowerCase().normalize('NFC')).toBe(title.toLowerCase())
      expect(read.consumed.some((token) => token.kind === 'interval')).toBe(true)
    }
  })

  it('keeps adjacent Portuguese weekday names as weekly lists', () => {
    const weekdays = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']
    for (const first of weekdays) {
      for (const second of weekdays) {
        const expected = [...new Set([
          ...readHabitPhrase(first, 'pt-BR').days, ...readHabitPhrase(second, 'pt-BR').days,
        ])]
        expect(readHabitPhrase(`Ler ${first} ${second}`, 'pt-BR')).toMatchObject({ cadence: 'fixed', days: expected, intervalWeeks: null })
      }
    }
  })

  it.each([
    ['en', '🧘 Read every other Friday at 8', 'Friday'],
    ['pt-BR', '🧘 Ler sexta sim, sexta não às 8', 'Friday'],
    ['pt-BR', '🧘 Ler semana sim, semana não na terça às 8', 'Tuesday'],
  ] as const)('keeps alternating cadence and clock tokens disjoint: %s %s', (locale, input, day) => {
    const read = readHabitPhrase(input, locale)
    expect(read).toMatchObject({ cadence: 'fixed', days: [day], intervalWeeks: 2, dueTime: '08:00' })
    expect(read.consumed.map((token) => token.kind).sort((left, right) => left.localeCompare(right))).toEqual(['interval', 'time', 'weekday'])
  })
})

describe('weekday ranges', () => {
  const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const workWeek = WEEK.slice(0, 5)

  it.each([
    ['pt-BR', 'segunda a sexta'],
    ['pt-BR', 'de segunda-feira a sexta-feira'],
    ['pt-BR', 'segunda à sexta'],
    ['pt-BR', 'academia de segunda a sexta'],
    ['pt-BR', 'segunda até sexta'],
    ['pt-BR', 'seg a sex'],
    ['en', 'monday to friday'],
    ['en', 'monday through friday'],
    ['en', 'monday-friday'],
    ['en', 'monday \u2013 friday'],
    ['en', 'gym from monday until friday'],
  ] as const)('reads %s "%s" as every day of the range', (locale, input) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({ cadence: 'fixed', days: workWeek, intervalWeeks: null })
  })

  it('wraps a range across the end of the week', () => {
    expect(readHabitPhrase('sexta a segunda', 'pt-BR').days).toEqual(['Friday', 'Saturday', 'Sunday', 'Monday'])
    expect(readHabitPhrase('saturday to sunday', 'en').days).toEqual(['Saturday', 'Sunday'])
  })

  it.each([
    ['pt-BR', 'academia de segunda a segunda', 'Monday'],
    ['pt-BR', 'trabalhar de domingo a domingo', 'Sunday'],
    ['en', 'gym monday to monday', 'Monday'],
  ] as const)('reads %s "%s" as all seven days', (locale, input, firstDay) => {
    const week = [...WEEK, ...WEEK].slice(WEEK.indexOf(firstDay), WEEK.indexOf(firstDay) + 7)
    const read = readHabitPhrase(input, locale)
    expect(read).toMatchObject({ cadence: 'fixed' })
    expect(read.days).toEqual(week)
  })

  it('keeps the title of a same-day range clean', () => {
    expect(getHabitPhraseTitle('gym monday to monday', 'en', { cadence: true, dueTime: true })).toBe('gym')
  })

  it('keeps a range next to a list and a time', () => {
    expect(readHabitPhrase('academia segunda a quarta e sábado às 7', 'pt-BR')).toMatchObject({
      days: ['Monday', 'Tuesday', 'Wednesday', 'Saturday'], dueTime: '07:00',
    })
    expect(readHabitPhrase('gym monday through friday at 7am', 'en')).toMatchObject({ days: workWeek, dueTime: '07:00' })
  })

  it('consumes the whole range as one weekday token', () => {
    const input = 'academia segunda a sexta'
    const read = readHabitPhrase(input, 'pt-BR')
    expect(read.consumed).toEqual([{ start: 9, end: input.length, kind: 'weekday' }])
    expect(getHabitPhraseTitle(input, 'pt-BR', { cadence: true, dueTime: true })).toBe('academia')
  })

  it.each([
    ['en', 'gym monday at 7am through friday'],
    ['pt-BR', 'academia segunda às 7 a sexta'],
  ] as const)('keeps the range and its time as tokens that do not overlap in %s "%s"', (locale, input) => {
    const read = parseHabitPhrase(input, locale)
    expect(read).toMatchObject({ days: workWeek, dueTime: '07:00' })
    read.consumed.slice(1).forEach((token, index) => {
      expect(token.start).toBeGreaterThanOrEqual(read.consumed[index]!.end)
    })
    expect(segmentHabitPhrase(input, read.consumed).map((segment) => segment.text).join('')).toBe(input)
  })

  it.each([
    ['pt-BR', 'academia seg-qua-sex', ['Monday', 'Wednesday', 'Friday']],
    ['pt-BR', 'academia seg.-qua.-sex.', ['Monday', 'Wednesday', 'Friday']],
    ['pt-BR', 'academia segunda-quarta-sexta', ['Monday', 'Wednesday', 'Friday']],
    ['pt-BR', 'academia seg - qua - sex', ['Monday', 'Wednesday', 'Friday']],
    ['pt-BR', 'academia terça-quinta-sábado', ['Tuesday', 'Thursday', 'Saturday']],
    ['en', 'gym mon-wed-fri', ['Monday', 'Wednesday', 'Friday']],
    ['en', 'gym monday-wednesday-friday', ['Monday', 'Wednesday', 'Friday']],
    ['en', 'gym tue-thu-sat', ['Tuesday', 'Thursday', 'Saturday']],
  ] as const)('reads a dash list of three days in %s "%s" as only the named days', (locale, input, days) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({ cadence: 'fixed', days })
  })

  it.each([
    ['pt-BR', 'academia de segunda ao sábado', WEEK.slice(0, 6)],
    ['pt-BR', 'academia de segunda ao domingo', WEEK],
    ['pt-BR', 'academia de segunda até ao domingo', WEEK],
    ['pt-BR', 'academia seg. a sex.', workWeek],
    ['pt-BR', 'academia seg. à sex.', workWeek],
    ['en', 'gym mon.-fri.', workWeek],
    ['en', 'gym mon. to fri.', workWeek],
  ] as const)('reads a range with ao or a dotted short name in %s "%s"', (locale, input, days) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({ cadence: 'fixed', days })
  })

  it.each([
    ['pt-BR', 'segunda feira a sexta feira', workWeek],
    ['pt-BR', 'de segunda feira à sexta feira', workWeek],
    ['pt-BR', 'segunda feira até sexta feira', workWeek],
    ['pt-BR', 'terça feira a quinta feira', WEEK.slice(1, 4)],
    ['pt-BR', 'academia das segundas às sextas', workWeek],
    ['pt-BR', 'academia de segunda às sexta', workWeek],
    ['en', 'gym monday til friday', workWeek],
    ['en', "gym monday 'til friday", workWeek],
    ['en', 'gym monday through to friday', workWeek],
  ] as const)('reads a range with feira, às, til or through to in %s "%s"', (locale, input, days) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({ cadence: 'fixed', days })
  })

  it('keeps a weekly suffix after a range', () => {
    const read = readHabitPhrase('monday to friday every 2 weeks', 'en')
    expect(read).toMatchObject({ days: workWeek, intervalWeeks: 2 })
  })

  it('does not read a range in a typed task', () => {
    expect(readTypedHabitPhrase('segunda a sexta', 'pt-BR', 'task', false)).toMatchObject({ cadence: null, days: [] })
  })
})

describe('spoken part of the day', () => {
  it.each([
    ['pt-BR', 'toda sexta às 3 da tarde', '15:00'],
    ['pt-BR', 'academia toda sexta às 3 da tarde', '15:00'],
    ['pt-BR', 'toda sexta às 8 da noite', '20:00'],
    ['pt-BR', 'sexta, às 9 da noite', '21:00'],
    ['pt-BR', 'toda sexta às 9 da manhã', '09:00'],
    ['pt-BR', 'toda sexta às 12 da noite', '00:00'],
    ['pt-BR', 'toda sexta às 12 da tarde', '12:00'],
    ['pt-BR', 'toda sexta às 4 da madrugada', '04:00'],
    ['pt-BR', 'toda sexta às 3:30 da tarde', '15:30'],
    ['pt-BR', 'toda sexta às 3h30 da tarde', '15:30'],
    ['pt-BR', 'toda sexta 3 da tarde', '15:00'],
    ['en', 'gym every friday at 3 in the afternoon', '15:00'],
    ['en', 'every friday at 8 at night', '20:00'],
    ['en', 'every friday at 8 in the evening', '20:00'],
    ['en', 'every friday at 9 in the morning', '09:00'],
    ['en', 'every friday at 3:15 in the afternoon', '15:15'],
    ['en', 'every friday at 12 at night', '00:00'],
  ] as const)('reads %s "%s" as %s', (locale, input, time) => {
    const read = readHabitPhrase(input, locale)
    expect(read).toMatchObject({ cadence: 'fixed', days: ['Friday'], dueTime: time })
    expect(getHabitPhraseTitle(`Read ${input}`, locale, { cadence: true, dueTime: true })).toMatch(/^Read(?: academia| gym)?$/u)
  })

  it.each([
    ['pt-BR', 'toda sexta às 13 da tarde', '13:00'],
    ['pt-BR', 'academia toda sexta às 14h da tarde', '14:00'],
    ['pt-BR', 'toda sexta às 20h da noite', '20:00'],
    ['pt-BR', 'toda sexta às 20:00 da noite', '20:00'],
    ['pt-BR', 'toda sexta às 0h30 da madrugada', '00:30'],
    ['en', 'every friday at 13 in the afternoon', '13:00'],
    ['en', 'gym every friday at 15:30 in the afternoon', '15:30'],
    ['en', 'every friday at 20:00 in the evening', '20:00'],
  ] as const)('keeps a 24-hour time that its part of the day agrees with in %s "%s"', (locale, input, time) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({ days: ['Friday'], dueTime: time })
    expect(getHabitPhraseTitle(`Read ${input}`, locale, { cadence: true, dueTime: true })).toMatch(/^Read(?: academia| gym)?$/u)
  })

  it.each([
    ['pt-BR', 'toda sexta às 12 da manhã'],
    ['pt-BR', 'toda sexta às 14h da manhã'],
    ['pt-BR', 'toda sexta às 14h da noite'],
    ['en', 'every friday at 14:00 in the morning'],
    ['en', 'every friday at 14:00 at night'],
  ] as const)('reads no time from the contradicting words in %s "%s"', (locale, input) => {
    expect(readHabitPhrase(input, locale).dueTime).toBeNull()
  })

  it.each([
    ['pt-BR', 'academia toda sexta às 6 da manhãzinha', '06:00', 'academia da manhãzinha'],
    ['en', 'gym every friday at 7 in the mornings', '07:00', 'gym in the mornings'],
  ] as const)('keeps a longer word that starts with a period word in %s "%s"', (locale, input, time, title) => {
    expect(readHabitPhrase(input, locale).dueTime).toBe(time)
    expect(getHabitPhraseTitle(input, locale, { cadence: true, dueTime: true })).toBe(title)
  })

  it.each([
    ['pt-BR', 'toda sexta às 9 horas da noite', '21:00'],
    ['pt-BR', 'toda sexta às 9 à noite', '21:00'],
    ['pt-BR', 'toda sexta às 3 horas da tarde', '15:00'],
    ['pt-BR', 'toda sexta às 3 à tarde', '15:00'],
    ['en', 'every friday at 3 o\'clock in the afternoon', '15:00'],
    ['en', 'every friday at 9 o\'clock at night', '21:00'],
    ['en', 'every friday at 3 o’clock in the afternoon', '15:00'],
    ['en', 'every friday at 9 o’clock at night', '21:00'],
  ] as const)('reads the part of the day after horas, à or o\'clock in %s "%s" as %s', (locale, input, time) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({ cadence: 'fixed', days: ['Friday'], dueTime: time })
    expect(getHabitPhraseTitle(`Read ${input}`, locale, { cadence: true, dueTime: true })).toBe('Read')
  })

  it.each([
    ['pt-BR', 'toda sexta às 9 hrs da noite'],
    ['pt-BR', 'toda sexta às 9 hs da noite'],
    ['pt-BR', 'toda sexta às 9 h da noite'],
    ['en', 'every friday at 9 oclock at night'],
  ] as const)('reads the part of the day after a short hour word in %s "%s"', (locale, input) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({ cadence: 'fixed', days: ['Friday'], dueTime: '21:00' })
    expect(getHabitPhraseTitle(`Read ${input}`, locale, { cadence: true, dueTime: true })).toBe('Read')
  })

  it('lets am and pm win over a part of the day', () => {
    expect(readHabitPhrase('every friday at 3pm in the afternoon', 'en').dueTime).toBe('15:00')
  })
})

describe('a bare number before a part of the day', () => {
  it.each([
    ['tomar remédio toda segunda 1 pela manhã', 'tomar remédio 1 pela manhã'],
    ['vitamina 2 de manhã', 'vitamina 2 de manhã'],
    ['tomar 1 de manhã e 1 à noite', 'tomar 1 de manhã e 1 à noite'],
  ])('reads no time and keeps the words of the dose in "%s"', (input, title) => {
    expect(readHabitPhrase(input, 'pt-BR').dueTime).toBeNull()
    expect(getHabitPhraseTitle(input, 'pt-BR', { cadence: true, dueTime: true })).toBe(title)
  })

  it.each([
    ['toda sexta 3 da tarde', '15:00'],
    ['dormir 11 da noite', '23:00'],
  ])('reads the clock hour in "%s" as %s', (input, time) => {
    expect(readHabitPhrase(input, 'pt-BR').dueTime).toBe(time)
  })
})

describe('weekday range tokens', () => {
  const workWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

  it.each([
    { input: 'Correr segunda a sexta', locale: 'pt-BR' },
    { input: 'Correr de segunda-feira a sexta-feira', locale: 'pt-BR' },
    { input: 'Correr segunda à sexta', locale: 'pt-BR' },
    { input: 'Correr segunda até sexta', locale: 'pt-BR' },
    { input: 'Correr segunda-sexta', locale: 'pt-BR' },
    { input: 'Run monday to friday', locale: 'en' },
    { input: 'Run monday through friday', locale: 'en' },
    { input: 'Run monday-friday', locale: 'en' },
    { input: 'Run Mon - Fri', locale: 'en' },
  ] as const)('reads $input as every day from Monday to Friday', ({ input, locale }) => {
    for (const read of [readHabitPhrase(input, locale), readTypedHabitPhrase(input, locale, 'habit', false)]) {
      expect(read.cadence).toBe('fixed')
      expect(read.days).toEqual(workWeek)
    }
  })

  it.each([
    { input: 'Correr segunda e sexta', locale: 'pt-BR' },
    { input: 'Correr segunda, sexta', locale: 'pt-BR' },
    { input: 'Run monday and friday', locale: 'en' },
  ] as const)('keeps $input as a list of two days', ({ input, locale }) => {
    expect(readTypedHabitPhrase(input, locale, 'habit', false).days).toEqual(['Monday', 'Friday'])
  })

  it.each([
    { input: 'Run mon-wed-fri', locale: 'en', words: ['mon', 'wed', 'fri'] },
    { input: 'Run Mon - Wed - Fri', locale: 'en', words: ['Mon', 'Wed', 'Fri'] },
    { input: 'Run monday to wednesday to friday', locale: 'en', words: ['monday', 'wednesday', 'friday'] },
    { input: 'Correr seg-qua-sex', locale: 'pt-BR', words: ['seg', 'qua', 'sex'] },
    { input: 'Correr segunda a quarta a sexta', locale: 'pt-BR', words: ['segunda', 'quarta', 'sexta'] },
  ] as const)('reads the chain $input as a list and consumes each weekday', ({ input, locale, words }) => {
    const read = readHabitPhrase(input, locale)
    expect(read.days).toEqual(['Monday', 'Wednesday', 'Friday'])
    expect(read.consumed.map((token) => input.slice(token.start, token.end))).toEqual(words)
  })

  it('reads a chain of four weekdays as a list', () => {
    expect(readHabitPhrase('Run mon-tue-thu-fri', 'en').days).toEqual(['Monday', 'Tuesday', 'Thursday', 'Friday'])
  })

  it('wraps a range past Sunday and mixes a range with a list', () => {
    expect(readHabitPhrase('Correr sexta a segunda', 'pt-BR').days).toEqual(['Friday', 'Saturday', 'Sunday', 'Monday'])
    expect(readHabitPhrase('Run monday to wednesday and saturday', 'en').days).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Saturday'])
  })

  it('consumes the whole range and keeps the title words outside it', () => {
    const read = readHabitPhrase('Correr segunda a sexta às 7', 'pt-BR')
    expect(segmentHabitPhrase('Correr segunda a sexta às 7', read.consumed).filter((segment) => !segment.consumed).map((segment) => segment.text)).toEqual(['Correr ', ' '])
    expect(read.dueTime).toBe('07:00')
  })

  it.each([
    { input: 'Correr seg 6h a sex', locale: 'pt-BR', dueTime: '06:00' },
    { input: 'Correr seg às 6h a sex', locale: 'pt-BR', dueTime: '06:00' },
    { input: 'Run mon 7am - fri', locale: 'en', dueTime: '07:00' },
    { input: 'Run monday 7am to friday', locale: 'en', dueTime: '07:00' },
    { input: 'Run mon 7am - fri every week', locale: 'en', dueTime: '07:00' },
  ] as const)('keeps a time inside the range out of the weekday token: $input', ({ input, locale, dueTime }) => {
    const read = readHabitPhrase(input, locale)
    expect(read.days).toEqual(workWeek)
    expect(read.dueTime).toBe(dueTime)
    for (const [index, token] of read.consumed.entries()) {
      expect(token.start).toBeLessThan(token.end)
      if (index > 0) expect(token.start).toBeGreaterThanOrEqual(read.consumed[index - 1]!.end)
    }
    expect(segmentHabitPhrase(input, read.consumed).map((segment) => segment.text).join('')).toBe(input)
  })
})
